/**
 * ReportPage.jsx  —  /report
 *
 * Futuristic game-results screen that surfaces after a monitoring/interview session.
 *
 * Data sources (both optional — page degrades gracefully if either is absent):
 *   A. MockMentorContext  — interview transcript + role + avatar
 *   B. localStorage       — latest vision session (mm_vision_sessions)
 *
 * Sections (top → bottom):
 *   1. Hero banner       — SESSION COMPLETE, duration, date
 *   2. Transcript panel  — scrollable holographic Q&A
 *   3. Score rings       — Confidence · Eye Contact · Non-Fearful · Face Presence
 *   4. Expression bars   — horizontal breakdown of the four categories
 *   5. Session stats     — compact data grid
 *   6. Footer nav        — Start New Session · Back to Dashboard
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { useNavigate }        from 'react-router-dom';
import { useMockMentor }      from '../context/MockMentorContext';
import { getSavedSessions }   from '../tracking/sessionManager';
import './ReportPage.css';

/* ─────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────── */
const INTERVIEWER_MAP = {
  male:   { name: 'Alex Turner', tag: 'Technical Lead' },
  female: { name: 'Priya Nair',  tag: 'Hiring Manager' },
  robot:  { name: 'ARIA-7',      tag: 'AI Evaluator'   },
};

/* ─────────────────────────────────────────────────────────
   Pure helpers
───────────────────────────────────────────────────────── */
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtSecs(totalSecs) {
  const s   = Math.floor(totalSecs ?? 0);
  const m   = Math.floor(s / 60);
  const rem = String(s % 60).padStart(2, '0');
  return m > 0 ? `${m}m ${rem}s` : `${s}s`;
}

function fmtMM(totalSecs) {
  const s = Math.floor(totalSecs ?? 0);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function computeConfidence(eyeContactPct, expressionCounts) {
  const { neutral = 0, happy = 0, fearful = 0, surprised = 0 } = expressionCounts ?? {};
  const total = neutral + happy + fearful + surprised;
  if (total === 0) return null;
  const eyeScore        = Math.min(100, Math.max(0, eyeContactPct ?? 0));
  const nonFearfulPct   = ((neutral + happy + surprised) / total) * 100;
  const overall         = eyeScore * 0.5 + nonFearfulPct * 0.5;
  return {
    overall:         +Math.min(100, Math.max(0, overall)).toFixed(1),
    eyeScore:        +eyeScore.toFixed(1),
    nonFearfulScore: +nonFearfulPct.toFixed(1),
  };
}

function facePresencePct(stats) {
  const { expressionCounts, noFaceCount } = stats ?? {};
  const { neutral = 0, happy = 0, fearful = 0, surprised = 0 } = expressionCounts ?? {};
  const faceCount = neutral + happy + fearful + surprised;
  const total     = faceCount + (noFaceCount ?? 0);
  if (total === 0) return null;
  return +((faceCount / total) * 100).toFixed(1);
}

/* ─────────────────────────────────────────────────────────
   ScoreRing — animated SVG circular progress indicator
───────────────────────────────────────────────────────── */
function ScoreRing({ pct, label, sublabel, color = 'var(--color-accent)', size = 160 }) {
  const radius        = (size - 24) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled        = pct !== null ? Math.min(100, Math.max(0, pct)) : 0;
  const offset        = circumference - (filled / 100) * circumference;

  return (
    <div
      className="rp2-ring"
      style={{ '--ring-color': color, width: size, height: size }}
      aria-label={`${label}: ${pct !== null ? Math.round(pct) + '%' : 'no data'}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track ring */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="12"
        />
        {/* Glow duplicate (blurred, slightly wider) */}
        <circle
          className="rp2-ring__glow"
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{
            '--circ':   circumference,
            '--offset': offset,
            strokeDashoffset: offset,
            opacity: 0.25,
            filter: 'blur(4px)',
          }}
        />
        {/* Active arc */}
        <circle
          className="rp2-ring__arc"
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{
            '--circ':   circumference,
            '--offset': offset,
            strokeDashoffset: offset,
          }}
        />
      </svg>

      {/* Centre text */}
      <div className="rp2-ring__center">
        <span className="rp2-ring__pct">
          {pct !== null ? `${Math.round(pct)}%` : '--'}
        </span>
        <span className="rp2-ring__label">{label}</span>
        {sublabel && <span className="rp2-ring__sub">{sublabel}</span>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   StatRow — single label / value pair
───────────────────────────────────────────────────────── */
function StatRow({ label, value }) {
  return (
    <div className="rp2-stat-row">
      <span className="rp2-stat-row__label">{label}</span>
      <span className="rp2-stat-row__value">{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ExpressionBars — horizontal bar breakdown
───────────────────────────────────────────────────────── */
function ExpressionBars({ counts }) {
  const items = [
    { key: 'neutral',   label: 'Neutral',   color: 'var(--color-text-muted)' },
    { key: 'happy',     label: 'Happy',     color: 'var(--color-success)' },
    { key: 'surprised', label: 'Surprised', color: '#a78bfa' },
    { key: 'fearful',   label: 'Fearful',   color: 'var(--color-danger)' },
  ];
  const max = Math.max(1, ...items.map(({ key }) => counts[key] ?? 0));

  return (
    <div className="rp2-expr-bars">
      {items.map(({ key, label, color }) => {
        const count = counts[key] ?? 0;
        const pct   = (count / max) * 100;
        return (
          <div key={key} className="rp2-expr-bar-row">
            <span className="rp2-expr-bar-row__label">{label}</span>
            <div className="rp2-expr-bar-row__track">
              <div
                className="rp2-expr-bar-row__fill"
                style={{ '--bar-pct': `${pct}%`, '--bar-color': color }}
              />
            </div>
            <span className="rp2-expr-bar-row__count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   TranscriptPanel — scrollable holographic Q&A
───────────────────────────────────────────────────────── */
function TranscriptPanel({ transcript, interviewer }) {
  if (!transcript || transcript.length === 0) {
    return (
      <div className="rp2-transcript rp2-transcript--empty">
        <div className="rp2-transcript__empty-inner">
          <span className="rp2-transcript__empty-icon" aria-hidden="true">◎</span>
          <p className="rp2-transcript__empty-msg">No transcript recorded for this session.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rp2-transcript" role="log" aria-label="Session transcript">
      {/* Scanline fade at top */}
      <div className="rp2-transcript__fade-top" aria-hidden="true" />
      <div className="rp2-transcript__inner">
        {transcript.map((turn) => {
          const isMentor = turn.speaker === 'mentor';
          return (
            <div
              key={turn.id ?? turn.timestamp}
              className={`rp2-turn rp2-turn--${isMentor ? 'ai' : 'user'}`}
            >
              <div className="rp2-turn__meta">
                <span className="rp2-turn__ts">{fmtTime(turn.timestamp)}</span>
                <span className="rp2-turn__speaker">
                  {isMentor ? (interviewer?.name ?? 'AI') : 'YOU'}
                </span>
              </div>
              <p className="rp2-turn__text">{turn.text}</p>
            </div>
          );
        })}
      </div>
      {/* Scanline fade at bottom */}
      <div className="rp2-transcript__fade-bottom" aria-hidden="true" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   SectionHead — labelled section header
───────────────────────────────────────────────────────── */
function SectionHead({ icon, title, badge }) {
  return (
    <div className="rp2-section__head">
      <h2 className="rp2-section__title">
        <span className="rp2-section__title-icon" aria-hidden="true">{icon}</span>
        {title}
      </h2>
      {badge != null && (
        <span className="rp2-section__badge">{badge}</span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Main page component
───────────────────────────────────────────────────────── */
export default function ReportPage() {
  const navigate = useNavigate();
  const { transcript, role, avatar, clearTranscript } = useMockMentor();

  const interviewer = INTERVIEWER_MAP[avatar] ?? INTERVIEWER_MAP.male;

  /* Load the latest saved vision session from localStorage */
  const visionSession = useMemo(() => {
    const sessions = getSavedSessions();
    return sessions.length > 0 ? sessions[sessions.length - 1] : null;
  }, []);

  const vStats = visionSession?.stats ?? null;

  /* Derived metrics */
  const confidence = useMemo(() => {
    if (!vStats) return null;
    return computeConfidence(vStats.eyeContactPct, vStats.expressionCounts);
  }, [vStats]);

  const facePct = useMemo(() => (vStats ? facePresencePct(vStats) : null), [vStats]);

  /* Session timing */
  const sessionDate = visionSession?.startedAt ?? transcript?.[0]?.timestamp ?? null;
  const sessionDuration = vStats
    ? fmtMM(vStats.sessionDuration)
    : transcript.length >= 2
      ? fmtMM(
          (new Date(transcript[transcript.length - 1]?.timestamp) -
            new Date(transcript[0]?.timestamp)) /
            1000,
        )
      : null;

  /* Expression counts */
  const { neutral = 0, happy = 0, fearful = 0, surprised = 0 } =
    vStats?.expressionCounts ?? {};
  const totalExpressions = neutral + happy + fearful + surprised;
  const totalSamples     = totalExpressions + (vStats?.noFaceCount ?? 0);

  /* Gate flags */
  const hasVision     = vStats !== null;
  const hasTranscript = transcript && transcript.length > 0;
  const hasAnything   = hasVision || hasTranscript;

  /* ── Entrance animation trigger ── */
  const rootRef = useRef(null);
  useEffect(() => {
    // Trigger CSS animation classes after a micro-tick so transitions fire
    const t = setTimeout(() => {
      rootRef.current?.classList.add('rp2-root--ready');
    }, 50);
    return () => clearTimeout(t);
  }, []);

  /* ── Gate: nothing to show ── */
  if (!hasAnything) {
    return (
      <div className="rp2-gate">
        <div className="rp2-gate__icon" aria-hidden="true">◎</div>
        <h1 className="rp2-gate__title">No Session Data</h1>
        <p className="rp2-gate__msg">
          Complete a vision monitoring session or interview first.
        </p>
        <div className="rp2-gate__actions">
          <button className="btn btn-primary" onClick={() => navigate('/vision')}>
            Start Vision Session
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/setup')}>
            Go to Setup
          </button>
        </div>
      </div>
    );
  }

  /* ── Handlers ── */
  function handleNewSession() {
    clearTranscript();
    navigate('/vision');
  }

  function handleDashboard() {
    navigate('/setup');
  }

  /* ─────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────── */
  return (
    <div className="rp2-root" ref={rootRef}>

      {/* ══════════════════════════════════════════════════
          1. HERO BANNER
      ══════════════════════════════════════════════════ */}
      <header className="rp2-hero">
        <div className="rp2-hero__grid" aria-hidden="true" />
        <div className="rp2-hero__scan" aria-hidden="true" />

        <div className="rp2-hero__inner">
          <p className="rp2-hero__eyebrow">
            <span className="rp2-hero__eyebrow-dot" aria-hidden="true" />
            SESSION COMPLETE
          </p>

          <h1 className="rp2-hero__title">Communication Report</h1>
          <p className="rp2-hero__sub">Your session results are ready</p>

          <div className="rp2-hero__meta">
            {sessionDuration && (
              <span className="rp2-hero__pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
                </svg>
                {sessionDuration}
              </span>
            )}
            {sessionDate && (
              <span className="rp2-hero__pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/>
                </svg>
                {fmtDate(sessionDate)}
              </span>
            )}
            {role && (
              <span className="rp2-hero__pill rp2-hero__pill--role">
                {role}
              </span>
            )}
          </div>

          <p className="rp2-hero__brand" aria-hidden="true">⬡ MockMentor</p>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════
          2. TRANSCRIPT
      ══════════════════════════════════════════════════ */}
      <section className="rp2-section" aria-labelledby="rp2-transcript-heading">
        <SectionHead
          icon="▶"
          title="Transcript"
          badge={hasTranscript ? `${transcript.length} turns` : null}
          id="rp2-transcript-heading"
        />
        <TranscriptPanel transcript={transcript} interviewer={interviewer} />
      </section>

      {/* ══════════════════════════════════════════════════
          3. SCORE RINGS
      ══════════════════════════════════════════════════ */}
      {hasVision && (
        <section className="rp2-section" aria-labelledby="rp2-scores-heading">
          <SectionHead icon="◎" title="Session Score" id="rp2-scores-heading" />

          <div className="rp2-rings-grid">
            <div className="rp2-ring-cell">
              <ScoreRing
                pct={confidence?.overall ?? null}
                label="CONFIDENCE"
                sublabel={
                  confidence
                    ? `${confidence.eyeScore}% eye · ${confidence.nonFearfulScore}% expr`
                    : undefined
                }
                color="var(--color-accent)"
                size={172}
              />
            </div>
            <div className="rp2-ring-cell">
              <ScoreRing
                pct={vStats?.eyeContactPct ?? null}
                label="EYE CONTACT"
                sublabel={vStats ? fmtSecs(vStats.eyeContactDuration) : undefined}
                color="var(--color-glow-teal)"
                size={172}
              />
            </div>
            <div className="rp2-ring-cell">
              <ScoreRing
                pct={confidence?.nonFearfulScore ?? null}
                label="NON-FEARFUL"
                sublabel={
                  totalExpressions > 0
                    ? `${totalExpressions} detections`
                    : undefined
                }
                color="#a78bfa"
                size={172}
              />
            </div>
            <div className="rp2-ring-cell">
              <ScoreRing
                pct={facePct}
                label="FACE PRESENCE"
                sublabel={
                  totalSamples > 0 ? `${totalSamples} samples` : undefined
                }
                color="var(--color-success)"
                size={172}
              />
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          4 & 5. EXPRESSION BREAKDOWN + SESSION DATA
          Side-by-side on wide screens, stacked on mobile
      ══════════════════════════════════════════════════ */}
      {hasVision && (
        <div className="rp2-lower-row">

          {/* Expression Breakdown */}
          {totalExpressions > 0 && (
            <section
              className="rp2-section rp2-section--card"
              aria-labelledby="rp2-expr-heading"
            >
              <SectionHead icon="≡" title="Expression Breakdown" id="rp2-expr-heading" />
              <ExpressionBars counts={vStats.expressionCounts} />
            </section>
          )}

          {/* Session Data */}
          <section
            className="rp2-section rp2-section--card"
            aria-labelledby="rp2-stats-heading"
          >
            <SectionHead icon="▦" title="Session Data" id="rp2-stats-heading" />

            <div className="rp2-stats-grid">
              <div className="rp2-stats-col">
                <StatRow label="Duration"     value={fmtSecs(vStats.sessionDuration)} />
                <StatRow label="Samples"       value={totalSamples} />
                <StatRow label="Eye Contact"   value={fmtSecs(vStats.eyeContactDuration)} />
                <StatRow label="Eye Contact %"  value={`${vStats.eyeContactPct}%`} />
                {confidence && (
                  <StatRow label="Confidence"  value={`${confidence.overall}%`} />
                )}
              </div>
              <div className="rp2-stats-col">
                <StatRow label="Neutral"   value={neutral} />
                <StatRow label="Happy"     value={happy} />
                <StatRow label="Fearful"   value={fearful} />
                <StatRow label="Surprised" value={surprised} />
                <StatRow label="No Face"   value={vStats.noFaceCount} />
              </div>
            </div>
          </section>

        </div>
      )}

      {/* ══════════════════════════════════════════════════
          6. FOOTER NAV
      ══════════════════════════════════════════════════ */}
      <footer className="rp2-footer">
        <button
          type="button"
          className="btn btn-primary rp2-footer__btn"
          onClick={handleNewSession}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Start New Session
        </button>
        <button
          type="button"
          className="btn btn-ghost rp2-footer__btn"
          onClick={handleDashboard}
        >
          Back to Dashboard
        </button>
      </footer>

    </div>
  );
}
