/**
 * api/interview.js
 *
 * Vercel Serverless Function  —  POST /api/interview
 *
 * Keeps the OpenRouter API key server-side so it is never shipped to the browser.
 * The key is stored as the environment variable OPENROUTER_API_KEY in the Vercel
 * project dashboard (Settings → Environment Variables). It is never committed
 * to the repository.
 *
 * ── Request body (JSON) ─────────────────────────────────
 *   {
 *     resume:  string   — plain-text résumé of the candidate
 *     role:    string   — target job role (e.g. "SDE")
 *     history: Array<{ role: "user"|"model", parts: [{ text: string }] }>
 *              — legacy frontend conversation history BEFORE this turn
 *     answer:  string   — candidate's answer / "__START_INTERVIEW__" sentinel
 *   }
 *
 * ── Response (JSON) ─────────────────────────────────────
 *   200  { reply: string }
 *   400  { error: string }   bad request
 *   405  { error: string }   method not allowed
 *   500  { error: string }   upstream model error
 *
 * ── Model ───────────────────────────────────────────────
 *   Free-model chain with automatic fallback on 429/503 (see OPENROUTER_MODELS) */

const OPENROUTER_MODELS = [
  /* Free models rate-limit independently; fall through on 429/503. */
  'qwen/qwen3.8-27b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
];
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/* ─────────────────────────────────────────────────────────
   System instruction
───────────────────────────────────────────────────────── */
function buildSystemInstruction(resume, role) {
  return (
    `You are Priya, a warm and experienced HR interviewer at a great company, ` +
    `having a friendly one-on-one video conversation with a candidate.\n` +
    `The candidate is interviewing for the role of: ${role}\n\n` +
    `Here is their resume:\n"""\n${resume.trim()}\n"""\n\n` +
    `How you speak (everything you say is read aloud by a voice - this is a ` +
    `spoken conversation):\n` +
    `- Talk like a real person, never a robot: short natural sentences, ` +
    `contractions, simple everyday words.\n` +
    `- No markdown, no bullet points, no numbering, no emojis, no labels like ` +
    `"Question 3", no stage directions. Just spoken words.\n` +
    `- Keep every reply under 60 words so it stays conversational.\n\n` +
    `How you interview:\n` +
    `1. Open with a warm genuine greeting using their name, one short line about ` +
    `how nice it is to meet them, then your first question.\n` +
    `2. Ask exactly ONE question at a time - never bundle questions.\n` +
    `3. When they answer, react like a human first: a short genuine acknowledgment ` +
    `that shows you truly listened, mentioning something specific they said ` +
    `(1-2 sentences, natural praise or curiosity). If an answer was thin, gently ` +
    `probe once, like "Interesting, can you give me a specific example?" - before ` +
    `moving on.\n` +
    `4. Ask exactly 6 questions in total. Mix them: a tell-me-about-yourself ` +
    `opener, behavioral questions like "Tell me about a time you...", situational ` +
    `questions like "What would you do if...", and questions that dig into real ` +
    `specifics from their resume. Tailor everything to the ${role} role.\n` +
    `5. After reacting to the 6th answer, close warmly: thank them, offer one ` +
    `genuine encouraging line, and say the interview is complete. Do NOT ask any ` +
    `further questions after that.\n` +
    `Start now with your greeting and first question.`
  );
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
  /* Only POST is allowed */
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  /* Read server-side environment variable — never touches the browser */
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        'OPENROUTER_API_KEY is not configured. Add it under Vercel → Settings → Environment Variables.',
    });
  }

  /* Parse and validate request body */
  const { resume, role, history, answer } = req.body ?? {};

  if (typeof resume !== 'string' || !resume.trim()) {
    return res.status(400).json({ error: '`resume` is required.' });
  }
  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: '`role` is required.' });
  }
  if (!Array.isArray(history)) {
    return res.status(400).json({ error: '`history` must be an array.' });
  }
  if (typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: '`answer` is required.' });
  }

  /* Keep the frontend's Gemini-shaped history contract, convert it only at the API boundary. */
  const messages = [
    { role: 'system', content: buildSystemInstruction(resume, role) },
    ...history.map((turn) => ({
      role: turn.role === 'model' ? 'assistant' : 'user',
      content: Array.isArray(turn.parts) ? turn.parts.map((part) => part.text ?? '').join('') : '',
    })),
    { role: 'user', content: answer },
  ];

  /* Call OpenRouter */
  let upstreamRes;
  try {
    for (const model of OPENROUTER_MODELS) {
      upstreamRes = await fetchWithRetry(OPENROUTER_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 512,
          top_p: 0.9,
          reasoning: { enabled: false },
        }),
      });
      if (upstreamRes.ok || (upstreamRes.status !== 429 && upstreamRes.status !== 503)) break;
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

  const data = await upstreamRes.json();
  const rawReply = data?.choices?.[0]?.message?.content?.trim();
  /* Strip any leaked thinking artifacts before the text is shown or spoken */
  const reply = rawReply
    ?.replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '')
    .replace(/<\/?thought>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!reply) {
    return res.status(502).json({
      error: 'OpenRouter returned an empty response. Check your quota and model availability.',
    });
  }

  return res.status(200).json({ reply });
}
