# MockMentor

> AI-powered mock interview coach — dark navy holographic edition.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
```

## Build for production

```bash
npm run build     # output → dist/
npm run preview   # preview the production build locally
```

---

## Project structure

```
src/
├── main.jsx                    # App entry point, providers, router
├── App.jsx                     # Route definitions (/setup, /interview)
├── context/
│   └── MockMentorContext.jsx   # Shared state: resumeText, role, avatar, transcript
├── pages/
│   ├── SetupPage.jsx           # Step 1 — configure session
│   ├── SetupPage.css
│   ├── InterviewPage.jsx       # Step 2 — live mock interview
│   └── InterviewPage.css
├── components/
│   ├── Layout.jsx              # Sticky navbar + page shell
│   ├── Layout.css
│   ├── AvatarPicker.jsx        # Interviewer avatar selection grid
│   ├── AvatarPicker.css
│   ├── TranscriptPanel.jsx     # Chat-bubble transcript viewer
│   └── TranscriptPanel.css
└── styles/
    └── global.css              # CSS variables, reset, theme tokens

public/
├── favicon.svg
└── avatars/
    ├── README.md               # How to add new avatar images
    ├── mentor-aria.png         # (add your own images here)
    ├── mentor-marcus.png
    ├── mentor-priya.png
    └── mentor-leo.png
```

## Shared context

`MockMentorContext` exposes:

| Value             | Type                                  | Description                        |
|-------------------|---------------------------------------|------------------------------------|
| `resumeText`      | `string`                              | User's pasted résumé               |
| `role`            | `string`                              | Target job role                    |
| `avatar`          | `string`                              | Chosen avatar filename             |
| `transcript`      | `{ id, speaker, text }[]`             | Full interview turn history        |
| `setResumeText`   | `(s: string) => void`                 |                                    |
| `setRole`         | `(s: string) => void`                 |                                    |
| `setAvatar`       | `(s: string) => void`                 |                                    |
| `addTurn`         | `(speaker, text) => void`            | Append one turn to transcript      |
| `clearTranscript` | `() => void`                          | Reset transcript for new session   |

## Adding avatar images

Drop square PNG/JPG files into `public/avatars/` and add an entry to
the `MENTORS` array in [`src/components/AvatarPicker.jsx`](src/components/AvatarPicker.jsx).
The UI falls back to coloured initials if an image is missing.

## Wiring up a real AI backend

In [`src/pages/InterviewPage.jsx`](src/pages/InterviewPage.jsx), find the
`// TODO: replace with real AI/backend call` comment inside `handleSubmit`.
Replace the `setTimeout` block with a `fetch`/`axios` call to your backend,
passing `resumeText`, `role`, and `transcript` as context.
