/**
 * Layout.jsx
 *
 * Persistent shell component that wraps every page.
 * Renders the top navigation bar and the page content slot.
 * Uses CSS custom properties from global.css for all colours.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Layout.css';

export default function Layout({ children }) {
  const { pathname } = useLocation();

  /** Helper — returns active class when route matches */
  const navClass = (path) =>
    `nav-link${pathname === path ? ' nav-link--active' : ''}`;

  return (
    <div className="layout">
      {/* ── Top navigation bar ── */}
      <header className="navbar">
        <div className="container navbar__inner">
          {/* Brand wordmark */}
          <Link to="/setup" className="navbar__brand">
            <span className="navbar__brand-icon" aria-hidden="true">⬡</span>
            <span className="navbar__brand-text">MockMentor</span>
          </Link>

          {/* Route links */}
          <nav className="navbar__nav" aria-label="Primary navigation">
            <Link to="/setup"      className={navClass('/setup')}>Setup</Link>
            <Link to="/interview"  className={navClass('/interview')}>Interview</Link>
          </nav>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="layout__main">
        <div className="container">
          {children}
        </div>
      </main>
    </div>
  );
}
