import React, { useEffect, useRef } from 'react';

// Google's multicolor "G" (transparent background, per their branding rules)
function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google" in the app's own dark style. Google's real Identity
 * Services button is laid invisibly on top, so the click and sign-in are still
 * Google's own: when the person picks an account, Google hands us a signed ID
 * token, which we pass to `onCredential`; the backend verifies it.
 */
export default function GoogleSignInButton({ clientId, onCredential, width = 190 }) {
  const wrapRef = useRef(null);
  const holder = useRef(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    let timer = null;

    const render = () => {
      if (cancelled) return;
      const gsi = window.google?.accounts?.id;
      if (!gsi) {
        timer = setTimeout(render, 200); // Google's script is still loading
        return;
      }
      gsi.initialize({
        client_id: clientId,
        callback: (res) => callbackRef.current?.(res.credential),
      });
      if (holder.current) {
        // Google accepts 200 to 400px; the wrapper clips any overhang
        const px = Math.min(400, Math.max(200, Math.round(wrapRef.current?.offsetWidth || width)));
        holder.current.style.width = `${px}px`;
        gsi.renderButton(holder.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: px,
        });
      }
    };
    render();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clientId, width]);

  if (!clientId) {
    return <p className="activity-rail__guest-text">Google sign-in isn't configured yet.</p>;
  }
  return (
    <div className="google-btn" ref={wrapRef} style={{ maxWidth: width }}>
      <div className="google-btn__face">
        <GoogleG />
        <span>Continue with Google</span>
      </div>
      <div className="google-btn__hit" ref={holder} />
    </div>
  );
}
