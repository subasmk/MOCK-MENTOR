/**
 * InterviewPage.jsx
 *
 * Full-viewport mock video-call screen with live Gemini AI interviewer.
 *
 * Layout (dark, immersive — navbar suppressed by Layout.jsx):
 * ┌─────────────────────────────────────────────────┐
 * │  [HUD top-bar]  role pill · timer · live badge  │
 * ├───────────────────────┬─────────────────────────┤
 * │   INTERVIEWER tile    │    YOUR WEBCAM tile     │
 * │   (avatar + rings)    │    (getUserMedia)       │
 * ├───────────────────────┴─────────────────────────┤
 * │  [SUBTITLES]  last Gemini line (aria-live)      │
 * │  [TEXT INPUT]  type answer + Send (fallback)    │
 * │  [END INTERVIEW]  single prominent button       │
 * └─────────────────────────────────────────────────┘
 *
 * Gemini integration
 * ──────────────────
 * • On mount, an initial "START" sentinel is sent to Gemini via askGemini().
 *   The system instruction (in gemini.js) tells the model to start immediately
 *   with its first question — so the first response IS question 1.
 * • Every user answer is sent with the full geminiHistory so the model has
 *   context for follow-up questions and feedback.
 * • geminiHistory is kept in a ref (not state) to avoid re-renders; it is
 *   appended after each exchange.
 * • The display transcript (addTurn) is separate — it drives the subtitle and
 *   is stored in shared context for other components to read.
 * • If VITE_GEMINI_KEY is unset an in-app error message is shown instead of
 *   crashing.
 *
 * Text input fallback
 * ───────────────────
 * A text input + Send button sits in the bottom bar so the user can type their
 * answers during testing (or when microphone STT is not yet wired up).
 * Submit with Enter or the Send button.
 *
 * Webcam
 * ──────
 * getUserMedia({ video: true, audio: false }) — stream cleaned up on unmount.
 */
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useNavigate }    from 'react-router-dom';
import { useMockMentor }  from '../context/MockMentorContext';
import { askGemini }      from '../services/gemini';
import './InterviewPage.css';

/* ─────────────────────────────────────────────────────────
   Interviewer catalogue (mirrors SetupPage)
───────────────────────────────────────────────────────── */
const INTERVIEWER_MAP = {
  male:   { name: 'Alex Turner', tag: 'Technical Lead',  src: '/avatars/interviewer-male.svg',   accent: 'cyan'   },
  female: { name: 'Priya Nair',  tag: 'Hiring Manager',  src: '/avatars/interviewer-female.svg', accent: 'violet' },
  robot:  { name: 'ARIA-7',      tag: 'AI Evaluator',    src: '/avatars/interviewer-robot.svg',  accent: 'teal'   },
};

/* Sentinel text sent as the very first user turn to trigger question 1 */
const FIRST_TURN_SENTINEL = '__START_INTERVIEW__';

/* ─────────────────────────────────────────────────────────
   Helper — MM:SS timer
───────────────────────────────────────────────────────── */
function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* ─────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────── */
export default function InterviewPage() {
  const navigate = useNavigate();
  const { avatar, role, resumeText, transcript, addTurn, clearTranscript } =
    useMockMentor();

  /* Resolve interviewer persona from the id stored in context */
  const interviewer = INTERVIEWER_MAP[avatar] ?? INTERVIEWER_MAP.male;

  /* ── Guard: bounce to setup if session not configured ── */
  if (!role || !resumeText) {
    return (
      <div className="iv-gate">
        <p className="iv-gate__msg">No active session — please complete setup first.</p>
        <button className="btn btn-primary" onClick={() => navigate('/setup')}>
          Go to Setup
        </button>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────
     Gemini conversation history
     Kept in a ref so appending never causes re-renders.
     Format: Array<{ role: 'user'|'model', parts: [{text}] }>
  ───────────────────────────────────────────────────── */
  const geminiHistoryRef = useRef([]);

  /* ─────────────────────────────────────────────────────
     Webcam
  ───────────────────────────────────────────────────── */
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [camStatus, setCamStatus] = useState('idle'); // 'idle'|'active'|'denied'

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamStatus('active');
    } catch {
      setCamStatus('denied');
    }
  }, []);

  const stopWebcam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /* ─────────────────────────────────────────────────────
     Session timer
  ───────────────────────────────────────────────────── */
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  /* ─────────────────────────────────────────────────────
     UI state
  ───────────────────────────────────────────────────── */
  const [isSpeaking, setIsSpeaking] = useState(false); // interviewer speaking
  const [isLoading,  setIsLoading]  = useState(false); // waiting for Gemini
  const [subtitle,   setSubtitle]   = useState('');
  const [apiError,   setApiError]   = useState('');    // surfaced in subtitle area
  const [isDone,     setIsDone]     = useState(false); // interview complete flag

  /* Text input fallback */
  const [inputText,  setInputText]  = useState('');
  const inputRef = useRef(null);

  /* Prevent double-seeding on StrictMode double-invoke */
  const seededRef = useRef(false);

  /* ─────────────────────────────────────────────────────
     Core: call Gemini and handle reply
  ───────────────────────────────────────────────────── */
  /**
   * Send a user message to Gemini, append both turns to the local history,
   * update the display transcript, and show the reply in the subtitle bar.
   *
   * @param {string} userText  — the candidate's answer text.
   *   Pass FIRST_TURN_SENTINEL on first load to trigger question 1 without
   *   displaying anything as a user turn in the transcript.
   */
  const sendToGemini = useCallback(async (userText) => {
    setIsLoading(true);
    setApiError('');

    try {
      /* Call Gemini with the current history + new user message */
      const reply = await askGemini({
        history:     geminiHistoryRef.current,
        userMessage: userText,
        resumeText,
        role,
      });

      /* Append both turns to local Gemini history */
      geminiHistoryRef.current = [
        ...geminiHistoryRef.current,
        { role: 'user',  parts: [{ text: userText }] },
        { role: 'model', parts: [{ text: reply    }] },
      ];

      /* Update display transcript and subtitle — only for real turns */
      if (userText !== FIRST_TURN_SENTINEL) {
        addTurn('user', userText);
      }
      addTurn('mentor', reply);
      setSubtitle(reply);

      /* Animate "speaking" ring for the duration of the reply text */
      const speakDuration = Math.min(4000, Math.max(2000, reply.length * 40));
      setIsSpeaking(true);
      setTimeout(() => setIsSpeaking(false), speakDuration);

      /* Detect interview completion: model says interview is over */
      const completionPhrases = [
        'interview is complete', 'interview is now complete',
        'that concludes', 'that wraps up', 'we have covered all',
        'all 6 questions', 'all six questions',
      ];
      if (completionPhrases.some((p) => reply.toLowerCase().includes(p))) {
        setIsDone(true);
      }

    } catch (err) {
      /* Surface the error in the subtitle bar rather than crashing */
      const msg = err.message || 'Gemini request failed.';
      setApiError(msg);
      setSubtitle('');
    } finally {
      setIsLoading(false);
    }
  }, [resumeText, role, addTurn]);

  /* ─────────────────────────────────────────────────────
     Mount: start webcam + timer + first Gemini turn
  ───────────────────────────────────────────────────── */
  useEffect(() => {
    startWebcam();
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    /* Trigger question 1 exactly once */
    if (!seededRef.current) {
      seededRef.current = true;
      sendToGemini(FIRST_TURN_SENTINEL);
    }

    return () => {
      clearInterval(timerRef.current);
      stopWebcam();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─────────────────────────────────────────────────────
     Submit handler — text input fallback
  ───────────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || isLoading || isSpeaking || isDone) return;
    setInputText('');
    await sendToGemini(text);
    /* Re-focus input after reply arrives */
    inputRef.current?.focus();
  }

  /* Ctrl/Cmd + Enter also submits */
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  /* ─────────────────────────────────────────────────────
     End session
  ───────────────────────────────────────────────────── */
  function handleEndSession() {
    clearInterval(timerRef.current);
    stopWebcam();
    clearTranscript();
    navigate('/setup');
  }

  /* ─────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────── */
  return (
    <div className="iv-root">

      {/* ══════════════════════════════════════════════
          HUD — role · wordmark · timer · live
      ══════════════════════════════════════════════ */}
      <header className="iv-hud">
        <div className="iv-hud__left">
          <span className="iv-role-pill">{role}</span>
        </div>
        <div className="iv-hud__centre">
          <span className="iv-wordmark">⬡ MockMentor</span>
        </div>
        <div className="iv-hud__right">
          <span className="iv-timer" aria-label="Session duration">{formatTime(elapsed)}</span>
          <span className="iv-live-badge" aria-label="Session live">
            <span className="iv-live-badge__dot" aria-hidden="true" />
            LIVE
          </span>
        </div>
      </header>

      {/* ══════════════════════════════════════════════
          Stage — interviewer tile + webcam tile
      ══════════════════════════════════════════════ */}
      <main className="iv-stage">

        {/* ── Left: Interviewer ── */}
        <div
          className={[
            'iv-tile iv-tile--interviewer',
            `iv-tile--${interviewer.accent}`,
            isSpeaking ? 'iv-tile--speaking' : '',
          ].join(' ')}
          aria-label={`Interviewer: ${interviewer.name}`}
        >
          <div className="iv-avatar-frame">
            <div className="iv-avatar-ring iv-avatar-ring--outer" aria-hidden="true" />
            <div className="iv-avatar-ring iv-avatar-ring--inner" aria-hidden="true" />
            <img
              src={interviewer.src}
              alt={interviewer.name}
              className="iv-avatar-img"
              draggable={false}
            />
          </div>

          {/* Name / role HUD at tile bottom */}
          <div className="iv-tile__hud">
            <span className="iv-tile__name">{interviewer.name}</span>
            <span className="iv-tile__tag">{interviewer.tag}</span>
          </div>

          {/* Status indicator — top-right corner */}
          <div className="iv-tile__status" aria-live="polite">
            {isLoading ? (
              /* Bouncing dots while waiting for Gemini */
              <span className="iv-dots" aria-label="Interviewer is thinking">
                <span /><span /><span />
              </span>
            ) : isSpeaking ? (
              /* Sound-wave bars while "speaking" */
              <span className="iv-soundwave" aria-label="Interviewer is speaking">
                <span /><span /><span /><span /><span />
              </span>
            ) : (
              /* Idle green dot */
              <span className="iv-idle-dot" aria-label="Interviewer listening" />
            )}
          </div>

          <div className="iv-scanline" aria-hidden="true" />
        </div>

        {/* ── Right: Webcam ── */}
        <div className="iv-tile iv-tile--user" aria-label="Your video">
          {camStatus === 'denied' ? (
            <div className="iv-cam-fallback">
              <div className="iv-cam-fallback__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 2l20 20M10.5 6H19a2 2 0 0 1 2 2v9M5 5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11"/>
                  <path d="m15 10-3 3m0 0-3 3M12 7v.01"/>
                </svg>
              </div>
              <p className="iv-cam-fallback__msg">Camera access denied</p>
              <button type="button" className="btn btn-outline iv-cam-retry" onClick={startWebcam}>
                Retry
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="iv-webcam"
                autoPlay
                playsInline
                muted
                aria-label="Your camera preview"
              />
              <div className="iv-cam-pills" aria-hidden="true">
                <span className="iv-cam-pill iv-cam-pill--cam">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                  CAM
                </span>
                <span className="iv-cam-pill iv-cam-pill--mic iv-cam-pill--muted">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 10a6.5 6.5 0 0 1-13 0H4a8 8 0 0 0 7 7.93V21h2v-2.07A8 8 0 0 0 20 11h-1.5z"/>
                  </svg>
                  MIC OFF
                </span>
              </div>
              {camStatus === 'idle' && <div className="iv-cam-shimmer" aria-hidden="true" />}
            </>
          )}

          <div className="iv-tile__hud iv-tile__hud--user">
            <span className="iv-tile__name">You</span>
          </div>

          <div className="iv-corner iv-corner--tl" aria-hidden="true" />
          <div className="iv-corner iv-corner--tr" aria-hidden="true" />
          <div className="iv-corner iv-corner--bl" aria-hidden="true" />
          <div className="iv-corner iv-corner--br" aria-hidden="true" />
        </div>
      </main>

      {/* ══════════════════════════════════════════════
          Bottom bar — subtitles · input · end button
      ══════════════════════════════════════════════ */}
      <footer className="iv-bottom">

        {/* ── Subtitles / error area ── */}
        <div className="iv-subtitles" aria-live="polite" aria-label="Subtitles">
          {apiError ? (
            /* API key missing or request failed */
            <p className="iv-subtitles__error">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{flexShrink:0}}>
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd"/>
              </svg>
              {apiError}
            </p>
          ) : isLoading && !subtitle ? (
            /* First load — show loading state before any reply arrives */
            <p className="iv-subtitles__loading">
              <span className="iv-subtitles__loading-dots">
                <span /><span /><span />
              </span>
              Preparing your first question…
            </p>
          ) : subtitle ? (
            <p className="iv-subtitles__text">{subtitle}</p>
          ) : (
            <p className="iv-subtitles__placeholder">Subtitles will appear here…</p>
          )}
        </div>

        {/* ── Text input fallback ── */}
        {!isDone && (
          <form
            className="iv-input-row"
            onSubmit={handleSubmit}
            aria-label="Type your answer"
          >
            <input
              ref={inputRef}
              type="text"
              className="iv-input"
              placeholder={
                isLoading
                  ? 'Waiting for interviewer…'
                  : isSpeaking
                  ? 'Interviewer is speaking…'
                  : 'Type your answer and press Enter…'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isSpeaking}
              autoComplete="off"
              aria-label="Your answer"
            />
            <button
              type="submit"
              className="iv-send-btn"
              disabled={!inputText.trim() || isLoading || isSpeaking}
              aria-label="Send answer"
            >
              {isLoading ? (
                <span className="iv-trigger-spinner" aria-hidden="true" />
              ) : (
                /* Send / arrow icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              )}
            </button>
          </form>
        )}

        {/* ── Controls — End Interview only ── */}
        <div className="iv-controls">
          {isDone && (
            <span className="iv-done-badge" aria-live="polite">
              ✓ Interview complete
            </span>
          )}
          <button
            type="button"
            className="iv-end-btn"
            onClick={handleEndSession}
            aria-label="End interview session"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
            End Interview
          </button>
        </div>
      </footer>
    </div>
  );
}
