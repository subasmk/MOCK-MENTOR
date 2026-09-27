/**
 * faceTracker.js
 *
 * Thin wrapper around face-api.js for MockMentor.
 * Loads TinyFaceDetector + FaceExpressionNet once, then provides
 * startTracking(videoEl) / stopTracking() helpers.
 *
 * Detections are currently logged to the console.
 * Detection interval: every 500 ms (adjustable via INTERVAL_MS).
 */

import * as faceapi from 'face-api.js';

const MODEL_URL    = '/models';
const INTERVAL_MS  = 500;

let modelsLoaded  = false;
let loadingPromise = null;
let rafHandle     = null;   // setInterval handle
let lastLogTime   = 0;      // throttle console noise

/**
 * Load both model weights exactly once.
 * Safe to call multiple times — subsequent calls return the same promise.
 */
export async function loadModels() {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
  ]).then(() => {
    modelsLoaded = true;
    console.log('[faceTracker] Models loaded ✓');
  });

  return loadingPromise;
}

/**
 * Begin continuous face detection on the given <video> element.
 *
 * @param {HTMLVideoElement} videoEl - the live webcam feed
 * @returns {() => void}             - call to stop tracking
 */
export async function startTracking(videoEl) {
  if (!videoEl) {
    console.warn('[faceTracker] startTracking: no video element supplied');
    return;
  }

  await loadModels();

  // Clear any previous interval so we never double-up
  if (rafHandle !== null) clearInterval(rafHandle);

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,   // 128 | 160 | 224 | 320 | 416 | 512 | 608
    scoreThreshold: 0.5,
  });

  rafHandle = setInterval(async () => {
    // Skip frames while the video isn't ready
    if (videoEl.readyState < 2) return;

    try {
      const detection = await faceapi
        .detectSingleFace(videoEl, options)
        .withFaceExpressions();

      const now = Date.now();
      if (detection) {
        // Log at most once per second to keep the console readable
        if (now - lastLogTime >= 1000) {
          lastLogTime = now;
          const { expressions, detection: det } = detection;
          console.log(
            '[faceTracker] face detected | score:',
            det.score.toFixed(2),
            '| expressions:',
            Object.fromEntries(
              Object.entries(expressions).map(([k, v]) => [k, +v.toFixed(3)])
            )
          );
        }
      } else {
        if (now - lastLogTime >= 3000) {
          lastLogTime = now;
          console.log('[faceTracker] no face detected');
        }
      }
    } catch {
      // ignore individual frame errors (e.g. video paused during cleanup)
    }
  }, INTERVAL_MS);
}

/**
 * Stop the detection loop. Safe to call even if tracking was never started.
 */
export function stopTracking() {
  if (rafHandle !== null) {
    clearInterval(rafHandle);
    rafHandle = null;
    console.log('[faceTracker] tracking stopped');
  }
}
