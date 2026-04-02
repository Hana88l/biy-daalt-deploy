const express = require('express');
const { register, login, me, logout, googleOAuthCallback, getGoogleAuthUrl } = require('./auth.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { createRateLimiter, getClientIp } = require('../../middleware/rate-limit.middleware');

const router = express.Router();
const authKey = (prefix) => (req) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${prefix}:${getClientIp(req)}:${email || 'anonymous'}`;
};

const loginRateLimit = createRateLimiter({
  keyPrefix: 'auth:login',
  key: authKey('auth:login'),
  windowMs: 10 * 60 * 1000,
  maxRequests: 20,
  message: 'Too many login attempts. Please try again later.',
});

const registerRateLimit = createRateLimiter({
  keyPrefix: 'auth:register',
  key: authKey('auth:register'),
  windowMs: 30 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many registration attempts. Please try again later.',
});

const googleRateLimit = createRateLimiter({
  keyPrefix: 'auth:google',
  windowMs: 10 * 60 * 1000,
  maxRequests: 30,
  message: 'Too many Google sign-in attempts. Please try again later.',
});

router.post('/register', registerRateLimit, register);
router.post('/login', loginRateLimit, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

// Google OAuth routes
router.post('/google/callback', googleRateLimit, googleOAuthCallback);
router.get('/google/auth-url', getGoogleAuthUrl);

module.exports = router;
