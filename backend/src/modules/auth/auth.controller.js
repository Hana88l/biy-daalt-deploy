const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../../lib/prisma');
const { publishEvent } = require('../../lib/redisPubSub');
const { getPrimaryAdminEmail, isAdminEmail } = require('../../lib/admin');
const { ensureUserSiteState } = require('../analytics/site-registry.service');
const { serializeAiSettings } = require('../ai/ai.service');

const DEFAULT_GOOGLE_CLIENT_ID =
  '112187041198-49vuj0cepfnfkvg1q6i0hpbor1hea3nt.apps.googleusercontent.com';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function serializeUser(siteState) {
  const user = siteState?.user || siteState || {};
  const activeSite = siteState?.activeSite || null;
  const sites = Array.isArray(siteState?.sites) ? siteState.sites : [];

  return {
    id: user.id,
    email: user.email,
    apiKey: user.apiKey,
    siteUrl: activeSite?.url || user.siteUrl || null,
    siteName: activeSite?.name || user.siteName || null,
    lastAnalyzedAt: activeSite?.lastAnalyzedAt || user.lastAnalyzedAt || null,
    activeSiteId: activeSite?.id || null,
    activeSite,
    sites,
    aiSettings: serializeAiSettings(user),
  };
}

async function loadSerializedUser(userId) {
  const state = await ensureUserSiteState(userId);
  if (!state?.user) return null;
  return serializeUser(state);
}

async function recordAuthError(ownerId, properties) {
  const errEvent = await prisma.event.create({
    data: {
      eventName: 'error',
      userId: null,
      properties: {
        source: 'auth',
        action: 'login',
        ...properties
      },
      ownerId
    }
  });
  await publishEvent('live_events', {
    ownerId,
    event: {
      id: errEvent.id,
      eventName: errEvent.eventName,
      userId: errEvent.userId,
      properties: errEvent.properties,
      timestamp: errEvent.timestamp,
    }
  });
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

function getGoogleClientIds() {
  const raw = [process.env.GOOGLE_CLIENT_ID, DEFAULT_GOOGLE_CLIENT_ID]
    .filter(Boolean)
    .join(',');

  return raw
    .split(',')
    .map((clientId) => clientId.trim())
    .filter(Boolean)
    .filter((clientId, index, allClientIds) => allClientIds.indexOf(clientId) === index);
}

function hasAllowedGoogleAudience(aud) {
  const clientIds = getGoogleClientIds();
  if (typeof aud === 'string') {
    return clientIds.includes(aud);
  }

  if (Array.isArray(aud)) {
    return aud.some((value) => clientIds.includes(value));
  }

  return false;
}

async function register(req, res) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    if (isAdminEmail(normalizedEmail)) {
      return res.status(403).json({ error: 'This email is reserved and cannot be registered publicly' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const apiKey = `dp_live_${crypto.randomUUID().replace(/-/g, '')}`;
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        apiKey,
      },
    });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const serializedUser = await loadSerializedUser(user.id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: serializedUser
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      // Unknown email - attach to admin for global error rate visibility (if admin exists)
      try {
        const admin = await prisma.user.findUnique({ where: { email: getPrimaryAdminEmail() } });
        if (admin) {
          await recordAuthError(admin.id, {
            reason: 'unknown_email',
            email: normalizedEmail
          });
        }
      } catch (err) {
        console.error('Failed to record auth error event:', err);
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      // Record auth error for this owner
      try {
        await recordAuthError(user.id, { reason: 'invalid_password' });
        const admin = await prisma.user.findUnique({ where: { email: getPrimaryAdminEmail() } });
        if (admin && admin.id !== user.id) {
          await recordAuthError(admin.id, {
            reason: 'invalid_password',
            userId: user.id,
            email: user.email
          });
        }
      } catch (err) {
        console.error('Failed to record auth error event:', err);
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const serializedUser = await loadSerializedUser(user.id);

    res.json({
      message: 'Login successful',
      token,
      user: serializedUser
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function me(req, res) {
  try {
    const serializedUser = await loadSerializedUser(req.user.userId);

    if (!serializedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: serializedUser });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function logout(req, res) {
  try {
    // In a production app, you might want to:
    // 1. Invalidate the JWT token in Redis
    // 2. Log the logout event
    // 3. Clear any session data
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function googleOAuthCallback(req, res) {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    const decoded = jwt.decode(idToken);

    if (!decoded || typeof decoded !== 'object') {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const email = normalizeEmail(decoded.email);
    const emailVerified = decoded.email_verified;
    const audience = decoded.aud;
    const issuer = decoded.iss;
    const expiresAt = Number(decoded.exp || 0);
    const now = Math.floor(Date.now() / 1000);

    if (!email) {
      return res.status(400).json({ error: 'Google account email is missing' });
    }

    if (emailVerified === false) {
      return res.status(400).json({ error: 'Google account email is not verified' });
    }

    if (!hasAllowedGoogleAudience(audience)) {
      return res.status(400).json({ error: 'Google client ID mismatch' });
    }

    if (!GOOGLE_ISSUERS.has(issuer)) {
      return res.status(400).json({ error: 'Invalid Google token issuer' });
    }

    if (!expiresAt || expiresAt <= now) {
      return res.status(400).json({ error: 'Google token has expired' });
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user && isAdminEmail(email)) {
      return res.status(403).json({ error: 'This Google account is reserved and cannot be auto-provisioned' });
    }
    
    if (!user) {
      const generatedSecret = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(generatedSecret, 10);
      const apiKey = `dp_live_${crypto.randomUUID().replace(/-/g, '')}`;
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          apiKey,
        },
      });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const serializedUser = await loadSerializedUser(user.id);

    res.json({
      message: 'Google login successful',
      token,
      user: serializedUser
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Generate Google OAuth URL for frontend
async function getGoogleAuthUrl(req, res) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    const scope = encodeURIComponent('openid email profile');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    
    res.json({ authUrl });
  } catch (error) {
    console.error('Get Google auth URL error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  register,
  login,
  me,
  logout,
  googleOAuthCallback,
  getGoogleAuthUrl
};
