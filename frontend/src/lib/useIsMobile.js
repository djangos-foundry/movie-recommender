import { useEffect, useState } from 'react';

// Phone-width layout: bottom tab bar instead of the activity rail, side panels as drawers.
// Keep in sync with the breakpoint in mobile.css.
export const MOBILE_QUERY = '(max-width: 767px)';

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}
