/**
 * liveTalk.js - helpers that make the interview feel like a live conversation.
 * Free tier only: browser speech + one small model check. No streaming, no paid services.
 */
export const SILENCE_MS = 1300;          // pause before an answer is sent
export const BACKCHANNEL_MIN_WORDS = 10;
export const BACKCHANNEL_EVERY_MS = 12000;
export const CHECK_MIN_WORDS = 18;
export const CHECK_PAUSE_MS = 600;
export const CHECK_EVERY_MS = 20000;
export const CHECK_MAX_PER_ANSWER = 2;
export const RAMBLE_WORDS = 150;
export const RAMBLE_MS = 75000;

const ACKS = ['Mm-hm.', 'Okay.', 'Got it.', 'I see.', 'Right.', 'Okay, thanks.'];
const BACKS = ['Mm-hm', 'Go on', 'Okay', 'I see'];
let ackIdx = 0, backIdx = 0;
export const nextAck = () => ACKS[ackIdx++ % ACKS.length];
export const nextBack = () => BACKS[backIdx++ % BACKS.length];
export const CUT_IN_LINE = "Let me stop you there, I've got the main idea.";

export const wordCount = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function isRambling(text, startedAt, now) {
  return wordCount(text) >= RAMBLE_WORDS || (startedAt && now - startedAt >= RAMBLE_MS && wordCount(text) >= 40);
}
export function canBackchannel({ text, sinceWord, sinceLast }) {
  return wordCount(text) >= BACKCHANNEL_MIN_WORDS && sinceWord >= 700 && sinceWord < SILENCE_MS && sinceLast >= BACKCHANNEL_EVERY_MS;
}
export function canCheck({ text, sinceWord, sinceLast, used, inFlight }) {
  return !inFlight && used < CHECK_MAX_PER_ANSWER && wordCount(text) >= CHECK_MIN_WORDS && sinceWord >= CHECK_PAUSE_MS && sinceLast >= CHECK_EVERY_MS;
}

/** Quick spoken reaction in the browser voice. Does not touch interview state. */
export function speakQuick(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1; u.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

/** Ask the server if the partial answer has a clear factual mistake. Never throws; times out at 9s. */
export async function checkAnswer({ role, question, partial }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch('/api/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ role, question, partial }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d && d.wrong === true && typeof d.note === 'string' && d.note.trim() ? { note: d.note.trim() } : null;
  } catch { return null; } finally { clearTimeout(t); }
}
