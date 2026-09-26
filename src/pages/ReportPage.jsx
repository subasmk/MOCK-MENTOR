/**
 * ReportPage.jsx
 *
 * Post-interview transcript and summary.
 * Reads all session data from MockMentorContext — nothing is re-fetched.
 *
 * Layout:
 *   Header  — interviewer avatar · role · session stats (turns, duration)
 *   Body    — numbered Q&A pairs extracted from the transcript
 *             (mentor turns = questions/feedback, user turns = answers)
 *   Footer  — Start New Interview CTA
 *
 * If the transcript is empty (user landed here directly without an interview)
 * a friendly redirect prompt is shown.
 *
 * The transcript is NOT cleared here. It remains in context so the user can
 * revisit the page within the same browser session.
 * clearTranscript() is called by SetupPage when a new session begins.
 */
import React, { useMemo } from 'react';
import { useNavigate }    from 'react-router-dom';
import { useMockMentor }  from '../context/MockMentorContext';
import './ReportPage.css';

/* ─────────────────────────────────────────────────────────
   Interviewer catalogue (mirrors SetupPage / InterviewPage)
───────────────────────────────────────────────────────── */
const INTERVIEWER_MAP = {
  male:   { name: 'Alex Turner', tag: 'Technical Lead',  src: '/avatars/interviewer-male.svg'   },
  female: { name: 'Priya Nair',  tag: 'Hiring Manager',  src: '/avatars/interviewer-female.svg' },
  robot:  { name: 'ARIA-7',      tag: 'AI Evaluator',    src: '/avatars/interviewer-robot.svg'  },
};

/* ─────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────── */

/** Format an ISO timestamp as HH:MM:SS */
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Elapsed time between two ISO timestamps, returned as "Xm Ys" */
function fmtElapsed(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso) - new Date(startIso);
  if (ms < 0) return '—';
  const totalSecs = Math.round(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Pair mentor + user turns into Q&A objects. */
function pairTurns(transcript) {
  const pairs = [];
  let i = 0;

  while (i < transcript.length) {
    const turn = transcript[i];

    if (turn.speaker === 'mentor') {
      /* Collect consecutive mentor turns as one question block */
      let mentorText = turn.text;
      let mentorTs   = turn.timestamp;
      let j = i + 1;

      /* Next turn might be user answer */
      const answer = transcript[j]?.speaker === 'user' ? transcript[j] : null;

      pairs.push({
        qNum:        pairs.length + 1,
        question:    mentorText,
        questionTs:  mentorTs,
        answer:      answer?.text ?? null,
        answerTs:    answer?.timestamp ?? null,
      });

      i = answer ? j + 1 : j;
    } else {
      /* Orphaned user turn (shouldn't happen, but skip gracefully) */
      i++;
    }
  }

  return pairs;
}

/* ─────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────── */
export default function ReportPage() {
  const navigate = useNavigate();
  const { transcript, role, avatar, clearTranscript } = useMockMentor();

  const interviewer = INTERVIEWER_MAP[avatar] ?? INTERVIEWER_MAP.male;

  /* ── Guard: no transcript → prompt to set up ── */
  if (transcript.length === 0) {
    return (
      <div className="rp-gate">
        <p className="rp-gate__msg">No interview found. Start a session first.</p>
        <button className="btn btn-primary" onClick={() => navigate('/setup')}>
          Go to Setup
        </button>
      </div>
    );
  }

  /* ── Derived stats ── */
  const pairs    = useMemo(() => pairTurns(transcript), [transcript]);
  const firstTs  = transcript[0]?.timestamp;
  const lastTs   = transcript[transcript.length - 1]?.timestamp;
  const duration = fmtElapsed(firstTs, lastTs);
  const answered = pairs.filter((p) => p.answer !== null).length;

  /* ── Start a new interview ── */
  function handleNewInterview() {
    clearTranscript();
    navigate('/setup');
  }

  /* ─────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────── */
  return (
    <div className="rp-root">

      {/* ══════════════════════════════════════════════
          Header — interviewer info + session stats
      ══════════════════════════════════════════════ */}
      <header className="rp-header">
        <div className="rp-header__inner">

          {/* Interviewer identity */}
          <div className="rp-interviewer">
            <div className="rp-interviewer__avatar-wrap">
              <img
                src={interviewer.src}
                alt={interviewer.name}
                className="rp-interviewer__avatar"
                draggable={false}
              />
            </div>
            <div className="rp-interviewer__info">
              <span className="rp-interviewer__name">{interviewer.name}</span>
              <span className="rp-interviewer__tag">{interviewer.tag}</span>
            </div>
          </div>

          {/* Wordmark */}
          <div className="rp-wordmark" aria-hidden="true">⬡ MockMentor</div>

          {/* Session stats */}
          <div className="rp-stats">
            <div className="rp-stat">
              <span className="rp-stat__label">Role</span>
              <span className="rp-stat__value">{role || '—'}</span>
            </div>
            <div className="rp-stat">
              <span className="rp-stat__label">Questions</span>
              <span className="rp-stat__value">{pairs.length}</span>
            </div>
            <div className="rp-stat">
              <span className="rp-stat__label">Answered</span>
              <span className="rp-stat__value">{answered}</span>
            </div>
            <div className="rp-stat">
              <span className="rp-stat__label">Duration</span>
              <span className="rp-stat__value">{duration}</span>
            </div>
          </div>
        </div>

        {/* Completion badge */}
        <div className="rp-complete-badge" aria-label="Interview complete">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd"/>
          </svg>
          Interview Complete
        </div>
      </header>

      {/* ══════════════════════════════════════════════
          Q&A pairs
      ══════════════════════════════════════════════ */}
      <main className="rp-main">
        <div className="rp-main__inner">

          <h1 className="rp-section-title">Interview Transcript</h1>

          {pairs.length === 0 ? (
            <p className="rp-empty">No questions recorded.</p>
          ) : (
            <ol className="rp-qa-list">
              {pairs.map((pair) => (
                <li key={pair.qNum} className="rp-qa-item">

                  {/* Question */}
                  <div className="rp-turn rp-turn--mentor">
                    <div className="rp-turn__meta">
                      <span className="rp-turn__label rp-turn__label--mentor">
                        {/* Speaker icon */}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                        </svg>
                        {interviewer.name}
                      </span>
                      {pair.questionTs && (
                        <span className="rp-turn__ts">{fmtTime(pair.questionTs)}</span>
                      )}
                    </div>
                    <p className="rp-turn__text">{pair.question}</p>
                  </div>

                  {/* Answer */}
                  {pair.answer ? (
                    <div className="rp-turn rp-turn--user">
                      <div className="rp-turn__meta">
                        <span className="rp-turn__label rp-turn__label--user">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                          </svg>
                          You
                        </span>
                        {pair.answerTs && (
                          <span className="rp-turn__ts">{fmtTime(pair.answerTs)}</span>
                        )}
                      </div>
                      <p className="rp-turn__text">{pair.answer}</p>
                    </div>
                  ) : (
                    <div className="rp-turn rp-turn--unanswered">
                      <p className="rp-turn__text rp-turn__text--dim">— Not answered —</p>
                    </div>
                  )}

                </li>
              ))}
            </ol>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════
          Footer CTA
      ══════════════════════════════════════════════ */}
      <footer className="rp-footer">
        <p className="rp-footer__hint">
          Ready to practise again? Start a new session to try a different role or interviewer.
        </p>
        <button
          type="button"
          className="btn btn-primary rp-cta-btn"
          onClick={handleNewInterview}
        >
          {/* Refresh icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
          Start New Interview
        </button>
      </footer>
    </div>
  );
}
