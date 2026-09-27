/**
 * sessionManager.js
 *
 * Manages a single monitoring session:
 *   - Receives DetectionSample objects from faceTracker
 *   - Accumulates running statistics
 *   - Calculates eye-contact duration from elapsed wall-clock time
 *     (not by counting samples)
 *   - Persists the completed session to localStorage
 *
 * Usage:
 *   const mgr = createSession();
 *   mgr.addSample(sample);          // call with each DetectionSample
 *   const stats = mgr.getStats();   // live stats at any point
 *   mgr.finish();                   // freeze + persist to localStorage
 *
 * Stats shape:
 *   {
 *     sessionDuration:    number  (seconds)
 *     eyeContactDuration: number  (seconds)
 *     eyeContactPct:      number  (0-100, 1 dp)
 *     expressionCounts: {
 *       neutral:   number,
 *       happy:     number,
 *       fearful:   number,
 *       surprised: number,
 *     }
 *     noFaceCount:  number
 *     records:      DetectionRecord[]
 *   }
 *
 * Each DetectionRecord:
 *   {
 *     timestamp:    string   (ISO-8601)
 *     faceDetected: boolean
 *     expression:   string|null
 *     eyeContact:   boolean
 *   }
 *
 * localStorage key: 'mm_vision_sessions'
 * Stores an array; newest session is always appended.
 * Capped at STORAGE_MAX_SESSIONS to avoid quota issues.
 */

const STORAGE_KEY        = 'mm_vision_sessions';
const STORAGE_MAX_SESSIONS = 10;

/* ── Helpers ───────────────────────────────────────────── */

function clamp(v) {
  return Math.max(0, v);
}

/**
 * Load saved sessions from localStorage.
 * Returns an empty array on any error.
 */
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist a single completed session snapshot.
 * Keeps only the most-recent STORAGE_MAX_SESSIONS entries.
 */
function persistSession(snapshot) {
  try {
    const existing = loadSaved();
    const updated  = [...existing, snapshot].slice(-STORAGE_MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[sessionManager] localStorage write failed:', err?.message);
  }
}

/* ── Factory ────────────────────────────────────────────── */

/**
 * Create a fresh session object.
 * Each call to createSession() is independent — no shared state.
 *
 * @returns {SessionManager}
 */
export function createSession() {
  /** ISO timestamp when session began */
  const startedAt = new Date().toISOString();

  /** All raw detection records */
  const records = [];

  /** Counts */
  const expressionCounts = {
    neutral:   0,
    happy:     0,
    fearful:   0,
    surprised: 0,
  };
  let noFaceCount = 0;

  /**
   * Eye-contact duration tracking.
   *
   * We do NOT simply multiply sample count × 1 s because samples can arrive
   * slightly late (JS timer drift) and the session may stop mid-interval.
   * Instead we track the wall-clock timestamp of the last eye-contact-true
   * sample and accumulate elapsed time between consecutive eye-contact samples.
   */
  let eyeContactMs  = 0;
  let lastEyeTs     = null;  // ISO timestamp of last sample where eyeContact = true

  /** Whether finish() has been called */
  let finished = false;

  /* ── Public methods ──────────────────────────────────── */

  /**
   * Feed a DetectionSample into the session.
   * Silently ignored after finish() is called.
   *
   * @param {{ timestamp, faceDetected, expression, eyeContact }} sample
   */
  function addSample(sample) {
    if (finished) return;

    // Guard: reject duplicate timestamps
    if (records.length && records[records.length - 1].timestamp === sample.timestamp) {
      return;
    }

    records.push({
      timestamp:    sample.timestamp,
      faceDetected: sample.faceDetected,
      expression:   sample.expression ?? null,
      eyeContact:   sample.eyeContact,
    });

    if (!sample.faceDetected) {
      noFaceCount++;
      // Face gone — reset eye-contact streak
      lastEyeTs = null;
      return;
    }

    // Count expression
    if (sample.expression && sample.expression in expressionCounts) {
      expressionCounts[sample.expression]++;
    }

    // Eye-contact accumulation
    if (sample.eyeContact) {
      if (lastEyeTs !== null) {
        // Accumulate elapsed time since the last eye-contact sample
        const elapsed = new Date(sample.timestamp) - new Date(lastEyeTs);
        // Clamp to ≤2.5 s to ignore timer-drift gaps > one expected interval
        eyeContactMs += Math.min(elapsed, 2500);
      }
      lastEyeTs = sample.timestamp;
    } else {
      // Eye contact broke — reset streak
      lastEyeTs = null;
    }
  }

  /**
   * Compute current stats snapshot.
   * Can be called at any time (before or after finish).
   *
   * @returns {SessionStats}
   */
  function getStats() {
    const now         = finished
      ? new Date(records[records.length - 1]?.timestamp ?? startedAt)
      : new Date();
    const durationMs  = clamp(now - new Date(startedAt));
    const durationSec = durationMs / 1000;
    const eyeSec      = eyeContactMs / 1000;
    const eyePct      = durationSec > 0
      ? +((eyeSec / durationSec) * 100).toFixed(1)
      : 0;

    return {
      sessionDuration:    +durationSec.toFixed(1),
      eyeContactDuration: +eyeSec.toFixed(1),
      eyeContactPct:      eyePct,
      expressionCounts:   { ...expressionCounts },
      noFaceCount,
      records: [...records],
    };
  }

  /**
   * Freeze the session and write it to localStorage.
   * Idempotent — safe to call more than once.
   */
  function finish() {
    if (finished) return;
    finished = true;
    lastEyeTs = null; // end any open eye-contact window

    const snapshot = {
      startedAt,
      finishedAt: new Date().toISOString(),
      stats:      getStats(),
    };

    persistSession(snapshot);
    console.log('[sessionManager] session saved', snapshot.startedAt);
  }

  return { addSample, getStats, finish };
}

/* ── Saved sessions API ─────────────────────────────────── */

/**
 * Return all previously-saved sessions (newest last).
 * @returns {SessionSnapshot[]}
 */
export function getSavedSessions() {
  return loadSaved();
}

/**
 * Erase all saved sessions from localStorage.
 */
export function clearSavedSessions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
