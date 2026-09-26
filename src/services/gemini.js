/**
 * gemini.js
 *
 * Thin wrapper around the Gemini REST API (gemini-1.5-flash).
 *
 * Uses the generateContent endpoint with a `contents` array so that the full
 * conversation history is sent on every call, giving the model context of
 * everything said so far (stateless multi-turn pattern).
 *
 * Exports
 * ───────
 *   buildSystemInstruction(resumeText, role)
 *     → returns the system prompt string
 *
 *   askGemini({ history, userMessage, resumeText, role })
 *     → Promise<string>  (the model's reply text)
 *
 * Environment variable
 * ────────────────────
 *   VITE_GEMINI_KEY  — Gemini API key (set in .env, never committed)
 *
 * Conversation history format (Gemini REST multi-turn)
 * ────────────────────────────────────────────────────
 *   history: Array<{ role: 'user'|'model', parts: [{ text: string }] }>
 *
 * The system instruction is injected as the very first 'user' turn followed by
 * a synthetic 'model' acknowledgement so Gemini treats it as a persistent
 * constraint without conflating it with the real conversation turns.
 */

const GEMINI_MODEL  = 'gemini-1.5-flash';
const GEMINI_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Build the system instruction sent as the first conversational turn.
 *
 * @param {string} resumeText - raw résumé text
 * @param {string} role       - target job role
 * @returns {string}
 */
export function buildSystemInstruction(resumeText, role) {
  return (
    `You are a professional HR interviewer conducting a mock interview.\n` +
    `The candidate is applying for the role of: ${role}\n\n` +
    `Here is their résumé:\n"""\n${resumeText.trim()}\n"""\n\n` +
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

/**
 * Send a message to Gemini and return the model reply text.
 *
 * @param {object} params
 * @param {Array<{role:string, parts:[{text:string}]}>} params.history
 *        Full Gemini-format history of turns BEFORE the current user message.
 *        Pass an empty array for the very first call.
 * @param {string} params.userMessage
 *        The candidate's latest answer / message text.
 * @param {string} params.resumeText
 *        The candidate's résumé (used to build system instruction).
 * @param {string} params.role
 *        The target job role.
 * @returns {Promise<string>} The model's reply text.
 * @throws {Error} If the API key is missing or the request fails.
 */
export async function askGemini({ history, userMessage, resumeText, role }) {
  const apiKey = import.meta.env.VITE_GEMINI_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error(
      'VITE_GEMINI_KEY is not set. Add your Gemini API key to .env and restart the dev server.'
    );
  }

  /* ── Build the contents array ── */
  // Structure:
  //   [0] user:  system instruction
  //   [1] model: acknowledgement (so Gemini treats it as a system constraint)
  //   [2..N-1]: existing conversation turns from history
  //   [N]:  current user message
  const systemInstruction = buildSystemInstruction(resumeText, role);

  const contents = [
    /* System instruction injected as the first user turn */
    {
      role: 'user',
      parts: [{ text: systemInstruction }],
    },
    /* Synthetic model acknowledgement — prevents the system prompt from being
       treated as a question the model should answer */
    {
      role: 'model',
      parts: [{ text: 'Understood. I will follow these instructions exactly.' }],
    },
    /* All previous turns of the real conversation */
    ...history,
    /* Current user turn */
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];

  /* ── Call the REST endpoint ── */
  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature:     0.7,
        maxOutputTokens: 512,
        topP:            0.9,
      },
      /* Safety settings — relax only as needed for interview content */
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  /* Extract text from the first candidate's first part */
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned an empty response. Check your API key and quota.');
  }

  return text.trim();
}
