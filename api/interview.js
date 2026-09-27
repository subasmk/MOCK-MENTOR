/**
 * api/interview.js
 *
 * Vercel Serverless Function  —  POST /api/interview
 *
 * Keeps the Gemini API key server-side so it is never shipped to the browser.
 * The key is stored as the environment variable GEMINI_KEY in the Vercel
 * project dashboard (Settings → Environment Variables). It is never committed
 * to the repository.
 *
 * ── Request body (JSON) ─────────────────────────────────
 *   {
 *     resume:  string   — plain-text résumé of the candidate
 *     role:    string   — target job role (e.g. "SDE")
 *     history: Array<{ role: "user"|"model", parts: [{ text: string }] }>
 *              — Gemini-format conversation history BEFORE this turn
 *     answer:  string   — candidate's answer / "__START_INTERVIEW__" sentinel
 *   }
 *
 * ── Response (JSON) ─────────────────────────────────────
 *   200  { reply: string }
 *   400  { error: string }   bad request
 *   405  { error: string }   method not allowed
 *   500  { error: string }   upstream Gemini error
 *
 * ── Model ───────────────────────────────────────────────
 *   gemini-3.5-flash  (swap GEMINI_MODEL below if you need a different model;
 *                     gemini-3.5-flash-lite also works for lower quota usage)
 */

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_URL   =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/* ─────────────────────────────────────────────────────────
   System instruction
───────────────────────────────────────────────────────── */
function buildSystemInstruction(resume, role) {
  return (
    `You are a professional HR interviewer conducting a mock interview.\n` +
    `The candidate is applying for the role of: ${role}\n\n` +
    `Here is their résumé:\n"""\n${resume.trim()}\n"""\n\n` +
    `Rules you must follow strictly:\n` +
    `1. Ask exactly ONE question at a time — never bundle multiple questions.\n` +
    `2. After the candidate answers, give brief, constructive feedback (1-2 sentences).\n` +
    `3. Then ask the next question.\n` +
    `4. Cover a total of exactly 6 questions across the interview.\n` +
    `5. After your feedback on the 6th answer, say the interview is complete with a ` +
    `short closing remark and do NOT ask any further questions.\n` +
    `6. Keep all responses concise and professional.\n` +
    `Start immediately with your first question now.`
  );
}

/* ─────────────────────────────────────────────────────────
   Handler
───────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  /* Only POST is allowed */
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  /* Read server-side environment variable — never touches the browser */
  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        'GEMINI_KEY is not configured. Add it under Vercel → Settings → Environment Variables.',
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

  /* Build the Gemini contents array */
  const systemInstruction = buildSystemInstruction(resume, role);

  const contents = [
    /* System instruction as first user turn */
    { role: 'user',  parts: [{ text: systemInstruction }] },
    /* Synthetic model ack so Gemini treats the above as a constraint */
    { role: 'model', parts: [{ text: 'Understood. I will follow these instructions exactly.' }] },
    /* Prior conversation turns */
    ...history,
    /* Current candidate turn */
    { role: 'user',  parts: [{ text: answer }] },
  ];

  /* Call Gemini */
  let geminiRes;
  try {
    geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature:     0.7,
          maxOutputTokens: 512,
          topP:            0.9,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
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

  const data = await geminiRes.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!reply) {
    return res.status(502).json({
      error: 'Gemini returned an empty response. Check your quota and model availability.',
    });
  }

  return res.status(200).json({ reply });
}
