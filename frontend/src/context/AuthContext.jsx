import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '../utils/api';

const AuthContext = createContext(null);
export const STORAGE_KEY = 'auth_user';

function getInitialUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.token === 'string') return parsed;
  } catch {
    // ignore
  }
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getInitialUser());
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const isAuthenticated = Boolean(user && user.token);

  const refreshUser = async () => {
    if (!user?.token) return null;

    const response = await fetchWithAuth('/auth/me');
    if (response.user) {
      setUser((prev) => ({ ...prev, ...response.user, token: prev?.token || user.token }));
      return response.user;
    }

    return null;
  };

  useEffect(() => {
    try {
      if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      if (!user?.token) {
        if (mounted) setIsLoadingAuth(false);
        return;
      }

      try {
        const refreshedUser = await refreshUser();
        if (!mounted || !refreshedUser) return;
      } catch (err) {
        if (mounted && (err.status === 401 || err.status === 403)) {
          setUser(null);
        }
      } finally {
        if (mounted) setIsLoadingAuth(false);
      }
    }

    checkAuth();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email, password) => {
    const data = await fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    setUser({ ...data.user, token: data.token });
  };

  const loginWithGoogle = async (idToken) => {
    const data = await fetchWithAuth('/auth/google/callback', {
      method: 'POST',
      body: JSON.stringify({ idToken })
    });

    setUser({ ...data.user, token: data.token });
    return data.user;
  };

  const registerUser = async (email, password) => {
    const data = await fetchWithAuth('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    setUser({ ...data.user, token: data.token });
  };

  const logout = async () => {
    try {
      // Call logout endpoint on backend
      await fetchWithAuth('/auth/logout', {
        method: 'POST'
      }).catch(() => {
        // Continue with logout even if backend call fails
      });
    } finally {
      // Clear user state and localStorage
      setUser(null);
      // Redirect will be handled by RequireAuth component
      window.location.href = '/login';
    }
  };

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoadingAuth,
    login,
    loginWithGoogle,
    register: registerUser,
    logout,
    refreshUser,
  }), [user, isAuthenticated, isLoadingAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
