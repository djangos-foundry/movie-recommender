// Asks Google for permission to manage a "CineTrack" calendar and resolves with a
// one-time code. The backend swaps that code for tokens (it holds the client
// secret), so no token ever reaches the browser.

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

export function requestCalendarCode(clientId, loginHint) {
  return new Promise((resolve, reject) => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) {
      reject(new Error('Google is still loading. Try again in a moment.'));
      return;
    }
    const client = oauth.initCodeClient({
      client_id: clientId,
      scope: CALENDAR_SCOPE,
      ux_mode: 'popup',
      login_hint: loginHint,
      callback: (response) => {
        if (response.code) resolve(response.code);
        else reject(new Error(response.error_description || 'Google Calendar permission was not granted.'));
      },
      error_callback: (err) => {
        reject(new Error(err?.type === 'popup_closed' ? 'Connecting was cancelled.' : 'Could not open Google\'s permission window.'));
      },
    });
    client.requestCode(); // must run inside the click that started this
  });
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
