/**
 * tts.js  —  Text-to-Speech helper for MockMentor
 *
 * Wraps the Web Speech Synthesis API (speechSynthesis).
 *
 * Voice selection strategy
 * ────────────────────────
 *  'male'  → prefer a deeper English male voice
 *            pitch: 0.85  rate: 0.95
 *  'female'→ prefer an English female voice
 *            pitch: 1.1   rate: 1.0
 *  'robot' → any voice, but pitch: 0.55  rate: 0.82 (robotic feel)
 *
 * Voice availability varies wildly by OS / browser.  The picker scores
 * candidate voices against preferred names and falls back gracefully:
 *   Exact preferred name match → best match by gender heuristic → first en-* voice → default
 *
 * Exports
 * ───────
 *  TTS_SUPPORTED   — boolean; false on browsers without speechSynthesis
 *  speakText({ text, avatarId, onEnd, onError })
 *      Returns the SpeechSynthesisUtterance so the caller can cancel it.
 *  cancelSpeech()  — cancel any ongoing utterance immediately
 */

/* ── Feature detection ── */
export const TTS_SUPPORTED =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

/* ─────────────────────────────────────────────────────────
   Voice preference tables
───────────────────────────────────────────────────────── */

/**
 * Preferred voice names for each avatar.
 * These are the names that commonly appear in Chrome / Edge / Safari.
 * Listed from most-preferred to least-preferred.
 */
const PREFERRED_NAMES = {
  male: [
    // Chrome / Edge on Windows
    'Microsoft David Desktop',
    'Microsoft Mark Desktop',
    'David',
    'Mark',
    // macOS / iOS
    'Daniel',
    'Fred',
    'Alex',
    // Chrome TTS
    'Google US English',
  ],
  female: [
    // Windows
    'Microsoft Zira Desktop',
    'Microsoft Hazel Desktop',
    'Zira',
    'Hazel',
    // macOS / iOS
    'Samantha',
    'Victoria',
    'Karen',
    'Moira',
    'Tessa',
    // Chrome TTS
    'Google UK English Female',
  ],
  robot: [
    // Any voice works for robot — we distort it via pitch/rate
    // but if Google US English is available it sounds best robotic
    'Google US English',
    'Microsoft David Desktop',
    'Daniel',
    'Alex',
  ],
};

/** Prosody settings per avatar type. */
const PROSODY = {
  male:   { pitch: 0.85, rate: 0.95, volume: 1.0 },
  female: { pitch: 1.10, rate: 1.00, volume: 1.0 },
  robot:  { pitch: 0.55, rate: 0.82, volume: 1.0 },
};

/* ─────────────────────────────────────────────────────────
   Voice picker
───────────────────────────────────────────────────────── */

/**
 * Internal: return all English voices available in this browser.
 * speechSynthesis.getVoices() is synchronous but may be empty on first call;
 * the caller uses it speculatively — if empty we fall back to `undefined`
 * and the browser picks its default.
 */
function getEnglishVoices() {
  if (!TTS_SUPPORTED) return [];
  return speechSynthesis.getVoices().filter((v) =>
    v.lang.startsWith('en')
  );
}

/**
 * Pick the best available voice for the given avatar type.
 *
 * @param {'male'|'female'|'robot'} avatarId
 * @returns {SpeechSynthesisVoice|undefined}
 */
export function pickVoice(avatarId) {
  const voices = getEnglishVoices();
  if (voices.length === 0) return undefined;  // browser will use default

  const preferred = PREFERRED_NAMES[avatarId] ?? PREFERRED_NAMES.male;

  /* 1. Exact name match (case-insensitive) */
  for (const name of preferred) {
    const match = voices.find((v) =>
      v.name.toLowerCase() === name.toLowerCase()
    );
    if (match) return match;
  }

  /* 2. Substring match on preferred names */
  for (const name of preferred) {
    const match = voices.find((v) =>
      v.name.toLowerCase().includes(name.toLowerCase())
    );
    if (match) return match;
  }

  /* 3. Heuristic by gender keyword in voice name */
  if (avatarId === 'female') {
    const femaleKeywords = ['female', 'woman', 'girl', 'samantha', 'zira', 'hazel', 'victoria', 'karen'];
    const match = voices.find((v) =>
      femaleKeywords.some((k) => v.name.toLowerCase().includes(k))
    );
    if (match) return match;
  } else {
    const maleKeywords = ['male', 'man', 'david', 'daniel', 'mark', 'fred', 'alex'];
    const match = voices.find((v) =>
      maleKeywords.some((k) => v.name.toLowerCase().includes(k))
    );
    if (match) return match;
  }

  /* 4. Any en-US voice */
  const usVoice = voices.find((v) => v.lang === 'en-US');
  if (usVoice) return usVoice;

  /* 5. Any English voice */
  return voices[0];
}

/**
 * Return the configured speech rate for an avatar (used to keep the
 * 3D avatar's lip-sync timeline in step with the real utterance).
 *
 * @param {'male'|'female'|'robot'} avatarId
 * @returns {number}
 */
export function ttsSpeechRate(avatarId) {
  return (PROSODY[avatarId] ?? PROSODY.male).rate;
}

/* ─────────────────────────────────────────────────────────
   Public API
───────────────────────────────────────────────────────── */

/**
 * Speak text aloud using the voice appropriate for the chosen avatar.
 *
 * Cancels any currently playing utterance before starting.
 *
 * @param {object} params
 * @param {string}   params.text      - text to speak
 * @param {string}   params.avatarId  - 'male' | 'female' | 'robot'
 * @param {Function} [params.onStart] - called when speech begins
 * @param {Function} [params.onEnd]   - called when speech finishes (or is cancelled)
 * @param {Function} [params.onError] - called on synthesis error
 * @returns {SpeechSynthesisUtterance|null}
 */
export function speakText({ text, avatarId, onStart, onEnd, onError, onBoundary }) {
  if (!TTS_SUPPORTED || !text) {
    /* No TTS support — fire onEnd immediately so the STT flow still triggers */
    onEnd?.();
    return null;
  }

  /* Cancel any speech already in progress */
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  /* Apply prosody */
  const prosody = PROSODY[avatarId] ?? PROSODY.male;
  utterance.pitch  = prosody.pitch;
  utterance.rate   = prosody.rate;
  utterance.volume = prosody.volume;

  /* Attach voice (may be undefined → browser default) */
  const voice = pickVoice(avatarId);
  if (voice) utterance.voice = voice;

  /* Callbacks */
  utterance.onstart    = () => onStart?.();
  utterance.onend      = () => onEnd?.();
  utterance.onboundary = (e) => onBoundary?.(e);
  utterance.onerror    = (e) => {
    /* 'interrupted' is not a real error — it means cancel() was called */
    if (e.error === 'interrupted' || e.error === 'canceled') {
      onEnd?.();
    } else {
      onError?.(e);
      /* Still trigger onEnd so the UI doesn't get stuck in "speaking" */
      onEnd?.();
    }
  };

  speechSynthesis.speak(utterance);
  return utterance;
}

/**
 * Immediately cancel any ongoing speech synthesis.
 * Safe to call even when nothing is playing.
 */
export function cancelSpeech() {
  if (TTS_SUPPORTED) speechSynthesis.cancel();
}
