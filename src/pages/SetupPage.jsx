/**
 * SetupPage.jsx
 *
 * MockMentor onboarding screen — collects everything needed to start a session:
 *   1. Résumé — paste text OR upload a .txt / .pdf file (text extracted client-side)
 *   2. Role   — dropdown: SDE | Data Analyst | Marketing | HR | Product
 *   3. Avatar — 3 interviewer cards (male, female, robot) with glow-on-select
 *
 * On "Start Interview" all values are pushed into MockMentorContext and the
 * router navigates to /interview.
 */
import React, { useState, useRef } from 'react';
import { useNavigate }              from 'react-router-dom';
import { useMockMentor }            from '../context/MockMentorContext';
import './SetupPage.css';

/* ─────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────── */

/** Roles shown in the dropdown. */
const ROLES = [
  { value: '',                label: 'Select a role…',   disabled: true },
  { value: 'SDE',             label: '💻  Software Development Engineer' },
  { value: 'Data Analyst',    label: '📊  Data Analyst'                  },
  { value: 'Marketing',       label: '📣  Marketing'                     },
  { value: 'HR',              label: '🤝  Human Resources'               },
  { value: 'Product',         label: '🧭  Product Manager'               },
];

/**
 * Three fixed interviewer personas.
 * `avatar` maps to a file in /public/avatars/.
 */
const INTERVIEWERS = [
  {
    id:       'male',
    avatar:   '/avatars/interviewer-male.svg',
    name:     'Alex Turner',
    tag:      'Technical Lead',
    accent:   'cyan',          // drives CSS modifier
  },
  {
    id:       'female',
    avatar:   '/avatars/interviewer-female.svg',
    name:     'Priya Nair',
    tag:      'Hiring Manager',
    accent:   'violet',
  },
  {
    id:       'robot',
    avatar:   '/avatars/interviewer-robot.svg',
    name:     'ARIA-7',
    tag:      'AI Evaluator',
    accent:   'teal',
  },
];

/* ─────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────── */
export default function SetupPage() {
  const navigate = useNavigate();
  const { setResumeText, setRole, setAvatar, clearTranscript } = useMockMentor();

  /* Local draft state — written to context only on submit */
  const [resume,        setResume]        = useState('');
  const [selectedRole,  setSelectedRole]  = useState('');
  const [selectedAvatar,setSelectedAvatar]= useState('');

  /* File upload state */
  const [fileName,      setFileName]      = useState('');
  const [fileError,     setFileError]     = useState('');
  const [fileLoading,   setFileLoading]   = useState(false);

  /* Validation errors */
  const [errors, setErrors] = useState({});

  /* Hidden file input ref */
  const fileInputRef = useRef(null);

  /* ── File upload handler ────────────────────────────── */
  /**
   * Reads a .txt or .pdf file dropped / chosen by the user.
   * .txt  → FileReader.readAsText (instant)
   * .pdf  → reads raw bytes, extracts readable ASCII strings as a best-effort
   *         plain-text fallback (no external library needed).
   */
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError('');
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt') {
      setFileLoading(true);
      const reader = new FileReader();
      reader.onload  = (ev) => { setResume(ev.target.result); setFileName(file.name); setFileLoading(false); };
      reader.onerror = ()   => { setFileError('Could not read file.'); setFileLoading(false); };
      reader.readAsText(file);

    } else if (ext === 'pdf') {
      setFileLoading(true);
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          /* Best-effort: decode the raw PDF byte stream to a string and
             pull out runs of printable ASCII (words / sentences).
             Real projects should swap this for pdf.js for full fidelity. */
          const bytes   = new Uint8Array(ev.target.result);
          const raw     = String.fromCharCode(...bytes);
          /* Match sequences of printable chars separated by whitespace */
          const chunks  = raw.match(/[\x20-\x7E\n\r\t]{4,}/g) || [];
          /* Filter noise: keep chunks that look like natural language */
          const text    = chunks
            .filter(c => /[a-zA-Z]{2,}/.test(c))   // must contain letters
            .join(' ')
            .replace(/\s{3,}/g, '\n')               // collapse whitespace runs
            .trim();
          setResume(text || '(Could not extract text — please paste manually.)');
          setFileName(file.name);
        } catch {
          setFileError('PDF parsing failed. Please paste your résumé text instead.');
        }
        setFileLoading(false);
      };
      reader.onerror = () => { setFileError('Could not read PDF.'); setFileLoading(false); };
      reader.readAsArrayBuffer(file);

    } else {
      setFileError('Only .txt and .pdf files are supported.');
      /* Reset the input so the same file can be re-chosen after fixing */
      e.target.value = '';
    }
  }

  /* ── Validation ─────────────────────────────────────── */
  function validate() {
    const next = {};
    if (!resume.trim())         next.resume = 'Please paste or upload your résumé.';
    if (!selectedRole)          next.role   = 'Please select a role.';
    if (!selectedAvatar)        next.avatar = 'Please choose an interviewer.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /* ── Submit ─────────────────────────────────────────── */
  function handleStart(e) {
    e.preventDefault();
    if (!validate()) return;

    /* Push draft values into shared context */
    setResumeText(resume);
    setRole(selectedRole);
    setAvatar(selectedAvatar);
    clearTranscript();            // wipe any previous session transcript

    navigate('/interview');
  }

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="setup-page">

      {/* ── Page hero ── */}
      <header className="setup-hero">
        <div className="setup-hero__badge">MOCK INTERVIEW</div>
        <h1 className="setup-hero__title">Configure Your Session</h1>
        <p className="setup-hero__sub">
          Paste your résumé, pick the role you're targeting, then choose an
          AI interviewer to begin.
        </p>
      </header>

      {/* ── Form card ── */}
      <form className="setup-form card glow-border" onSubmit={handleStart} noValidate>

        {/* ══════════════════════════════════════════════
            Section 1 — Résumé
        ══════════════════════════════════════════════ */}
        <section className="setup-section">
          <h2 className="setup-section__title">
            <span className="setup-section__num">01</span>
            Your Résumé
          </h2>
          <p className="setup-section__hint">
            Paste plain text below, or upload a <code>.txt</code> / <code>.pdf</code> file.
          </p>

          {/* File upload row */}
          <div className="upload-row">
            {/* Hidden native input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.pdf"
              className="upload-input-hidden"
              onChange={handleFileChange}
              aria-label="Upload résumé file"
            />
            <button
              type="button"
              className="btn btn-outline upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={fileLoading}
            >
              {fileLoading ? (
                <span className="upload-btn__spinner" aria-hidden="true" />
              ) : (
                /* Upload icon (inline SVG, no external dep) */
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M10 2a1 1 0 0 1 .707.293l4 4a1 1 0 0 1-1.414 1.414L11 5.414V13a1 1 0 1 1-2 0V5.414L6.707 7.707A1 1 0 0 1 5.293 6.293l4-4A1 1 0 0 1 10 2zM3 15a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H3z"/>
                </svg>
              )}
              {fileLoading ? 'Reading…' : 'Upload File'}
            </button>

            {/* Chosen filename chip */}
            {fileName && !fileLoading && (
              <span className="upload-filename">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M4 4a2 2 0 0 1 2-2h5l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z"/>
                </svg>
                {fileName}
                {/* Clear button */}
                <button
                  type="button"
                  className="upload-filename__clear"
                  aria-label="Remove file"
                  onClick={() => {
                    setFileName('');
                    setResume('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >×</button>
              </span>
            )}

            {fileError && (
              <span className="form-error" role="alert">{fileError}</span>
            )}
          </div>

          {/* Résumé textarea */}
          <div className="form-group">
            <label className="form-label" htmlFor="resume">
              Résumé Text
            </label>
            <textarea
              id="resume"
              className={`form-textarea resume-textarea${errors.resume ? ' form-input--error' : ''}`}
              placeholder="Paste the plain text of your résumé here…"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              rows={9}
              spellCheck={false}
              aria-describedby={errors.resume ? 'resume-err' : undefined}
            />
            {errors.resume && (
              <span id="resume-err" className="form-error" role="alert">
                {errors.resume}
              </span>
            )}
            {/* Character count hint */}
            {resume.length > 0 && (
              <span className="char-count">{resume.length.toLocaleString()} characters</span>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            Section 2 — Role
        ══════════════════════════════════════════════ */}
        <section className="setup-section">
          <h2 className="setup-section__title">
            <span className="setup-section__num">02</span>
            Target Role
          </h2>
          <p className="setup-section__hint">
            Choose the position you're interviewing for.
          </p>

          <div className="form-group">
            <label className="form-label" htmlFor="role">Role</label>
            <div className="select-wrap">
              <select
                id="role"
                className={`form-select${errors.role ? ' form-input--error' : ''}`}
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                aria-describedby={errors.role ? 'role-err' : undefined}
              >
                {ROLES.map((r) => (
                  <option
                    key={r.value}
                    value={r.value}
                    disabled={r.disabled}
                  >
                    {r.label}
                  </option>
                ))}
              </select>
              {/* Custom chevron */}
              <svg className="select-chevron" width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            {errors.role && (
              <span id="role-err" className="form-error" role="alert">{errors.role}</span>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            Section 3 — Interviewer cards
        ══════════════════════════════════════════════ */}
        <section className="setup-section">
          <h2 className="setup-section__title">
            <span className="setup-section__num">03</span>
            Choose Your Interviewer
          </h2>
          <p className="setup-section__hint">
            Each interviewer has a distinct style — pick the one that challenges you most.
          </p>

          <div
            className="interviewer-grid"
            role="group"
            aria-label="Interviewer selection"
          >
            {INTERVIEWERS.map((iv) => {
              const isSelected = selectedAvatar === iv.id;
              return (
                <button
                  key={iv.id}
                  type="button"
                  className={[
                    'interviewer-card',
                    `interviewer-card--${iv.accent}`,
                    isSelected ? 'interviewer-card--selected' : '',
                  ].join(' ')}
                  onClick={() => setSelectedAvatar(iv.id)}
                  aria-pressed={isSelected}
                  aria-label={`Select ${iv.name}, ${iv.tag}`}
                >
                  {/* Avatar image */}
                  <div className="interviewer-card__img-wrap">
                    <img
                      src={iv.avatar}
                      alt={iv.name}
                      className="interviewer-card__img"
                      draggable={false}
                    />
                    {/* Glow halo — visible when selected */}
                    <div className="interviewer-card__halo" aria-hidden="true" />
                  </div>

                  {/* Name & tag */}
                  <span className="interviewer-card__name">{iv.name}</span>
                  <span className="interviewer-card__tag">{iv.tag}</span>

                  {/* Selected check badge */}
                  {isSelected && (
                    <span className="interviewer-card__check" aria-hidden="true">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M1 6l3.5 3.5L11 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {errors.avatar && (
            <span className="form-error" role="alert">{errors.avatar}</span>
          )}
        </section>

        {/* ══════════════════════════════════════════════
            Submit row
        ══════════════════════════════════════════════ */}
        <div className="setup-form__footer">
          <div className="setup-form__summary">
            {/* Live summary of chosen options */}
            {selectedRole && (
              <span className="summary-chip">
                Role: <strong>{selectedRole}</strong>
              </span>
            )}
            {selectedAvatar && (
              <span className="summary-chip">
                Interviewer: <strong>
                  {INTERVIEWERS.find(i => i.id === selectedAvatar)?.name}
                </strong>
              </span>
            )}
          </div>
          <button type="submit" className="btn btn-primary btn-lg">
            Start Interview
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M7 5l6 5-6 5V5z"/>
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
