import React, { useEffect, useRef } from 'react';

/**
 * Renders Google's own "Sign in with Google" button (Google Identity Services).
 * When the person picks an account, Google hands us a signed ID token, which we
 * pass to `onCredential`; the backend verifies it.
 */
export default function GoogleSignInButton({ clientId, onCredential, width = 190 }) {
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
        gsi.renderButton(holder.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width,
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
  return <div ref={holder} className="activity-rail__google" />;
}
