import React, { useState, useEffect, useRef } from 'react';
import { X, Eye, EyeOff, Loader2 } from 'lucide-react';
import GoogleSignInButton from './GoogleSignInButton';
import { registerAccount, loginWithPassword } from '../api/client';

/**
 * Sign in / Create account. Username + password lives here; Google sits below
 * as the other way in. A guest's lists come along either way (the server
 * upgrades or merges the guest), so success just reloads the app.
 */
export default function AuthModal({
  isOpen,
  onClose,
  googleClientId = '',
  onGoogleCredential,
  onSuccess,
  initialTab = 'signin',
}) {
  const [tab, setTab] = useState(initialTab);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const usernameRef = useRef(null);

  const isRegister = tab === 'register';

  useEffect(() => {
    if (!isOpen) return undefined;
    setTab(initialTab);
    setUsername(''); setPassword(''); setEmail('');
    setShowPassword(false); setError(''); setIsBusy(false);
    const t = setTimeout(() => usernameRef.current?.focus(), 60);
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [isOpen, initialTab, onClose]);

  if (!isOpen) return null;

  const switchTab = (next) => {
    setTab(next);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isBusy) return;
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    try {
      setIsBusy(true);
      setError('');
      if (isRegister) {
        await registerAccount({ username: username.trim(), password, email: email.trim() });
      } else {
        await loginWithPassword({ username: username.trim(), password });
      }
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
      setIsBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label={isRegister ? 'Create account' : 'Sign in'}>
        <button type="button" className="auth-modal__close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <h3 className="auth-modal__title">{isRegister ? 'Create your account' : 'Welcome back'}</h3>
        <p className="auth-modal__sub">
          {isRegister ? 'Your guest lists come with you.' : 'Sign in to see your lists on any device.'}
        </p>

        <div className="auth-modal__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!isRegister}
            className={`auth-modal__tab ${!isRegister ? 'is-active' : ''}`} onClick={() => switchTab('signin')}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={isRegister}
            className={`auth-modal__tab ${isRegister ? 'is-active' : ''}`} onClick={() => switchTab('register')}>
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-modal__form" noValidate>
          <label className="auth-modal__label" htmlFor="auth-username">Username</label>
          <input
            id="auth-username" ref={usernameRef} type="text" className="auth-modal__input"
            value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }}
            autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30}
          />
          {isRegister && <p className="auth-modal__hint">3 to 30 letters, numbers, or underscores.</p>}

          <label className="auth-modal__label" htmlFor="auth-password">Password</label>
          <div className="auth-modal__password">
            <input
              id="auth-password" type={showPassword ? 'text' : 'password'} className="auth-modal__input"
              value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
            <button type="button" className="auth-modal__eye" onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {isRegister && <p className="auth-modal__hint">At least 10 characters.</p>}

          {isRegister && (
            <>
              <label className="auth-modal__label" htmlFor="auth-email">Email (optional, for password resets)</label>
              <input
                id="auth-email" type="email" className="auth-modal__input" placeholder="name@example.com"
                value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
                autoComplete="email"
              />
            </>
          )}

          {error && <p className="auth-modal__error" role="alert">{error}</p>}

          <button type="submit" className="auth-modal__submit" disabled={isBusy}>
            {isBusy ? <Loader2 size={15} className="dz-spinner" /> : (isRegister ? 'Create account' : 'Sign in')}
          </button>
        </form>

        {googleClientId && (
          <>
            <div className="auth-modal__or"><span>or</span></div>
            <div className="auth-modal__google">
              <GoogleSignInButton clientId={googleClientId} onCredential={onGoogleCredential} width={320} />
            </div>
          </>
        )}

        {isRegister && (
          <p className="auth-modal__legal">
            By continuing you agree to the <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a>.
          </p>
        )}
      </div>
    </div>
  );
}
