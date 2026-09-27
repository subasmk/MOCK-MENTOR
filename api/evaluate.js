/**
 * api/evaluate.js
 *
 * Vercel Serverless Function  —  POST /api/evaluate
 *
 * Evaluates the whole interview transcript on four communication dimensions
 * and returns a score, one-line reason, and actionable tip for each.
 *
 * ── Request body (JSON) ───────────────────────────────────
 *   {
 *     role:    string   — target job role
 *     turns:   Array<{ question: string, answer: string }>
 *   }
 *
 * ── Response (JSON) ───────────────────────────────────────
 *   200  {
 *     evaluation: {
 *       grammarClarity:     { score: number, reason: string, tip: string },
 *       answerStructure:    { score: number, reason: string, tip: string },
 *       relevance:          { score: number, reason: string, tip: string },
 *       professionalTone:   { score: number, reason: string, tip: string },
 *     }
 *   }
 *   400 / 405 / 500  { error: string }
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
   Prompt
───────────────────────────────────────────────────────── */
function buildPrompt(role, turns) {
  const dialogue = turns
    .map((t, i) => `Q${i + 1}: ${t.question.trim()}\nA${i + 1}: ${t.answer.trim()}`)
    .join('\n\n');

  return (
    `You are an expert communication coach evaluating a mock interview for the role: ${role}.\n\n` +
    `Here is the complete interview:\n\n${dialogue}\n\n` +
    `Evaluate the CANDIDATE's answers across exactly four dimensions. ` +
    `For each dimension give:\n` +
    `  "score"  — integer 1 (very poor) to 10 (excellent), based on ALL answers combined\n` +
    `  "reason" — ONE sentence (max 20 words) that explains the score concisely\n` +
    `  "tip"    — ONE concrete, actionable improvement (max 25 words) tailored to the candidate's answers\n\n` +
    `Make each tip address the specific weakness reflected in its score. Avoid repeating the reason.\n\n` +
    `The four dimensions and their keys:\n` +
    `  grammarClarity   — correctness of grammar, vocabulary, and clarity of expression\n` +
    `  answerStructure  — whether answers are organised (e.g. STAR, intro-body-close)\n` +
    `  relevance        — how well answers address the question and stay on-topic\n` +
    `  professionalTone — appropriateness of language, confidence, and formal register\n\n` +
    `Output ONLY valid JSON matching this shape exactly (no markdown, no extra keys):\n` +
    `{"grammarClarity":{"score":8,"reason":"...","tip":"..."},` +
    `"answerStructure":{"score":6,"reason":"...","tip":"..."},` +
    `"relevance":{"score":7,"reason":"...","tip":"..."},` +
    `"professionalTone":{"score":9,"reason":"...","tip":"..."}}`
  );
}

/* ─────────────────────────────────────────────────────────
   Parse + validate
───────────────────────────────────────────────────────── */
const REQUIRED_KEYS = ['grammarClarity', 'answerStructure', 'relevance', 'professionalTone'];

function parseEvaluation(raw) {
  const cleaned = raw.replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object found');
  const obj = JSON.parse(cleaned.slice(start, end + 1));
  const result = {};
  for (const key of REQUIRED_KEYS) {
    if (!obj[key]) throw new Error(`Missing dimension: ${key}`);
    const tip = String(obj[key].tip ?? '').trim();
    if (!tip) throw new Error(`Missing improvement tip: ${key}`);
    result[key] = {
      score:  Math.min(10, Math.max(1, Math.round(Number(obj[key].score)))),
      reason: String(obj[key].reason ?? '').trim(),
      tip,
    };
  }
  return result;
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
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured.' });
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
          temperature: 0.25,
          max_tokens: 2048,
          top_p: 0.85,
          reasoning: { enabled: false },
        }),
      });
      if (upstreamRes.ok || (upstreamRes.status !== 429 && upstreamRes.status !== 503)) break;
    }
  } catch (netErr) {
    return res.status(500).json({ error: `Network error: ${netErr.message}` });
  }

  if (!upstreamRes.ok) {
    const errBody = await upstreamRes.text();
    return res.status(502).json({ error: `OpenRouter API ${upstreamRes.status}: ${errBody}` });
  }

  const data = await upstreamRes.json();
  const raw  = data?.choices?.[0]?.message?.content?.trim();
  if (!raw) return res.status(502).json({ error: 'OpenRouter returned an empty response.' });

  let evaluation;
  try {
    evaluation = parseEvaluation(raw);
  } catch (parseErr) {
    return res.status(502).json({
      error: `Parse error: ${parseErr.message}. Raw: ${raw.slice(0, 200)}`,
    });
  }

  return res.status(200).json({ evaluation });
}
