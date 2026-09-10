'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext({
  user: null,
  login: async () => ({ success: false }),
  logout: () => {},
  loading: true,
});

// Predefined dummy credentials for SAP Basis Monitoring Dashboard
export const DUMMY_ACCOUNTS = [
  {
    userId: 'admin',
    password: 'password123',
    name: 'SAP Basis Admin',
    role: 'Lead Administrator',
    email: 'basis.admin@company.sap',
    avatar: 'SA',
  },
  {
    userId: 'operator',
    password: 'sap123',
    name: 'Basis Operator',
    role: 'Landscape Monitor',
    email: 'operator@company.sap',
    avatar: 'BO',
  },
];

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
    // Simulate brief network delay for realism
    await new Promise((resolve) => setTimeout(resolve, 350));

    const trimmedId = userId.trim().toLowerCase();
    const account = DUMMY_ACCOUNTS.find(
      (acc) => acc.userId.toLowerCase() === trimmedId && acc.password === password
    );

    if (account) {
      const userData = {
        userId: account.userId,
        name: account.name,
        role: account.role,
        email: account.email,
        avatar: account.avatar,
        loginTime: new Date().toISOString(),
      };
      setUser(userData);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      } catch (e) {
        console.error('Failed to persist user session', e);
      }
      return { success: true };
    }

    return {
      success: false,
      message: 'Invalid User ID or Password. Please check your credentials.',
    };
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
