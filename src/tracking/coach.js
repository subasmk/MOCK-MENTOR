/**
 * coach.js - live camera coaching for the interview screen.
 * Takes one face sample per second (from faceTracker) and turns it into at most
 * one short tip at a time. Debounced: a problem must last a few seconds before a
 * tip shows, a tip stays at least 5s, and the same tip waits 15s before returning.
 * Totals are saved to localStorage so the report can show them.
 */
const KEY = 'mm_coach_last';

export const TIPS = {
  noface:  { text: "I can't see your face. Move into the frame.",       advice: 'Keep your face in the frame the whole time.' },
  far:     { text: 'Move a little closer to the camera.',               advice: 'Sit about an arm\'s length from the camera.' },
  close:   { text: 'Sit back a little, you are too close.',             advice: 'Sit about an arm\'s length from the camera.' },
  center:  { text: 'Center yourself in the frame.',                      advice: 'Keep your face in the middle of the frame.' },
  straight:{ text: 'Look straight at the camera.',                       advice: 'Face the camera, do not turn your head away.' },
  eyes:    { text: 'Give eye contact: look at the lens, not the screen.', advice: 'Look at the camera lens while you answer.' },
  relax:   { text: 'Relax your face and take a slow breath.',            advice: 'Take a breath before answering and relax your jaw and shoulders.' },
  smile:   { text: 'A small, natural smile will help.',                  advice: 'A light smile makes you look confident and friendly.' },
  good:    { text: 'Good posture and eye contact. Keep going.',          advice: '' },
};

const NEEDS = { noface: 3, far: 3, close: 3, center: 4, straight: 3, eyes: 4, relax: 4, smile: 10 };
const ORDER = ['noface', 'far', 'close', 'center', 'straight', 'eyes', 'relax', 'smile'];

export function detectIssue(s) {
  if (!s.faceDetected) return 'noface';
  if (s.faceRatio < 0.16) return 'far';
  if (s.faceRatio > 0.5) return 'close';
  if (Math.abs(s.centerX - 0.5) > 0.22) return 'center';
  if (Math.abs(s.yaw) > 0.18) return 'straight';
  if (!s.eyeContact) return 'eyes';
  const sc = s.scores || {};
  if ((sc.fearful || 0) + (sc.angry || 0) + (sc.sad || 0) > 0.5) return 'relax';
  if ((sc.neutral || 0) > 0.85) return 'smile';
  return null;
}

export function createCoach(onTip, now = () => Date.now()) {
  const streak = {};            // consecutive seconds per issue
  const lastShown = {};         // key -> time
  const stats = { samples: 0, goodSamples: 0, issues: {}, tipsShown: 0 };
  let current = null, shownAt = 0, lastGood = 0;

  function show(key) {
    current = key; shownAt = now(); lastShown[key] = shownAt;
    if (key !== 'good') {
      stats.tipsShown++;
      stats.issues[key] = stats.issues[key] || { seconds: 0, shown: 0 };
      stats.issues[key].shown++;
    } else lastGood = shownAt;
    onTip({ key, ...TIPS[key] });
  }

  function push(sample) {
    const t = now();
    stats.samples++;
    const issue = detectIssue(sample);
    if (!issue) stats.goodSamples++;
    else {
      stats.issues[issue] = stats.issues[issue] || { seconds: 0, shown: 0 };
      stats.issues[issue].seconds++;
    }
    for (const k of ORDER) streak[k] = k === issue ? (streak[k] || 0) + 1 : 0;
    if (current && t - shownAt >= 5000 && (current === 'good' || streak[current] === 0)) {
      current = null; onTip(null);
    }
    if (current) return;
    for (const k of ORDER) {
      if (streak[k] >= NEEDS[k] && t - (lastShown[k] || -1e9) >= 15000) { show(k); return; }
    }
    const clean = ORDER.every((k) => !streak[k]);
    if (clean && stats.samples >= 8 && t - lastGood > 25000 && stats.goodSamples >= 8) show('good');
  }

  function summary() {
    const out = { ...stats, goodPct: stats.samples ? Math.round((stats.goodSamples / stats.samples) * 100) : 0 };
    return out;
  }
  function save() {
    try { if (stats.samples > 0) localStorage.setItem(KEY, JSON.stringify({ ...summary(), savedAt: new Date().toISOString() })); } catch { /* ignore */ }
  }
  return { push, summary, save };
}

export function loadCoachSummary() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function clearCoachSummary() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
