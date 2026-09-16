'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext({
  user: null,
  login: async () => ({ success: false }),
  logout: () => {},
  loading: true,
});

// Predefined dummy credentials removed in favor of DB auth

const STORAGE_KEY = 'sap_monitoring_user_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(STORAGE_KEY);
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (e) {
      console.error('Failed to load user session from storage', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (userId, password) => {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, password }),
      });

      const data = await response.json();

      if (data.success) {
        const userData = {
          ...data.user,
          loginTime: new Date().toISOString(),
        };
        setUser(userData);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
        } catch (e) {
          console.error('Failed to persist user session', e);
        }
        return { success: true };
      } else {
        return {
          success: false,
          message: data.message || 'Invalid User ID or Password. Please check your credentials.',
        };
      }
    } catch (err) {
      console.error('Auth error', err);
      return {
        success: false,
        message: 'Network error. Please try again later.',
      };
    }
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to remove user session', e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
