/**
 * InterviewPage.jsx
 *
 * Step 2 of the MockMentor flow — the live mock interview session.
 *
 * Layout:
 *   Left panel  — interviewer avatar + session metadata
 *   Right panel — transcript + user input
 *
 * Behaviour:
 *   • If the user lands here without completing setup, they're redirected.
 *   • The user types a response and submits; it's appended to the transcript
 *     as a 'user' turn.
 *   • A placeholder mentor reply is appended immediately after (replace with
 *     real AI call once the backend is wired up).
 */
import React, { useState } from 'react';
import { useNavigate }     from 'react-router-dom';

import { useMockMentor } from '../context/MockMentorContext';
import TranscriptPanel   from '../components/TranscriptPanel';
import './InterviewPage.css';

/* Opening question shown by the mentor when the session loads */
const OPENING_QUESTION =
  "Thanks for joining today! Let's start with a classic: tell me about yourself " +
  "and what draws you to this role.";

export default function InterviewPage() {
  const navigate = useNavigate();
  const { resumeText, role, avatar, transcript, addTurn, clearTranscript } =
    useMockMentor();

  /* Local state for the user's typed response */
  const [userInput, setUserInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  /* ── Guard: redirect to setup if session not configured ── */
  if (!resumeText || !role) {
    return (
      <div className="interview-page interview-page--gate card">
        <p>You haven't configured your session yet.</p>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/setup')}
        >
          Go to Setup
        </button>
      </div>
    );
  }

  /* ── Seed opening question on first render (transcript empty) ── */
  // We use a ref-guard pattern to avoid calling addTurn inside render.
  // The opening question is injected once via the ref below.
  const seededRef = React.useRef(false);
  if (!seededRef.current && transcript.length === 0) {
    seededRef.current = true;
    // Schedule after current render cycle
    setTimeout(() => addTurn('mentor', OPENING_QUESTION), 0);
  }

  /* ── Submit user turn ── */
  async function handleSubmit(e) {
    e.preventDefault();
    const text = userInput.trim();
    if (!text || isThinking) return;

    setUserInput('');
    addTurn('user', text);

    /* ── Placeholder mentor reply ── */
    // TODO: replace with real AI/backend call, passing resumeText, role, transcript
    setIsThinking(true);
    setTimeout(() => {
      addTurn(
        'mentor',
        `Great answer! As a ${role}, you'd definitely need to expand on that. ` +
        `Let's dig deeper — can you walk me through a specific challenge you've overcome?`
      );
      setIsThinking(false);
    }, 1200);
  }

  /* ── End session ── */
  function handleEndSession() {
    clearTranscript();
    navigate('/setup');
  }

  /* Derive avatar path — fallback to a gradient placeholder if no avatar */
  const avatarSrc = avatar ? `/avatars/${avatar}` : null;

  return (
    <div className="interview-page">
      {/* ── Session header ── */}
      <header className="interview-page__header">
        <div>
          <h1>Mock Interview</h1>
          <p className="interview-page__role">Role: <strong>{role}</strong></p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleEndSession}
        >
          ✕ End Session
        </button>
      </header>

      {/* ── Main two-column layout ── */}
      <div className="interview-layout">

        {/* Left: Mentor panel */}
        <aside className="mentor-panel card">
          <div className="mentor-panel__avatar-wrap">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt="Interviewer avatar"
                className="mentor-panel__avatar-img"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : null}
            {/* Glow ring always rendered */}
            <div className="mentor-panel__glow-ring" aria-hidden="true" />
          </div>

          <div className="mentor-panel__info">
            <span className="mentor-panel__label">Your Interviewer</span>
            <span className="mentor-panel__status">
              {isThinking ? (
                <span className="thinking-indicator">
                  <span /><span /><span />
                </span>
              ) : (
                <span className="status-dot status-dot--active" aria-label="Active" />
              )}
              {isThinking ? 'Thinking…' : 'Listening'}
            </span>
          </div>

          {/* Session metadata */}
          <div className="mentor-panel__meta">
            <div className="meta-item">
              <span className="meta-label">Role</span>
              <span className="meta-value">{role}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Turns</span>
              <span className="meta-value">{transcript.length}</span>
            </div>
          </div>
        </aside>

        {/* Right: Conversation panel */}
        <section className="conversation-panel">
          {/* Transcript */}
          <TranscriptPanel transcript={transcript} />

          {/* Input area */}
          <form className="response-form" onSubmit={handleSubmit}>
            <textarea
              className="form-textarea response-form__textarea"
              placeholder="Type your response here…"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={isThinking}
              rows={4}
              /* Allow Ctrl+Enter to submit */
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(e);
              }}
              aria-label="Your response"
            />
            <div className="response-form__actions">
              <span className="response-form__hint">Ctrl+Enter to send</span>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!userInput.trim() || isThinking}
              >
                {isThinking ? 'Waiting…' : 'Send Response →'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
