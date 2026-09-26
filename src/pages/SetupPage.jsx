/**
 * SetupPage.jsx
 *
 * Step 1 of the MockMentor flow.
 * The user:
 *   1. Pastes / types their résumé text
 *   2. Enters the target role
 *   3. Picks an interviewer avatar
 *
 * On submit, validates the required fields and navigates to /interview.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useMockMentor } from '../context/MockMentorContext';
import AvatarPicker      from '../components/AvatarPicker';
import './SetupPage.css';

export default function SetupPage() {
  const navigate = useNavigate();
  const {
    resumeText, setResumeText,
    role,       setRole,
    avatar,     setAvatar,
    clearTranscript,
  } = useMockMentor();

  /* Local validation error messages */
  const [errors, setErrors] = useState({});

  /* ── Validation ── */
  function validate() {
    const next = {};
    if (!resumeText.trim()) next.resumeText = 'Please paste your résumé text.';
    if (!role.trim())        next.role       = 'Please enter a target role.';
    if (!avatar)             next.avatar     = 'Please select an interviewer.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /* ── Submit ── */
  function handleStart(e) {
    e.preventDefault();
    if (!validate()) return;

    /* Reset any previous transcript before a new session */
    clearTranscript();
    navigate('/interview');
  }

  return (
    <div className="setup-page">
      {/* ── Page header ── */}
      <header className="setup-page__header">
        <h1>Configure Your Interview</h1>
        <p>Set up your session — paste your résumé, name your target role, and choose a mentor.</p>
      </header>

      {/* ── Setup form ── */}
      <form className="setup-form card" onSubmit={handleStart} noValidate>

        {/* 1. Résumé */}
        <div className="form-group">
          <label className="form-label" htmlFor="resume">
            Résumé Text
          </label>
          <textarea
            id="resume"
            className={`form-textarea${errors.resumeText ? ' form-input--error' : ''}`}
            placeholder="Paste the plain text of your résumé here…"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={8}
            aria-describedby={errors.resumeText ? 'resume-error' : undefined}
          />
          {errors.resumeText && (
            <span id="resume-error" className="form-error" role="alert">
              {errors.resumeText}
            </span>
          )}
        </div>

        {/* 2. Target role */}
        <div className="form-group">
          <label className="form-label" htmlFor="role">
            Target Role
          </label>
          <input
            id="role"
            type="text"
            className={`form-input${errors.role ? ' form-input--error' : ''}`}
            placeholder="e.g. Senior Frontend Engineer"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-describedby={errors.role ? 'role-error' : undefined}
          />
          {errors.role && (
            <span id="role-error" className="form-error" role="alert">
              {errors.role}
            </span>
          )}
        </div>

        {/* 3. Avatar picker */}
        <div className="form-group">
          <span className="form-label">Choose Your Interviewer</span>
          <AvatarPicker selected={avatar} onSelect={setAvatar} />
          {errors.avatar && (
            <span className="form-error" role="alert">{errors.avatar}</span>
          )}
        </div>

        {/* Submit */}
        <div className="setup-form__actions">
          <button type="submit" className="btn btn-primary btn-lg">
            Start Interview →
          </button>
        </div>
      </form>
    </div>
  );
}
