/**
 * App.jsx
 *
 * Root routing shell. Defines the two primary routes:
 *   /setup     — onboarding: paste résumé, pick role & avatar
 *   /interview — live mock-interview session
 *
 * Navigating to "/" automatically redirects to "/setup".
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Layout    from './components/Layout';
import SetupPage from './pages/SetupPage';
import InterviewPage from './pages/InterviewPage';

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

        {/* Catch-all — send unknown paths back to setup */}
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    </Layout>
  );
}
