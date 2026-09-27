/**
 * faceTracker.js
 *
 * Core computer-vision engine for MockMentor.
 *
 * face-api.js is imported dynamically so Vite splits it into its own chunk,
 * avoiding OOM issues during build while keeping the initial page bundle light.
 *
 * Models used (served from /models/):
 *   • TinyFaceDetector   — fast face bounding-box detection
 *   • FaceExpressionNet  — 7-class expression probabilities
 *   • FaceLandmark68Net  — 68-point facial landmarks (eye-contact heuristic)
 *
 * Exported API:
 *   loadModels()                      → Promise<void>
 *   startTracking(videoEl, onSample)  → Promise<void>
 *   stopTracking()                    → void
 *
 * onSample callback receives a DetectionSample every second:
 *   {
 *     timestamp:    string   — ISO-8601
 *     faceDetected: boolean
 *     expression:   'neutral'|'happy'|'fearful'|'surprised'|null
 *     eyeContact:   boolean
 *   }
 *
 * Eye-contact heuristic
 * ─────────────────────
 * face-api.js ships no gaze/iris model. We approximate eye contact from the
 * 68-point landmark geometry:
 *
 *  1. Compute the iris centre of each eye (centroid of inner landmark pairs).
 *  2. Compare the iris centre to the eye bounding-box centre.
 *  3. If both eyes' horizontal offset ratio is within ±EYE_OFFSET_THRESHOLD
 *     the user is deemed to be looking toward the camera.
 *  4. Gate on face yaw via the nose-tip vs face-centre ratio.
 */

const MODEL_URL           = '/models';
const SAMPLE_INTERVAL_MS  = 1000;
const EYE_OFFSET_THRESHOLD = 0.25;

const EXPRESSION_MAP = {
  neutral:   'neutral',
  happy:     'happy',
  fearful:   'fearful',
  surprised: 'surprised',
};

/* ─── Module-level state ────────────────────────────────── */
let faceapi        = null;   // resolved after dynamic import
let modelsLoaded   = false;
let loadingPromise = null;
let intervalHandle = null;

/* ─── Lazy load face-api.js ─────────────────────────────── */
async function getFaceapi() {
  if (!faceapi) {
    faceapi = await import('face-api.js');
  }
  return faceapi;
}

/* ─── Model loading ─────────────────────────────────────── */

export async function loadModels() {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const fa = await getFaceapi();
    await Promise.all([
      fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      fa.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log('[faceTracker] All models loaded ✓');
  })();

  return loadingPromise;
}

/* ─── Eye-contact heuristic ─────────────────────────────── */

function estimateEyeContact(landmarks) {
  const pts = landmarks.positions;

  function eyeOffsetRatio(eyePts) {
    const xs     = eyePts.map((p) => p.x);
    const minX   = Math.min(...xs);
    const maxX   = Math.max(...xs);
    const width  = maxX - minX || 1;

    const innerPts = [eyePts[1], eyePts[2], eyePts[4], eyePts[5]].filter(Boolean);
    const irisX    = innerPts.reduce((s, p) => s + p.x, 0) / (innerPts.length || 1);
    const centreX  = minX + width / 2;

    return Math.abs((irisX - centreX) / width);
  }

  const faceXs      = pts.map((p) => p.x);
  const faceMinX    = Math.min(...faceXs);
  const faceMaxX    = Math.max(...faceXs);
  const faceWidth   = faceMaxX - faceMinX || 1;
  const noseTip     = pts[30];
  const faceCentreX = faceMinX + faceWidth / 2;
  const yawRatio    = Math.abs((noseTip.x - faceCentreX) / faceWidth);

  if (yawRatio > 0.18) return false;

  const leftEye  = pts.slice(36, 42);
  const rightEye = pts.slice(42, 48);

  return (
    eyeOffsetRatio(leftEye)  < EYE_OFFSET_THRESHOLD &&
    eyeOffsetRatio(rightEye) < EYE_OFFSET_THRESHOLD
  );
}

/* ─── Expression classification ─────────────────────────── */

function classifyExpression(expressions) {
  let best      = null;
  let bestScore = -1;

  for (const [key, score] of Object.entries(expressions)) {
    if (EXPRESSION_MAP[key] && score > bestScore) {
      bestScore = score;
      best = EXPRESSION_MAP[key];
    }
  }

  return best;
}

/* ─── Public tracking API ───────────────────────────────── */

export async function startTracking(videoEl, onSample) {
  if (!videoEl) {
    console.warn('[faceTracker] startTracking: no video element supplied');
    return;
  }

  await loadModels();

  if (intervalHandle !== null) clearInterval(intervalHandle);

  const fa = await getFaceapi();
  const detectorOptions = new fa.TinyFaceDetectorOptions({
    inputSize:      224,
    scoreThreshold: 0.45,
  });

  intervalHandle = setInterval(async () => {
    if (!videoEl || videoEl.readyState < 2 || videoEl.paused) return;

    const timestamp = new Date().toISOString();

    try {
      const result = await fa
        .detectSingleFace(videoEl, detectorOptions)
        .withFaceLandmarks()
        .withFaceExpressions();

      const sample = {
        timestamp,
        faceDetected: false,
        expression:   null,
        eyeContact:   false,
      };

      if (result) {
        sample.faceDetected = true;
        sample.expression   = classifyExpression(result.expressions);
        sample.eyeContact   = estimateEyeContact(result.landmarks);
      }

      if (typeof onSample === 'function') onSample(sample);
    } catch (err) {
      console.debug('[faceTracker] frame error:', err?.message);
    }
  }, SAMPLE_INTERVAL_MS);
}

export function stopTracking() {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[faceTracker] tracking stopped');
  }
}
