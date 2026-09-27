/**
 * talkingHeadAvatar.js  —  Animated 3D interviewer avatar for MockMentor
 *
 * Uses the open-source TalkingHead class (met4citizen/TalkingHead, MIT) —
 * a pre-built, pre-rigged talking-head engine with real-time lip-sync.
 * Three.js, the TalkingHead module and the avatar GLB models are loaded
 * from the jsDelivr CDN at runtime (see the import map in index.html),
 * so no npm dependencies or GPU/backend are needed. Everything runs in
 * the browser.
 *
 * Lip-sync strategy
 * ─────────────────
 * The app speaks through the browser's speechSynthesis (services/tts.js),
 * which does not expose its audio stream. To keep the avatar's mouth in
 * sync we queue a *silent* PCM buffer of the estimated speech duration
 * into TalkingHead's speakAudio(), together with per-word start times and
 * durations. TalkingHead's built-in English lip-sync module converts the
 * words to Oculus visemes and animates them along that timeline, starting
 * when the real TTS utterance fires its `start` event.
 *
 * Fallback
 * ────────
 * If the CDN, WebGL or the model fails to load, createTalkingAvatar()
 * rejects and the caller keeps the original static avatar image + CSS
 * mouth animation.
 */

/** Pinned TalkingHead snapshot on jsDelivr (modules + avatar GLBs). */
const TH_CDN =
  'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@b3e277b3b46f88e557bf28a2c5612a5b04e075c3';

/**
 * Avatar model per interviewer. All are Mixamo-rigged GLBs with ARKit +
 * Oculus Viseme blend shapes, shipped with the TalkingHead project.
 * Retarget/baseline values mirror the TalkingHead demo app config.
 */
const AVATAR_MODELS = {
  male: {
    url: `${TH_CDN}/avatars/avatarsdk.glb`,
    body: 'M',
    retarget: {
      Neck:  { z: -0.01, rx: -0.15 },
      Neck1: { z: -0.01, rx: -0.15 },
      Neck2: { z: -0.01, rx: -0.15 },
      LeftShoulder:  { rz: -0.3 },
      RightShoulder: { rz: 0.3 },
      scaleToEyesLevel: 1.0,
      origin: { y: -0.1 },
    },
    baseline: { headRotateX: -0.04, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 },
  },
  female: {
    url: `${TH_CDN}/avatars/brunette.glb`,
    body: 'F',
    baseline: { headRotateX: -0.01, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 },
  },
  robot: {
    url: `${TH_CDN}/avatars/avaturn.glb`,
    body: 'F',
    retarget: {
      Hips:   { y: 0.03 },
      Spine:  { y: 0.02 },
      Spine1: { y: 0.02, z: 0.01 },
      Spine2: { y: 0.02, z: 0.01 },
      Neck:   { z: 0.02, y: 0.01 },
      Head:   { z: 0.02 },
      LeftShoulder:  { rx: -0.5 },
      RightShoulder: { rx: -0.5 },
      scaleToHipsLevel: 1.0,
    },
    baseline: { headRotateX: -0.05, eyeBlinkLeft: 0.15, eyeBlinkRight: 0.15 },
  },
};

/** Silence PCM sample rate — must match TalkingHead's default pcmSampleRate. */
const PCM_SAMPLE_RATE = 22050;

/* Module loader — cached so the CDN module is fetched once. */
let talkingHeadModulePromise = null;
function loadTalkingHead() {
  if (!talkingHeadModulePromise) {
    /* Full CDN URL stays external at build time; its own bare "three"
       imports are resolved by the import map in index.html. */
    talkingHeadModulePromise = import(/* @vite-ignore */ `${TH_CDN}/modules/talkinghead.mjs`);
  }
  return talkingHeadModulePromise;
}

/**
 * Create an animated avatar inside the given container element.
 *
 * @param {object}   params
 * @param {HTMLElement} params.container  - element the 3D canvas mounts into
 * @param {string}   params.avatarId      - 'male' | 'female' | 'robot'
 * @param {Function} [params.onProgress]  - called with 0-100 while the model loads
 * @returns {Promise<TalkingAvatarController>}
 */
export async function createTalkingAvatar({ container, avatarId, onProgress }) {
  if (!container) throw new Error('Missing avatar container');

  const { TalkingHead } = await loadTalkingHead();
  const model = AVATAR_MODELS[avatarId] ?? AVATAR_MODELS.male;

  const head = new TalkingHead(container, {
    lipsyncModules: ['en'],
    lipsyncLang: 'en',
    cameraView: 'upper',
    cameraRotateEnable: false,
    cameraZoomEnable: false,
    cameraPanEnable: false,
  });

  await head.showAvatar(
    {
      url: model.url,
      body: model.body,
      avatarMood: 'neutral',
      lipsyncLang: 'en',
      ...(model.retarget ? { retarget: model.retarget } : {}),
      ...(model.baseline ? { baseline: model.baseline } : {}),
    },
    (ev) => {
      if (ev && ev.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      }
    }
  );

  head.start();
  return new TalkingAvatarController(head);
}

/**
 * Thin wrapper around a TalkingHead instance: speaks lip-synced lines
 * timed to the app's own TTS, plus lifecycle cleanup.
 */
class TalkingAvatarController {
  constructor(head) {
    this.head = head;
    this.disposed = false;
  }

  /**
   * Animate the avatar speaking `text`, lip-synced to a silent timeline
   * estimated for the given TTS rate. Call this when the real
   * speechSynthesis utterance starts so both begin together.
   *
   * @param {string} text - the exact text being spoken by the TTS
   * @param {number} [rate=1] - the utterance's speech rate (0.5-2)
   */
  speak(text, rate = 1) {
    if (this.disposed || !text) return;

    const words = text.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));
    if (!words.length) return;

    /* Estimate a per-word timeline. ~55 ms per letter at rate 1 tracks
       browser TTS closely; punctuation adds a natural pause. */
    const safeRate = Math.min(2, Math.max(0.5, rate || 1));
    const wtimes = [];
    const wdurations = [];
    let t = 220; // small lead-in so the mouth opens as the voice starts
    for (const w of words) {
      const letters = w.replace(/[^a-zA-Z0-9']/g, '').length;
      let dur = (140 + letters * 55) / safeRate;
      dur = Math.min(1100, Math.max(170, dur));
      wtimes.push(Math.round(t));
      wdurations.push(Math.round(dur));
      t += dur + (/[.!?…]$/.test(w) ? 230 : /[,;:]$/.test(w) ? 150 : 55);
    }
    const totalMs = t + 600; // tail so the mouth never freezes mid-word

    /* Silent 16-bit LE mono PCM — TalkingHead plays it (muting nothing,
       it IS silence) and animates the visemes along its timeline. */
    const pcm = new Int16Array(Math.ceil((totalMs / 1000) * PCM_SAMPLE_RATE));

    this.head.speakAudio({
      audio: [pcm.buffer],
      words,
      wtimes,
      wdurations,
    });
  }

  /** Stop any in-progress lip animation and close the mouth. */
  stopSpeaking() {
    if (this.disposed) return;
    try { this.head.stopSpeaking(); } catch { /* not speaking */ }
  }

  /** Halt the render loop and release the instance. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try { this.head.stopSpeaking(); } catch { /* ignore */ }
    try { this.head.stop(); } catch { /* ignore */ }
  }
}
