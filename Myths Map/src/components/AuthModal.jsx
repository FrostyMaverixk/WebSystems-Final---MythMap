import { useEffect, useState } from 'react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap.js';
import { firebaseReady } from '../services/firebase.js';

export function AuthModal({
  isOpen,
  initialMessage,
  canDismiss,
  isGuest = false,
  busy,
  onSignIn,
  onRegister,
  onGuest,
  onClose,
}) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [role, setRole] = useState('user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setPassword('');
    }
  }, [isOpen, initialMessage]);

  const containerRef = useModalFocusTrap(isOpen, onClose, { allowEscape: Boolean(canDismiss) });
  if (!isOpen) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      if (mode === 'register') {
        await onRegister({ name: name.trim(), email: email.trim(), password });
      } else {
        await onSignIn({ email: email.trim(), password, expectedRole: role });
      }
      setPassword('');
    } catch (err) {
      setError(err?.message || 'Authentication failed.');
    }
  };

  const handleGuestClick = async () => {
    if (isGuest) {
      onClose?.();
      return;
    }
    setError('');
    try {
      await onGuest();
    } catch (err) {
      setError(err?.message || 'Could not continue as guest.');
    }
  };

  return (
    <div
      id="login-screen"
      className="overlay login-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-heading"
      ref={containerRef}
      onClick={(event) => {
        if (canDismiss && event.target === event.currentTarget) onClose?.();
      }}
    >
      <section className="login-panel">
        <div className="login-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <span className="art-star star-one">✦</span>
          <span className="art-star star-two">✧</span>
          <span className="art-star star-three">✦</span>
          <div className="art-moon" />
          <div className="island island-one" />
          <div className="island island-two" />
          <div className="island island-three" />
          <div className="art-copy">
            <span>MYTHS MAP</span>
            <h2>
              Where the islands
              <br />
              keep their legends.
            </h2>
            <p>
              A journey through the stories
              <br />
              that connect us.
            </p>
          </div>
          <span className="art-coordinate">12° N &nbsp; / &nbsp; 122° E</span>
        </div>

        <div className="login-content">
          {canDismiss && (
            <button
              type="button"
              className="close-button"
              aria-label="Close sign in"
              onClick={onClose}
            >
              ×
            </button>
          )}
          <p className="eyebrow">YOUR JOURNEY STARTS HERE</p>
          <h2 id="login-heading">
            {mode === 'register' ? 'Join the archipelago.' : 'Enter the archipelago.'}
          </h2>
          <p className="login-description">
            {initialMessage
              ? initialMessage
              : mode === 'register'
              ? 'Create an Explorer account to save favorites, rate legends, and submit local myths.'
              : 'Sign in to save your favorite tales, write reviews, and share a story of your own.'}
          </p>

          {!firebaseReady && (
            <p className="form-error" role="status">
              Firebase is not configured yet. Add your <code>VITE_FIREBASE_*</code> keys to{' '}
              <code>.env</code> to enable sign-in and guest access.
            </p>
          )}

          <div className="auth-mode-switch" role="group" aria-label="Authentication mode">
            <button
              type="button"
              aria-pressed={String(mode === 'signin')}
              onClick={() => {
                setMode('signin');
                setError('');
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              aria-pressed={String(mode === 'register')}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Create Account
            </button>
          </div>

          <form id="login-form" onSubmit={handleSubmit}>
            {mode === 'signin' ? (
              <>
                <label htmlFor="role-select">I’m signing in as</label>
                <select
                  id="role-select"
                  name="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="user">Explorer / User</option>
                  <option value="admin">Administrator</option>
                </select>
              </>
            ) : (
              <>
                <label htmlFor="register-name">Display name</label>
                <input
                  id="register-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="How should your tales be credited?"
                  required
                  minLength={2}
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </>
            )}

            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="explorer@example.com"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label htmlFor="login-password">Password</label>
            <div className="password-field">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter your password'}
                required
                minLength={mode === 'register' ? 6 : 1}
                maxLength={256}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                id="toggle-password"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={String(showPassword)}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {error && (
              <p id="login-error" className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              id="login-submit"
              type="submit"
              className="accent-button full-button"
              disabled={busy || !firebaseReady}
            >
              {busy
                ? 'Please wait…'
                : mode === 'register'
                ? 'Create Explorer account'
                : 'Sign in & explore'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>

          <div className="login-separator">
            <span>or explore at your own pace</span>
          </div>

          <button
            id="login-guest"
            type="button"
            className="full-button guest-button"
            disabled={busy || (!isGuest && !firebaseReady)}
            onClick={handleGuestClick}
          >
            Continue as guest <span aria-hidden="true">→</span>
          </button>

          <p className="guest-note">
            No account needed. Browse every published story and join creature discussion threads.
          </p>
        </div>
      </section>
    </div>
  );
}
