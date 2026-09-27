/**
 * gemini.js  —  frontend client for the Gemini serverless routes
 *
 * The Gemini API key lives exclusively on the server (Vercel environment
 * variable GEMINI_KEY). This module never touches the key.
 *
 * Exports
 * ───────
 *   askGemini({ history, userMessage, resumeText, role })
 *     → Promise<string>   (the interviewer's next line)
 *
 *   rateTranscript({ role, turns })
 *     → Promise<Array<{ index: number, score: number, tip: string }>>
 *
 *   `turns` shape:  Array<{ question: string, answer: string }>
 *
 * Conversation history format  (Gemini multi-turn, built by InterviewPage)
 * ─────────────────────────────────────────────────────────────────────────
 *   Array<{ role: 'user'|'model', parts: [{ text: string }] }>
 */

/**
 * POST to the serverless route and return the reply text.
 *
 * @param {object} params
 * @param {Array}  params.history      Gemini-format prior turns
 * @param {string} params.userMessage  Candidate's answer (or START sentinel)
 * @param {string} params.resumeText   Plain-text résumé
 * @param {string} params.role         Target job role
 * @returns {Promise<string>}
 */
export async function askGemini({ history, userMessage, resumeText, role }) {
  const res = await fetch('/api/interview', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume:  resumeText,
      role,
      history,
      answer:  userMessage,
    }),
  });

  /* Surface structured errors from the API route */
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* non-JSON body — keep the status-code message */ }
    throw new Error(msg);
  }

  const data = await res.json();

  if (!data?.reply) {
    throw new Error('Empty reply from /api/interview. Check server logs.');
  }

  return data.reply;
}

/**
 * POST the completed transcript to /api/grade and return per-answer ratings.
 *
 * @param {object}   params
 * @param {string}   params.role   Target job role
 * @param {Array<{question:string, answer:string}>} params.turns
 *   Paired Q&A turns — caller must build these from the raw transcript.
 * @returns {Promise<Array<{index:number, score:number, tip:string}>>}
 */
export async function rateTranscript({ role, turns }) {
  const res = await fetch('/api/grade', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, turns }),
  });

  if (!res.ok) {
    let msg = `Grade API error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* non-JSON body */ }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!Array.isArray(data?.ratings)) {
    throw new Error('Unexpected response shape from /api/grade');
  }
  return data.ratings;
}
