/**
 * api/grade.js
 *
 * Vercel Serverless Function  —  POST /api/grade
 *
 * Accepts the complete interview transcript (Q&A pairs) and returns a
 * structured rating for every candidate answer.
 *
 * ── Request body (JSON) ───────────────────────────────────
 *   {
 *     role:    string   — target job role
 *     turns:   Array<{ question: string, answer: string }>
 *   }
 *
 * ── Response (JSON) ───────────────────────────────────────
 *   200  { ratings: Array<{ index: number, score: number, tip: string }> }
 *   400  { error: string }
 *   405  { error: string }
 *   500  { error: string }
 *
 * Each rating:
 *   index  — 0-based position in the `turns` array
 *   score  — integer 1-10
 *   tip    — one concise improvement suggestion (≤ 25 words)
 */

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_URL   =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/* ─────────────────────────────────────────────────────────
   Prompt builder
───────────────────────────────────────────────────────── */
function buildPrompt(role, turns) {
  const pairs = turns
    .map((t, i) =>
      `Q${i + 1}: ${t.question.trim()}\nA${i + 1}: ${t.answer.trim()}`
    )
    .join('\n\n');

  return (
    `You are an expert interview coach evaluating a mock interview for the role of: ${role}.\n\n` +
    `Below are the interview question-and-answer pairs.\n\n` +
    `${pairs}\n\n` +
    `Task:\n` +
    `For EACH answer, output a JSON object with exactly three fields:\n` +
    `  "index"  — 0-based integer matching the answer position\n` +
    `  "score"  — integer from 1 (very poor) to 10 (excellent)\n` +
    `  "tip"    — ONE concrete improvement suggestion, maximum 25 words, ` +
    `             starting with an action verb (e.g. "Add a specific example…")\n\n` +
    `Output ONLY a JSON array of these objects. No markdown fences, no extra text.\n` +
    `Example format:\n` +
    `[{"index":0,"score":7,"tip":"Add a concrete metric to quantify the impact of your work."},` +
    `{"index":1,"score":5,"tip":"Structure your answer using the STAR method for clarity."}]`
  );
}

/* ─────────────────────────────────────────────────────────
   Parse helper — tolerant of minor model formatting slips
───────────────────────────────────────────────────────── */
function parseRatings(raw) {
  // Strip possible markdown fences
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const parsed  = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
  return parsed.map((r) => ({
    index: Number(r.index),
    score: Math.min(10, Math.max(1, Math.round(Number(r.score)))),
    tip:   String(r.tip ?? '').trim(),
  }));
}

/* ─────────────────────────────────────────────────────────
   Handler
───────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_KEY is not configured. Add it to Vercel → Settings → Environment Variables.',
    });
  }

  const { role, turns } = req.body ?? {};

  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: '`role` is required.' });
  }
  if (!Array.isArray(turns) || turns.length === 0) {
    return res.status(400).json({ error: '`turns` must be a non-empty array.' });
  }

  const prompt = buildPrompt(role, turns);

  let geminiRes;
  try {
    geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.3,   // low temp → consistent structured output
          maxOutputTokens: 1024,
          topP:            0.85,
          responseMimeType: 'application/json',
        },
      }),
    });
  } catch (networkErr) {
    return res.status(500).json({
      error: `Network error reaching Gemini: ${networkErr.message}`,
    });
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text();
    return res.status(502).json({
      error: `Gemini API error ${geminiRes.status}: ${errBody}`,
    });
  }

  const data  = await geminiRes.json();
  const raw   = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!raw) {
    return res.status(502).json({
      error: 'Gemini returned an empty response.',
    });
  }

  let ratings;
  try {
    ratings = parseRatings(raw);
  } catch (parseErr) {
    return res.status(502).json({
      error: `Failed to parse Gemini response: ${parseErr.message}. Raw: ${raw.slice(0, 200)}`,
    });
  }

  return res.status(200).json({ ratings });
}
