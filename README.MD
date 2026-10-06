<div align="center">

<img src="public/avatars/interviewer-female.png" width="110" alt=""/> <img src="public/avatars/interviewer-male.png" width="110" alt=""/> <img src="public/avatars/interviewer-robot.png" width="110" alt=""/>

# MockMentor

**An AI HR interviewer that practises with you from your own resume, then tells you exactly what to fix before the real one.**

[![Live demo](https://img.shields.io/badge/Live_demo-mock--mentor--taupe.vercel.app-16a34a?style=for-the-badge&logo=vercel&logoColor=white)](https://mock-mentor-taupe.vercel.app)
[![IBM Bob 2.0 Hackathon](https://img.shields.io/badge/IBM_Bob_2.0-Hackathon_build-0f62fe?style=for-the-badge)](bob_sessions/)

</div>

---

## Why it exists

Most students blank out in interviews, not because they lack skills but because they never practised under pressure. MockMentor feels like a one-on-one video call with HR. It reads your resume, asks questions for your target role, watches how confident you look, and ends with a scored report.

## What you get

| | |
|---|---|
| **Resume-based questions** | Paste your resume, pick a role (SDE, Data Analyst, Marketing, HR, Product). The interviewer asks 6 tailored questions with real follow-ups. |
| **Pick your interviewer** | Male, female or robot. Each has its own portrait, voice and subtitles, with a mouth that moves in time with the speech. |
| **Speak or type** | Answer out loud (browser speech recognition) or type. The full transcript is saved. |
| **Live camera coaching** | Facial expression and eye contact are tracked while you answer, with one small tip at a time on screen. |
| **Scored report** | Per-answer ratings, communication evaluation (filler words, pace, clarity), speech analysis and concrete things to improve. |

## Built with

React + Vite, Vercel serverless functions, OpenRouter free models (automatic fallback), face-api.js, Web Speech API. The AI key stays on the server and never reaches the browser.

## Hackathon

Built for the **IBM Bob 2.0 Hackathon** by [Subash M K](https://github.com/subasmk) and teammate **Suren**, with IBM Bob IDE agents. The exported Bob agent session reports (task-by-task notes and screenshots) are in [`bob_sessions/`](bob_sessions/).

## Try it

Open the **[live demo](https://mock-mentor-taupe.vercel.app)**, allow the camera and microphone in Chrome or Edge, and start an interview.

<details>
<summary>Run it yourself</summary>

```bash
npm install
echo "OPENROUTER_API_KEY=your-key" > .env
npx vercel dev
```

</details>
