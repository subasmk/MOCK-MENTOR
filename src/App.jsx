/**
 * App.jsx
 *
 * Root routing shell.
 *   /setup     — onboarding: paste résumé, pick role & avatar
 *   /interview — live mock-interview session (full-viewport, no nav)
 *   /report    — post-interview transcript & summary (full-viewport, no nav)
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Layout       from './components/Layout';
import SetupPage    from './pages/SetupPage';
import InterviewPage from './pages/InterviewPage';
import ReportPage   from './pages/ReportPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/setup" replace />} />

        {/* Onboarding / configuration */}
        <Route path="/setup" element={<SetupPage />} />

        {/* Live mock interview */}
        <Route path="/interview" element={<InterviewPage />} />

        {/* Post-interview report */}
        <Route path="/report" element={<ReportPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    </Layout>
  );
}
