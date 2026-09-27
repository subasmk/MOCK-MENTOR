/**
 * Layout.jsx
 *
 * Persistent shell that wraps every page.
 *
 * Special case: the /interview route is a full-viewport immersive call UI.
 * When on that route the navbar and container padding are suppressed so the
 * InterviewPage can own the entire screen via `position: fixed; inset: 0`.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Layout.css';

export default function Layout({ children }) {
  const { pathname } = useLocation();

  /** Routes that take over the full viewport (no navbar, no container padding) */
  const isCallScreen = pathname === '/interview' || pathname === '/report';

  /** Returns the active class for a nav link */
  const navClass = (path) =>
    `nav-link${pathname === path ? ' nav-link--active' : ''}`;

  /* ── Full-screen call mode: render children with no chrome ── */
  if (isCallScreen) {
    return <>{children}</>;
  }

  /* ── Normal mode: navbar + padded container ── */
  return (
    <div className="layout">
      {/* Top navigation bar */}
      <header className="navbar">
        <div className="container navbar__inner">
          {/* Brand wordmark */}
          <Link to="/setup" className="navbar__brand">
            <span className="navbar__brand-icon" aria-hidden="true">⬡</span>
            <span className="navbar__brand-text">MockMentor</span>
          </Link>

          {/* Route links */}
          <nav className="navbar__nav" aria-label="Primary navigation">
            <Link to="/setup"     className={navClass('/setup')}>Setup</Link>
            <Link to="/interview" className={navClass('/interview')}>Interview</Link>
            <Link to="/vision"    className={navClass('/vision')}>Vision</Link>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="layout__main">
        <div className="container">
          {children}
        </div>
      </main>
    </div>
  );
}
