/**
 * InterviewPage.jsx
 *
 * Full-viewport mock video-call screen.
 *
 * Layout (dark, immersive — no visible nav):
 * ┌─────────────────────────────────────────────────┐
 * │  [HUD top-bar]  role pill · timer · live badge  │
 * ├───────────────────────┬─────────────────────────┤
 * │                       │                         │
 * │   INTERVIEWER tile    │    YOUR WEBCAM tile     │
 * │   (large avatar +     │    (getUserMedia video   │
 * │    speaking ring)     │     in call frame)      │
 * │                       │                         │
 * ├───────────────────────┴─────────────────────────┤
 * │  [SUBTITLES BAR]  last spoken line              │
 * │  [END INTERVIEW button]                         │
 * └─────────────────────────────────────────────────┘
 *
 * Context consumed:
 *   avatar    – id string ('male' | 'female' | 'robot')
 *   role      – target job role string
 *   resumeText – not displayed, reserved for AI calls
 *   transcript – array of { speaker, text } turns
 *   addTurn / clearTranscript
 *
 * Webcam:
 *   navigator.mediaDevices.getUserMedia({ video: true, audio: false })
 *   The stream is attached to a <video> element via a ref.
 *   The component cleans up the stream on unmount.
 *   If permission is denied the tile shows a graceful fallback.
 */
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useMockMentor } from '../context/MockMentorContext';
import './InterviewPage.css';

/* ─────────────────────────────────────────────────────────
   Static data — mirrors SetupPage INTERVIEWERS catalogue
───────────────────────────────────────────────────────── */
const INTERVIEWER_MAP = {
  male:   { name: 'Alex Turner', tag: 'Technical Lead',   src: '/avatars/interviewer-male.svg',   accent: 'cyan'   },
  female: { name: 'Priya Nair',  tag: 'Hiring Manager',   src: '/avatars/interviewer-female.svg', accent: 'violet' },
  robot:  { name: 'ARIA-7',      tag: 'AI Evaluator',     src: '/avatars/interviewer-robot.svg',  accent: 'teal'   },
};

/* Opening line spoken by the interviewer on session start */
const OPENING_LINE =
  "Welcome! I've reviewed your background. Let's get started — " +
  "tell me a little about yourself and why you're excited about this role.";

/* ─────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────── */
/** Format elapsed seconds as MM:SS */
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
  const {
    avatar,
    role,
    resumeText,
    transcript,
    addTurn,
    clearTranscript,
  } = useMockMentor();

  /* Resolve interviewer data from the avatar id saved in context */
  const interviewer = INTERVIEWER_MAP[avatar] ?? INTERVIEWER_MAP.male;

  /* ── Guard: redirect if session not configured ── */
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

  /* ─── Webcam ─────────────────────────────────────────── */
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);   // keep stream ref for cleanup
  const [camStatus, setCamStatus] = useState('idle'); // 'idle' | 'active' | 'denied'

  /** Start webcam stream and bind it to the <video> element */
  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false, // audio captured separately when STT is wired up
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamStatus('active');
    } catch {
      /* Permission denied or device not found */
      setCamStatus('denied');
    }
  }, []);

  /** Stop all webcam tracks */
  const stopWebcam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /* ─── Session timer ──────────────────────────────────── */
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  /* ─── Speaking / thinking state ─────────────────────── */
  const [isSpeaking,  setIsSpeaking]  = useState(false);  // interviewer "speaking"
  const [isThinking,  setIsThinking]  = useState(false);  // mentor generating reply

  /* ─── Subtitle line (last turn text) ────────────────── */
  const [subtitle, setSubtitle] = useState('');

  /* ─── Seed opening question once ────────────────────── */
  const seededRef = useRef(false);

  useEffect(() => {
    /* Start webcam */
    startWebcam();

    /* Start session timer */
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    /* Seed opening question after mount */
    if (!seededRef.current && transcript.length === 0) {
      seededRef.current = true;
      setIsSpeaking(true);
      setSubtitle(OPENING_LINE);
      const t = setTimeout(() => {
        addTurn('mentor', OPENING_LINE);
        setIsSpeaking(false);
      }, 2400);
      return () => clearTimeout(t);
    }

    return () => {
      clearInterval(timerRef.current);
      stopWebcam();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Keep subtitle in sync with the latest transcript turn */
  useEffect(() => {
    if (transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    setSubtitle(last.text);
  }, [transcript]);

  /* ─── End session ────────────────────────────────────── */
  function handleEndSession() {
    clearInterval(timerRef.current);
    stopWebcam();
    clearTranscript();
    navigate('/setup');
  }

  /* ─── Placeholder mentor reply (TODO: swap for real AI) ─ */
  function handleMentorReply() {
    if (isThinking || isSpeaking) return;
    setIsThinking(true);
    setTimeout(() => {
      const reply =
        `Interesting — as a ${role}, that kind of experience is valuable. ` +
        `Can you walk me through a specific challenge you've faced in that area?`;
      addTurn('mentor', reply);
      setIsSpeaking(true);
      setSubtitle(reply);
      setIsThinking(false);
      setTimeout(() => setIsSpeaking(false), 3000);
    }, 1400);
  }

  /* ─── Render ─────────────────────────────────────────── */
  return (
    <div className="iv-root">

      {/* ══════════════════════════════════════════════════
          HUD top-bar  (role · timer · live badge)
      ══════════════════════════════════════════════════ */}
      <header className="iv-hud">
        {/* Left: role pill */}
        <div className="iv-hud__left">
          <span className="iv-role-pill">{role}</span>
        </div>

        {/* Centre: app wordmark */}
        <div className="iv-hud__centre">
          <span className="iv-wordmark">⬡ MockMentor</span>
        </div>

        {/* Right: timer + live indicator */}
        <div className="iv-hud__right">
          <span className="iv-timer" aria-label="Session duration">
            {formatTime(elapsed)}
          </span>
          <span className="iv-live-badge" aria-label="Session live">
            <span className="iv-live-badge__dot" aria-hidden="true" />
            LIVE
          </span>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════
          Main call area — two tiles side by side
      ══════════════════════════════════════════════════ */}
      <main className="iv-stage">

        {/* ── Left tile: Interviewer ── */}
        <div
          className={[
            'iv-tile',
            'iv-tile--interviewer',
            `iv-tile--${interviewer.accent}`,
            isSpeaking ? 'iv-tile--speaking' : '',
          ].join(' ')}
          aria-label={`Interviewer: ${interviewer.name}`}
        >
          {/* Avatar image */}
          <div className="iv-avatar-frame">
            {/* Multi-ring glow — rings animate when speaking */}
            <div className="iv-avatar-ring iv-avatar-ring--outer" aria-hidden="true" />
            <div className="iv-avatar-ring iv-avatar-ring--inner" aria-hidden="true" />

            <img
              src={interviewer.src}
              alt={interviewer.name}
              className="iv-avatar-img"
              draggable={false}
            />
          </div>

          {/* Name/tag HUD overlay at bottom of tile */}
          <div className="iv-tile__hud">
            <span className="iv-tile__name">{interviewer.name}</span>
            <span className="iv-tile__tag">{interviewer.tag}</span>
          </div>

          {/* Speaking / thinking indicator top-right */}
          <div className="iv-tile__status" aria-live="polite">
            {isThinking ? (
              /* Typing dots */
              <span className="iv-dots" aria-label="Mentor is thinking">
                <span /><span /><span />
              </span>
            ) : isSpeaking ? (
              /* Sound-wave bars */
              <span className="iv-soundwave" aria-label="Mentor is speaking">
                <span /><span /><span /><span /><span />
              </span>
            ) : (
              /* Idle green dot */
              <span className="iv-idle-dot" aria-label="Mentor listening" />
            )}
          </div>

          {/* Holographic scan-line overlay */}
          <div className="iv-scanline" aria-hidden="true" />
        </div>

        {/* ── Right tile: User webcam ── */}
        <div
          className="iv-tile iv-tile--user"
          aria-label="Your video"
        >
          {camStatus === 'denied' ? (
            /* ── Camera denied / unavailable ── */
            <div className="iv-cam-fallback">
              <div className="iv-cam-fallback__icon" aria-hidden="true">
                {/* Camera-slash inline SVG */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 2l20 20M10.5 6H19a2 2 0 0 1 2 2v9M5 5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11"/>
                  <path d="m15 10-3 3m0 0-3 3M12 7v.01"/>
                </svg>
              </div>
              <p className="iv-cam-fallback__msg">Camera access denied</p>
              <button
                type="button"
                className="btn btn-outline iv-cam-retry"
                onClick={startWebcam}
              >
                Retry
              </button>
            </div>
          ) : (
            /* ── Live webcam video ── */
            <>
              <video
                ref={videoRef}
                className="iv-webcam"
                autoPlay
                playsInline
                muted          /* muted — audio handled separately */
                aria-label="Your camera preview"
              />
              {/* Mic/cam status pills overlaid on video */}
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
              {/* Webcam loading shimmer — hidden once stream starts */}
              {camStatus === 'idle' && (
                <div className="iv-cam-shimmer" aria-hidden="true" />
              )}
            </>
          )}

          {/* User name HUD overlay */}
          <div className="iv-tile__hud iv-tile__hud--user">
            <span className="iv-tile__name">You</span>
          </div>

          {/* Corner bracket decoration */}
          <div className="iv-corner iv-corner--tl" aria-hidden="true" />
          <div className="iv-corner iv-corner--tr" aria-hidden="true" />
          <div className="iv-corner iv-corner--bl" aria-hidden="true" />
          <div className="iv-corner iv-corner--br" aria-hidden="true" />
        </div>
      </main>

      {/* ══════════════════════════════════════════════════
          Bottom bar — subtitles + end button
      ══════════════════════════════════════════════════ */}
      <footer className="iv-bottom">

        {/* Subtitles area */}
        <div className="iv-subtitles" aria-live="polite" aria-label="Subtitles">
          {subtitle ? (
            <p className="iv-subtitles__text">{subtitle}</p>
          ) : (
            <p className="iv-subtitles__placeholder">Subtitles will appear here…</p>
          )}
        </div>

        {/* Controls row — ONLY the End Interview button (+ hidden dev trigger) */}
        <div className="iv-controls">
          {/* Dev trigger: simulate mentor reply (remove when AI is wired up) */}
          <button
            type="button"
            className="iv-trigger-btn"
            onClick={handleMentorReply}
            disabled={isThinking || isSpeaking}
            title="Simulate mentor reply (dev)"
            aria-label="Trigger next mentor response"
          >
            {isThinking ? (
              <span className="iv-trigger-spinner" aria-hidden="true" />
            ) : (
              /* Mic icon */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 10a6.5 6.5 0 0 1-13 0H4a8 8 0 0 0 7 7.93V21h2v-2.07A8 8 0 0 0 20 11h-1.5z"/>
              </svg>
            )}
          </button>

          {/* End session — the only prominently visible button */}
          <button
            type="button"
            className="iv-end-btn"
            onClick={handleEndSession}
            aria-label="End interview session"
          >
            {/* Phone-hang-up icon */}
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
