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

const OPENROUTER_MODELS = [
  /* Free models rate-limit independently; fall through on 429/503. */
  'qwen/qwen3.8-27b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
];
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
  const cleaned = raw.replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('No JSON array found');
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
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

/* Retry with backoff on OpenRouter free-tier rate limits (429) and demand spikes (503). */
async function fetchWithRetry(url, options) {
  const RETRY_DELAYS_MS = [1000, 2000];
  for (let attempt = 0; ; attempt++) {
    const upstreamRes = await fetch(url, options);
    if (upstreamRes.ok || attempt >= RETRY_DELAYS_MS.length ||
        (upstreamRes.status !== 429 && upstreamRes.status !== 503)) {
      return upstreamRes;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENROUTER_API_KEY is not configured. Add it to Vercel → Settings → Environment Variables.',
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

  let upstreamRes;
  try {
    for (const model of OPENROUTER_MODELS) {
      upstreamRes = await fetchWithRetry(OPENROUTER_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 4096,
          top_p: 0.85,
          reasoning: { enabled: false },
        }),
      });
      if (upstreamRes.ok) {
        /* A free provider can return 200 with empty content; treat it as a miss. */
        const peek = await upstreamRes.clone().json().catch(() => null);
        if (peek?.choices?.[0]?.message?.content?.trim()) break;
      } else if (upstreamRes.status !== 429 && upstreamRes.status !== 503) break;
    }
  } catch (networkErr) {
    return res.status(500).json({
      error: `Network error reaching OpenRouter: ${networkErr.message}`,
    });
  }

  if (!upstreamRes.ok) {
    const errBody = await upstreamRes.text();
    return res.status(502).json({
      error: `OpenRouter API error ${upstreamRes.status}: ${errBody}`,
    });
  }

  const data  = await upstreamRes.json();
  const raw   = data?.choices?.[0]?.message?.content?.trim();

  if (!raw) {
    return res.status(502).json({
      error: 'OpenRouter returned an empty response.',
    });
  }

  let ratings;
  try {
    ratings = parseRatings(raw);
  } catch (parseErr) {
    return res.status(502).json({
      error: `Failed to parse OpenRouter response: ${parseErr.message}. Raw: ${raw.slice(0, 200)}`,
    });
  }

  return res.status(200).json({ ratings });
}
