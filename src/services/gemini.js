/**
 * gemini.js  —  frontend client for the /api/interview serverless route
 *
 * The Gemini API key lives exclusively on the server (Vercel environment
 * variable GEMINI_KEY). This module never touches the key.
 *
 * All it does is POST the conversation payload to /api/interview and return
 * the interviewer's next reply text.
 *
 * Exports
 * ───────
 *   buildSystemInstruction(resumeText, role)  — kept here for documentation;
 *     the actual system prompt is built server-side in api/interview.js
 *
 *   askGemini({ history, userMessage, resumeText, role })
 *     → Promise<string>   (the interviewer's next line)
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
