'use client';

import { useState } from 'react';
import { useAuth, DUMMY_ACCOUNTS } from './AuthContext.jsx';

const LOGO_URL = '/mpower-logo.png';

export default function LoginPage() {
  const { login } = useAuth();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId.trim() || !password) {
      setError('Please enter both User ID and Password.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login(userId, password);
      if (!res.success) {
        setError(res.message || 'Invalid credentials');
      }
    } catch (err) {
      setError('An error occurred during authentication. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const autofillAccount = (account) => {
    setUserId(account.userId);
    setPassword(account.password);
    setError(null);
  };

  return (
    <div className="login-screen">
      <div className="login-bg-glow login-bg-glow-1" aria-hidden="true" />
      <div className="login-bg-glow login-bg-glow-2" aria-hidden="true" />

      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-wrapper">
            <img src={LOGO_URL} alt="M Power Logo" className="login-logo" />
          </div>
          <div className="login-eyebrow">SAP Basis Operations</div>
          <h1 className="login-title">ApxOps</h1>
          <span>The Autonomous SAP Basis Monitoring Platform</span>
          <p className="login-subtitle">
            <br />Sign in with your SAP Basis credentials to access system telemetry and batch controls.
          </p>
        </div>

        {error && (
          <div className="login-alert login-alert-error" role="alert">
            <svg
              className="login-alert-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field-group">
            <label htmlFor="userId" className="login-label">
              User ID
            </label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.626-.89.41-1.412A9.99 9.99 0 0010 10c-2.44 0-4.678.871-6.535 2.493z" />
                </svg>
              </span>
              <input
                id="userId"
                type="text"
                className="login-input"
                placeholder="Enter User ID (e.g. admin)"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                autoComplete="username"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          <div className="login-field-group">
            <label htmlFor="password" className="login-label">
              Password
            </label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path
                    fillRule="evenodd"
                    d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                title={showPassword ? 'Hide Password' : 'Show Password'}
              >
                {showPassword ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path
                      fillRule="evenodd"
                      d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38.75.75 0 000-.59C17.7 6.13 14.1 3.5 10 3.5c-1.28 0-2.492.257-3.59.722L3.28 2.22zm4.32 4.32a6.974 6.974 0 012.4-.54c3.15 0 6.02 1.94 7.42 4.5-.66 1.21-1.67 2.22-2.88 2.9l-1.4-1.4a3 3 0 00-4.14-4.14L7.6 6.54z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                    <path
                      fillRule="evenodd"
                      d="M.664 10.59a1.65 1.65 0 010-1.18C1.73 6.09 5.38 3.5 10 3.5c4.62 0 8.27 2.59 9.336 5.91.076.24.076.94 0 1.18C18.27 13.91 14.62 16.5 10 16.5c-4.62 0-8.27-2.59-9.336-5.91zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="login-spinner-wrapper">
                <span className="login-spinner" aria-hidden="true" />
                Authenticating...
              </span>
            ) : (
              'Sign In to Dashboard'
            )}
          </button>

          <div className="login-powered-by">
            <span className="login-powered-label">powered by</span>
            <img src="/apx-logo.svg" alt="APx Technology" className="login-powered-logo" />
          </div>
        </form>

        <div className="login-demo-section">
          <div className="login-demo-title">Test Accounts (Click to Autofill)</div>
          <div className="login-demo-grid">
            {DUMMY_ACCOUNTS.map((acc) => (
              <button
                key={acc.userId}
                type="button"
                className="login-demo-card"
                onClick={() => autofillAccount(acc)}
              >
                <div className="login-demo-avatar">{acc.avatar}</div>
                <div className="login-demo-info">
                  <div className="login-demo-role">{acc.name}</div>
                  <div className="login-demo-creds">
                    <code>{acc.userId}</code> / <code>{acc.password}</code>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="login-footer">
          <span>SAP Basis Health & Monitoring Platform v2.0</span>
        </div>
      </div>
    </div>
  );
}
