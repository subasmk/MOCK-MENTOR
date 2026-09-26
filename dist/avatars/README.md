# /public/avatars

Place interviewer avatar images here.

## Expected filenames

| File                  | Mentor name    | Specialty        |
|-----------------------|----------------|------------------|
| `mentor-aria.png`     | Aria Chen      | Frontend / UI    |
| `mentor-marcus.png`   | Marcus Reid    | System Design    |
| `mentor-priya.png`    | Priya Nair     | Data & ML        |
| `mentor-leo.png`      | Leo Vasquez    | Backend / APIs   |

## Guidelines

- Square images work best (recommended: 256×256 px or larger)
- PNG or JPEG are both fine
- If an image is missing the UI falls back to the mentor's initials on a
  gradient background, so the app works without any images present

## Adding a new mentor

1. Drop the image file here (e.g. `mentor-sam.png`)
2. Add an entry to the `MENTORS` array in
   `src/components/AvatarPicker.jsx`
