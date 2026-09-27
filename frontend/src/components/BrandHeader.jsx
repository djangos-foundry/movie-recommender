import React from 'react';
import { Film } from 'lucide-react';

// Logo block at the top of both sidebars (Library and Discover)
export default function BrandHeader() {
  return (
    <div className="sidebar__brand">
      <div className="sidebar__logo">
        <Film size={15} strokeWidth={2.5} />
      </div>
      <div className="sidebar__brand-text">
        <span className="sidebar__brand-name">CINETRACK</span>
        <span className="sidebar__brand-sub">Movie Hub &amp; Tracker</span>
      </div>
    </div>
  );
}
