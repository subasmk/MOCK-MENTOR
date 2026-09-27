/**
 * VisionPage.jsx
 *
 * Real-time facial computer-vision dashboard.
 *
 * Architecture
 * ────────────
 *  Camera layer   — getUserMedia → <video ref>
 *  Detection      — faceTracker.startTracking(videoEl, onSample)  [1 s interval]
 *  Session        — sessionManager.createSession()                [per Start click]
 *  UI state       — React state updated on every sample callback
 *
 * Components (all in this file, separated by clear comment blocks):
 *   <VisionPage>       — root controller + state
 *   <CameraPanel>      — live <video> + overlay badges
 *   <StatusBar>        — face detected / expression / eye-contact at-a-glance row
 *   <StatCard>         — generic labelled metric card
 *   <ExpressionGrid>   — 2×2 grid of the four expression counters
 *   <RecordTable>      — scrollable table of per-second detection records
 */

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';

import { startTracking, stopTracking, loadModels } from '../tracking/faceTracker';
import { createSession }                            from '../tracking/sessionManager';
import './VisionPage.css';

/* ═══════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════ */

/** Format seconds as "Xm Ys" or "Ys" */
function fmtSecs(totalSecs) {
  const s = Math.floor(totalSecs);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m > 0) return `${m}m ${rem.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

/* ═══════════════════════════════════════════════════════════
   Confidence Score
═══════════════════════════════════════════════════════════ */

/**
 * Compute the two-component confidence score from live session stats.
 *
 * Returns null when there is insufficient data (no expressions detected yet),
 * so the UI can display "--" instead of a misleading 0.
 *
 * @param {{ eyeContactPct: number, expressionCounts: object }} stats
 * @returns {{ eyeScore: number, nonFearfulScore: number, overall: number } | null}
 */
function computeConfidence(stats) {
  const { eyeContactPct, expressionCounts } = stats;
  const { neutral, happy, fearful, surprised } = expressionCounts;

  const totalExpressions = neutral + happy + fearful + surprised;

  // Not enough data yet
  if (totalExpressions === 0) return null;

  // A: eye-contact score — already a 0-100 percentage
  const eyeScore = Math.min(100, Math.max(0, eyeContactPct));

  // B: non-fearful expression percentage
  const nonFearfulScore = ((neutral + happy + surprised) / totalExpressions) * 100;

  // 50/50 weighted overall
  const overall = eyeScore * 0.5 + nonFearfulScore * 0.5;

  return {
    eyeScore:       +eyeScore.toFixed(1),
    nonFearfulScore: +nonFearfulScore.toFixed(1),
    overall:        +Math.min(100, Math.max(0, overall)).toFixed(1),
  };
}

/**
 * Exponentially-weighted average smoother.
 * α = 0.25 means new samples contribute 25% of the update — gentle smoothing
 * that responds within ~4 samples but avoids jarring frame-to-frame jumps.
 */
const SMOOTH_ALPHA = 0.25;

function smoothValue(prev, next) {
  if (prev === null) return next;
  return prev + SMOOTH_ALPHA * (next - prev);
}

/** Format ISO timestamp as HH:MM:SS */
function fmtTs(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const EXPRESSION_EMOJI = {
  neutral:   '😐',
  happy:     '😊',
  fearful:   '😨',
  surprised: '😲',
};

const EXPRESSION_COLOR = {
  neutral:   'var(--color-text-muted)',
  happy:     'var(--color-success)',
  fearful:   '#f97316',
  surprised: 'var(--color-glow-violet)',
};

/* ═══════════════════════════════════════════════════════════
   Sub-components
═══════════════════════════════════════════════════════════ */

/**
 * Compact confidence meter displayed as an overlay on the webcam feed.
 * Positioned bottom-left so it doesn't obstruct the face area.
 *
 * @param {{ overall: number, eyeScore: number, nonFearfulScore: number } | null} confidence
 */
function ConfidenceMeter({ confidence }) {
  if (confidence === null) {
    return (
      <div className="vp-conf-meter" aria-label="Confidence score: no data">
        <span className="vp-conf-meter__label">CONFIDENCE</span>
        <div className="vp-conf-meter__row">
          <div className="vp-conf-meter__bar-track" aria-hidden="true">
            <div className="vp-conf-meter__bar-fill" style={{ width: '0%' }} />
          </div>
          <span className="vp-conf-meter__pct">--</span>
        </div>
      </div>
    );
  }

  const pct     = Math.round(confidence.overall);
  const fillPct = `${pct}%`;

  // Colour shifts: 0-40 danger red → 40-65 amber → 65-100 cyan
  const fillClass =
    pct >= 65 ? 'vp-conf-meter__bar-fill--high'
    : pct >= 40 ? 'vp-conf-meter__bar-fill--mid'
    : 'vp-conf-meter__bar-fill--low';

  return (
    <div className="vp-conf-meter" aria-label={`Confidence score: ${pct}%`}>
      <span className="vp-conf-meter__label">CONFIDENCE</span>
      <div className="vp-conf-meter__row">
        <div className="vp-conf-meter__bar-track" aria-hidden="true">
          <div
            className={`vp-conf-meter__bar-fill ${fillClass}`}
            style={{ width: fillPct }}
          />
        </div>
        <span className="vp-conf-meter__pct">{fillPct}</span>
      </div>
    </div>
  );
}

/** Live camera feed with status badges overlaid. */
function CameraPanel({ videoRef, camStatus, onRetry, faceDetected, isMonitoring, confidence }) {
  return (
    <div className={`vp-camera ${isMonitoring ? 'vp-camera--active' : ''}`}>
      {camStatus === 'denied' ? (
        <div className="vp-camera__fallback">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round" strokeLinejoin="round" width="40" height="40">
            <path d="M2 2l20 20M10.5 6H19a2 2 0 0 1 2 2v9M5 5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11"/>
            <path d="m15 10-3 3m0 0-3 3"/>
          </svg>
          <p>Camera access denied</p>
          <button className="btn btn-outline" onClick={onRetry}>Retry</button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className="vp-camera__video"
            autoPlay
            playsInline
            muted
            aria-label="Live camera feed"
          />

          {/* Face-detected badge */}
          <div className={`vp-camera__badge vp-camera__badge--face ${faceDetected ? 'vp-camera__badge--on' : ''}`}>
            <span className="vp-camera__badge-dot" />
            {faceDetected ? 'FACE' : 'NO FACE'}
          </div>

          {/* Monitoring indicator */}
          {isMonitoring && (
            <div className="vp-camera__badge vp-camera__badge--rec">
              <span className="vp-camera__rec-dot" />
              MONITORING
            </div>
          )}

          {/* Confidence meter overlay — bottom-left corner */}
          <ConfidenceMeter confidence={confidence} />

          {/* Idle shimmer */}
          {camStatus === 'idle' && <div className="vp-camera__shimmer" />}
        </>
      )}

      {/* Corner brackets */}
      <div className="vp-corner vp-corner--tl" />
      <div className="vp-corner vp-corner--tr" />
      <div className="vp-corner vp-corner--bl" />
      <div className="vp-corner vp-corner--br" />
    </div>
  );
}

/** Horizontal row of three at-a-glance status pills. */
function StatusBar({ faceDetected, expression, eyeContact, isMonitoring }) {
  const expColor = expression ? EXPRESSION_COLOR[expression] : 'var(--color-text-dim)';
  const expEmoji = expression ? EXPRESSION_EMOJI[expression] : '—';

  return (
    <div className="vp-status-bar" aria-label="Current detection status">
      {/* Face */}
      <div className={`vp-status-pill ${faceDetected ? 'vp-status-pill--ok' : 'vp-status-pill--off'}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zM8 15.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S10.33 17 9.5 17 8 16.33 8 15.5zm7 0c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5zM12 8c-2.33 0-4.32 1.45-5.12 3.5h10.24C16.32 9.45 14.33 8 12 8z"/>
        </svg>
        <span>{faceDetected ? 'Face Detected' : 'No Face'}</span>
      </div>

      {/* Expression */}
      <div className="vp-status-pill vp-status-pill--expr" style={{ '--expr-color': expColor }}>
        <span className="vp-status-pill__emoji" aria-hidden="true">{expEmoji}</span>
        <span>{expression ? expression.charAt(0).toUpperCase() + expression.slice(1) : 'No Expression'}</span>
      </div>

      {/* Eye contact */}
      <div className={`vp-status-pill ${eyeContact ? 'vp-status-pill--ok' : 'vp-status-pill--off'}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
        </svg>
        <span>{eyeContact ? 'Eye Contact' : 'Looking Away'}</span>
      </div>
    </div>
  );
}

/** A single metric card with a label, large value, and optional sub-label. */
function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`vp-stat-card ${accent ? 'vp-stat-card--accent' : ''}`}>
      <span className="vp-stat-card__label">{label}</span>
      <span className="vp-stat-card__value">{value}</span>
      {sub && <span className="vp-stat-card__sub">{sub}</span>}
    </div>
  );
}

/** 2×2 grid showing all four expression counts. */
function ExpressionGrid({ counts }) {
  const items = [
    { key: 'neutral',   label: 'Neutral'   },
    { key: 'happy',     label: 'Happy'     },
    { key: 'fearful',   label: 'Fearful'   },
    { key: 'surprised', label: 'Surprised' },
  ];

  return (
    <div className="vp-expr-grid" role="list" aria-label="Expression counts">
      {items.map(({ key, label }) => (
        <div key={key} className="vp-expr-cell" role="listitem"
             style={{ '--cell-color': EXPRESSION_COLOR[key] }}>
          <span className="vp-expr-cell__emoji" aria-hidden="true">
            {EXPRESSION_EMOJI[key]}
          </span>
          <span className="vp-expr-cell__count">{counts[key]}</span>
          <span className="vp-expr-cell__label">{label}</span>
        </div>
      ))}
    </div>
  );
}

/** Scrollable table of the last N detection records. */
const MAX_TABLE_ROWS = 60;

function RecordTable({ records }) {
  const recent = [...records].reverse().slice(0, MAX_TABLE_ROWS);

  if (recent.length === 0) {
    return (
      <div className="vp-table-empty">
        No detections yet — start monitoring to populate.
      </div>
    );
  }

  return (
    <div className="vp-table-wrap" aria-label="Detection log">
      <table className="vp-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Face</th>
            <th>Expression</th>
            <th>Eye Contact</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((r, i) => (
            <tr key={r.timestamp + i}
                className={r.faceDetected ? '' : 'vp-table__row--noface'}>
              <td className="vp-table__ts">{fmtTs(r.timestamp)}</td>
              <td>
                <span className={`vp-table__dot ${r.faceDetected ? 'vp-table__dot--on' : 'vp-table__dot--off'}`} />
                {r.faceDetected ? 'Yes' : 'No'}
              </td>
              <td>
                {r.expression
                  ? <>{EXPRESSION_EMOJI[r.expression]} {r.expression}</>
                  : <span className="vp-table__dim">—</span>}
              </td>
              <td>
                {r.faceDetected
                  ? <span className={r.eyeContact ? 'vp-table__ec-on' : 'vp-table__ec-off'}>
                      {r.eyeContact ? '✓ Yes' : '✗ No'}
                    </span>
                  : <span className="vp-table__dim">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main page component
═══════════════════════════════════════════════════════════ */

const EMPTY_STATS = {
  sessionDuration:    0,
  eyeContactDuration: 0,
  eyeContactPct:      0,
  expressionCounts:   { neutral: 0, happy: 0, fearful: 0, surprised: 0 },
  noFaceCount:        0,
  records:            [],
};

export default function VisionPage() {
  /* ── Refs ──────────────────────────────────────────────── */
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const sessionRef    = useRef(null);   // current SessionManager instance
  const statsTimerRef = useRef(null);   // interval for pulling live stats into UI
  /** Smoothed overall confidence value — kept in a ref so smoothValue() can
   *  read the previous value without a stale closure. Null until first sample. */
  const smoothedConfRef = useRef(null);

  /* ── State ─────────────────────────────────────────────── */
  const [camStatus,    setCamStatus]    = useState('idle');   // 'idle'|'active'|'denied'
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [modelsReady,  setModelsReady]  = useState(false);
  const [modelError,   setModelError]   = useState('');

  /* Latest single-sample values (for live status bar) */
  const [faceDetected, setFaceDetected] = useState(false);
  const [expression,   setExpression]   = useState(null);
  const [eyeContact,   setEyeContact]   = useState(false);

  /* Accumulated session stats (updated every second) */
  const [stats, setStats] = useState(EMPTY_STATS);

  /**
   * Live confidence score — null means "no data yet" (display "--").
   * Shape: { eyeScore, nonFearfulScore, overall } | null
   * The `overall` field is EWA-smoothed to prevent jarring jumps.
   */
  const [confidence, setConfidence] = useState(null);

  /* ── Camera ─────────────────────────────────────────────── */
  const startCam = useCallback(async () => {
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

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /* ── Model preload ──────────────────────────────────────── */
  useEffect(() => {
    startCam();
    loadModels()
      .then(() => setModelsReady(true))
      .catch((err) => setModelError(err?.message ?? 'Failed to load models'));

    return () => {
      stopCam();
      stopTracking();
      clearInterval(statsTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Session start / stop ───────────────────────────────── */
  const handleStart = useCallback(() => {
    if (isMonitoring || !modelsReady || camStatus !== 'active') return;

    // Reset UI to clean slate
    setFaceDetected(false);
    setExpression(null);
    setEyeContact(false);
    setStats(EMPTY_STATS);
    setConfidence(null);
    smoothedConfRef.current = null;

    // Create fresh session
    const session = createSession();
    sessionRef.current = session;

    // per-sample callback — called by faceTracker every second
    function onSample(sample) {
      // 1. Feed into session manager
      session.addSample(sample);

      // 2. Update live status pills
      //    If no face, keep the last expression visible (don't reset to null)
      //    so the overlay retains its previous valid score.
      setFaceDetected(sample.faceDetected);
      if (sample.faceDetected) {
        setExpression(sample.expression);
        setEyeContact(sample.eyeContact);
      }
      // (intentionally do NOT clear expression/eyeContact on no-face frames)

      // 3. Recompute confidence from accumulated stats and apply EWA smoothing
      const currentStats = session.getStats();
      const raw = computeConfidence(currentStats);
      if (raw !== null) {
        const smoothed = smoothValue(smoothedConfRef.current, raw.overall);
        smoothedConfRef.current = smoothed;
        setConfidence({
          eyeScore:        raw.eyeScore,
          nonFearfulScore: raw.nonFearfulScore,
          overall:         +smoothed.toFixed(1),
        });
      }
      // If raw is null (no expressions yet) we leave confidence as null — "--"
    }

    startTracking(videoRef.current, onSample);
    setIsMonitoring(true);

    // Pull accumulated stats into UI every second (between samples)
    statsTimerRef.current = setInterval(() => {
      if (sessionRef.current) {
        setStats(sessionRef.current.getStats());
      }
    }, 1000);
  }, [isMonitoring, modelsReady, camStatus]);

  const handleStop = useCallback(() => {
    if (!isMonitoring) return;

    stopTracking();
    clearInterval(statsTimerRef.current);

    // Freeze final stats
    if (sessionRef.current) {
      sessionRef.current.finish();
      setStats(sessionRef.current.getStats());
    }

    setIsMonitoring(false);
    setFaceDetected(false);
    setExpression(null);
    setEyeContact(false);
    // Freeze confidence display — keep the final smoothed value visible
  }, [isMonitoring]);

  /* ── Derived display values ──────────────────────────────── */
  const totalSamples =
    stats.expressionCounts.neutral +
    stats.expressionCounts.happy   +
    stats.expressionCounts.fearful +
    stats.expressionCounts.surprised +
    stats.noFaceCount;

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="vp-root">

      {/* ══ Page title ══════════════════════════════════════ */}
      <header className="vp-header">
        <div className="vp-header__left">
          <h1 className="vp-header__title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"
                 aria-hidden="true" className="vp-header__icon">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
            </svg>
            Vision Monitor
          </h1>
          <p className="vp-header__sub">Real-time facial expression &amp; eye-contact analysis</p>
        </div>

        {/* Model status */}
        <div className={`vp-model-badge ${modelsReady ? 'vp-model-badge--ready' : ''} ${modelError ? 'vp-model-badge--error' : ''}`}>
          {modelError
            ? `⚠ ${modelError}`
            : modelsReady
              ? '✓ Models ready'
              : '⟳ Loading models…'}
        </div>
      </header>

      {/* ══ Main two-column layout ═══════════════════════════ */}
      <div className="vp-layout">

        {/* ── Left column: camera + controls ─────────────── */}
        <aside className="vp-left">

          <CameraPanel
            videoRef={videoRef}
            camStatus={camStatus}
            onRetry={startCam}
            faceDetected={faceDetected}
            isMonitoring={isMonitoring}
            confidence={confidence}
          />

          {/* Control buttons */}
          <div className="vp-controls">
            <button
              className="btn btn-primary vp-btn-start"
              onClick={handleStart}
              disabled={isMonitoring || !modelsReady || camStatus !== 'active'}
              aria-label="Start monitoring"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Start Monitoring
            </button>

            <button
              className="btn btn-outline vp-btn-stop"
              onClick={handleStop}
              disabled={!isMonitoring}
              aria-label="Stop monitoring"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 6h12v12H6z"/>
              </svg>
              Stop Monitoring
            </button>
          </div>

          {/* Live status bar */}
          <StatusBar
            faceDetected={faceDetected}
            expression={expression}
            eyeContact={eyeContact}
            isMonitoring={isMonitoring}
          />
        </aside>

        {/* ── Right column: stats dashboard ──────────────── */}
        <main className="vp-right">

          {/* ─ Confidence score breakdown card ─ */}
          <section className="vp-section vp-conf-breakdown" aria-label="Confidence score">
            <h2 className="vp-section__title">
              Confidence Score
              {confidence !== null && (
                <span className="vp-conf-breakdown__overall">
                  {confidence.overall}%
                </span>
              )}
            </h2>

            {confidence === null ? (
              <p className="vp-conf-breakdown__empty">
                Waiting for expression data — score will appear after the first face detection.
              </p>
            ) : (
              <div className="vp-conf-breakdown__rows">
                {/* Overall bar */}
                <div className="vp-conf-breakdown__row vp-conf-breakdown__row--overall">
                  <span className="vp-conf-breakdown__row-label">Overall</span>
                  <div className="vp-conf-breakdown__bar-track">
                    <div
                      className={`vp-conf-breakdown__bar-fill ${
                        confidence.overall >= 65 ? 'vp-conf-breakdown__bar-fill--high'
                        : confidence.overall >= 40 ? 'vp-conf-breakdown__bar-fill--mid'
                        : 'vp-conf-breakdown__bar-fill--low'
                      }`}
                      style={{ width: `${confidence.overall}%` }}
                    />
                  </div>
                  <span className="vp-conf-breakdown__row-val">{confidence.overall}%</span>
                </div>

                {/* Eye-contact component */}
                <div className="vp-conf-breakdown__row">
                  <span className="vp-conf-breakdown__row-label">Eye Contact</span>
                  <div className="vp-conf-breakdown__bar-track">
                    <div
                      className="vp-conf-breakdown__bar-fill vp-conf-breakdown__bar-fill--eye"
                      style={{ width: `${confidence.eyeScore}%` }}
                    />
                  </div>
                  <span className="vp-conf-breakdown__row-val">{confidence.eyeScore}%</span>
                </div>

                {/* Non-fearful expression component */}
                <div className="vp-conf-breakdown__row">
                  <span className="vp-conf-breakdown__row-label">Non-Fearful</span>
                  <div className="vp-conf-breakdown__bar-track">
                    <div
                      className="vp-conf-breakdown__bar-fill vp-conf-breakdown__bar-fill--expr"
                      style={{ width: `${confidence.nonFearfulScore}%` }}
                    />
                  </div>
                  <span className="vp-conf-breakdown__row-val">{confidence.nonFearfulScore}%</span>
                </div>

                <p className="vp-conf-breakdown__formula">
                  ({confidence.eyeScore} × 0.5) + ({confidence.nonFearfulScore} × 0.5) = {confidence.overall}
                </p>
              </div>
            )}
          </section>

          {/* ─ Top stat cards row ─ */}
          <section className="vp-cards" aria-label="Session statistics">
            <StatCard
              label="Session Duration"
              value={fmtSecs(stats.sessionDuration)}
              accent={isMonitoring}
            />
            <StatCard
              label="Eye Contact"
              value={fmtSecs(stats.eyeContactDuration)}
              sub={`${stats.eyeContactPct}%`}
              accent
            />
            <StatCard
              label="Total Samples"
              value={totalSamples}
            />
            <StatCard
              label="No Face"
              value={stats.noFaceCount}
            />
          </section>

          {/* ─ Expression grid ─ */}
          <section className="vp-section" aria-label="Expression breakdown">
            <h2 className="vp-section__title">Expression Breakdown</h2>
            <ExpressionGrid counts={stats.expressionCounts} />
          </section>

          {/* ─ Detection log ─ */}
          <section className="vp-section vp-section--table" aria-label="Detection log">
            <h2 className="vp-section__title">
              Detection Log
              <span className="vp-section__count">{stats.records.length} records</span>
            </h2>
            <RecordTable records={stats.records} />
          </section>

          {/* ─ Session summary (shown after stop) ─ */}
          {!isMonitoring && stats.records.length > 0 && (
            <section className="vp-summary" aria-label="Session summary">
              <h2 className="vp-summary__title">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd"/>
                </svg>
                Session Summary
              </h2>
              <dl className="vp-summary__grid">
                <div className="vp-summary__item">
                  <dt>Duration</dt>
                  <dd>{fmtSecs(stats.sessionDuration)}</dd>
                </div>
                <div className="vp-summary__item">
                  <dt>Eye Contact</dt>
                  <dd>{fmtSecs(stats.eyeContactDuration)}</dd>
                </div>
                <div className="vp-summary__item">
                  <dt>Eye Contact %</dt>
                  <dd>{stats.eyeContactPct}%</dd>
                </div>
                <div className="vp-summary__item">
                  <dt>Neutral</dt>
                  <dd>{stats.expressionCounts.neutral}</dd>
                </div>
                <div className="vp-summary__item">
                  <dt>Happy</dt>
                  <dd>{stats.expressionCounts.happy}</dd>
                </div>
                <div className="vp-summary__item">
                  <dt>Fearful</dt>
                  <dd>{stats.expressionCounts.fearful}</dd>
                </div>
                <div className="vp-summary__item">
                  <dt>Surprised</dt>
                  <dd>{stats.expressionCounts.surprised}</dd>
                </div>
                <div className="vp-summary__item">
                  <dt>No Face</dt>
                  <dd>{stats.noFaceCount}</dd>
                </div>
                {confidence !== null && (
                  <>
                    <div className="vp-summary__item vp-summary__item--confidence">
                      <dt>Confidence</dt>
                      <dd>{confidence.overall}%</dd>
                    </div>
                    <div className="vp-summary__item">
                      <dt>Eye Contact</dt>
                      <dd>{confidence.eyeScore}%</dd>
                    </div>
                    <div className="vp-summary__item">
                      <dt>Non-Fearful</dt>
                      <dd>{confidence.nonFearfulScore}%</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>
          )}

        </main>
      </div>
    </div>
  );
}
