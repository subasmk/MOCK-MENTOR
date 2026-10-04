/**
 * api/check.js - POST /api/check
 * Quick strict check: does the candidate's partial answer contain a CLEAR factual mistake?
 * Body: { role, question, partial }   Response: { wrong: boolean, note?: string }
 * Fails safe: any model problem returns { wrong: false } so the interview is never interrupted by mistake.
 */
const MODELS = ['qwen/qwen3.8-27b:free', 'google/gemma-4-26b-a4b-it:free'];
const URL_ = 'https://openrouter.ai/api/v1/chat/completions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.OPENROUTER_API_KEY;
  const { role, question, partial } = req.body ?? {};
  if (!apiKey || typeof partial !== 'string' || partial.trim().split(/\s+/).length < 8) {
    return res.status(200).json({ wrong: false });
  }
  const system =
    'You silently monitor a mock job interview. Decide if the candidate has just said something CLEARLY and factually wrong about a technical or professional concept. ' +
    'Opinions, vague answers, incomplete answers, grammar slips and speech-recognition glitches are NOT wrong. If unsure, say not wrong. ' +
    'Reply with ONLY compact JSON: {"wrong":true|false,"note":"<one short spoken sentence, max 22 words, polite, pointing at the mistake as a question>"}.';
  const user = `Role: ${String(role || '').slice(0, 60)}\nQuestion asked: ${String(question || '').slice(0, 300)}\nCandidate so far: ${partial.slice(-900)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    for (const model of MODELS) {
      const r = await fetch(URL_, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0, max_tokens: 120, reasoning: { enabled: false },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
      if (!r.ok) continue;
      const d = await r.json().catch(() => null);
      const txt = d?.choices?.[0]?.message?.content ?? '';
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) continue;
      try {
        const j = JSON.parse(m[0]);
        if (j.wrong === true && typeof j.note === 'string' && j.note.trim()) {
          return res.status(200).json({ wrong: true, note: j.note.trim().slice(0, 200) });
        }
        return res.status(200).json({ wrong: false });
      } catch { continue; }
    }
  } catch { /* fall through */ } finally { clearTimeout(timer); }
  return res.status(200).json({ wrong: false });
}
