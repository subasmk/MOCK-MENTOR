# MockMentor

**An AI HR interviewer that practices with you from your own resume — and tells you exactly what to fix before the real interview.**

MockMentor feels like a one-on-one video call with HR. It asks questions based on your resume and target role, listens to your answers, watches your confidence through the webcam, and ends with a scored report: answer ratings, communication evaluation, speech analysis, and personalized what-to-improve tips.

Built for students who blank out in interviews. Practice until the fear is gone.

## Features

- **Resume-based interviews** — paste your resume, pick a role (SDE, Data Analyst, Marketing, HR, Product), and the AI interviewer asks 6 tailored questions with real follow-ups
- **Pick your interviewer** — male, female, or robot avatar, each with its own voice, subtitles, and lip-sync animation
- **Voice or typed answers** — speak naturally (Web Speech API) or type; the full transcript is saved
- **Live confidence tracking** — face-api.js reads your expressions and eye contact through the webcam while you answer
- **Scored report** — per-answer ratings, communication evaluation (filler words, pace, clarity), speech analysis, and concrete tips on what to improve

## Meet your interviewers

<p align="center">
  <img src="public/avatars/interviewer-male.png" width="180" alt="Male interviewer"/>
  <img src="public/avatars/interviewer-female.png" width="180" alt="Female interviewer"/>
  <img src="public/avatars/interviewer-robot.png" width="180" alt="Robot interviewer"/>
</p>

## Tech stack

- **Frontend:** React + Vite
- **AI:** OpenRouter (free models with automatic fallback) (question generation, answer grading, communication evaluation)
- **Vision:** face-api.js pre-trained expression models
- **Voice:** Web Speech API (speech recognition + speechSynthesis)
- **Backend:** Vercel serverless API routes (`api/interview.js`, `api/grade.js`, `api/evaluate.js`) — the OpenRouter key stays server-side in a `OPENROUTER_API_KEY` env var and never ships to the browser

## Run it locally

```bash
npm install
echo "OPENROUTER_API_KEY=your-openrouter-api-key" > .env
npx vercel dev        # serves the app + /api routes together
```

(Or `npm run dev` for the UI alone — point the `/api` proxy at any local function runner on port 3001.)

## Deploy

Deploy to Vercel and set the `OPENROUTER_API_KEY` environment variable in the project settings. Redeploy after adding the key. Free-model availability and rate limits can change; check the OpenRouter dashboard if requests fail.

## Built with IBM Bob

MockMentor was built with IBM Bob IDE agents for the **IBM Bob 2.0 Hackathon**. Our exported Bob agent session reports — task-by-task markdown and screenshots — are in [`bob_sessions/`](bob_sessions/).
