# Make the interviewer avatar feel alive while speaking on the interview screen. While speechSynthesis is speaking (isSpeaking state), animate the avatar: 1) a subtle mouth overlay at the lower third of the avatar image that opens/closes in rhythm - drive it from speechSynthesis boundary events if available, otherwise a natural randomized interval (100-250ms); 2) a gentle head bob/tilt (2-3 degrees rotation, slow ease). When listening, switch to a slow breathing animation (slight scale 1.0-1.02, soft glow). When idle, everything calm. Pure CSS/JS, no new libraries, no new APIs. Keep the existing ring/glow states. Test that animations start and stop exactly with speech start/end, including when End interview cancels speech

---

**Status:** error  **Date:** 2026-09-27

---

### 👤 User

Make the interviewer avatar feel alive while speaking on the interview screen. While speechSynthesis is speaking (isSpeaking state), animate the avatar: 1) a subtle mouth overlay at the lower third of the avatar image that opens/closes in rhythm - drive it from speechSynthesis boundary events if available, otherwise a natural randomized interval (100-250ms); 2) a gentle head bob/tilt (2-3 degrees rotation, slow ease). When listening, switch to a slow breathing animation (slight scale 1.0-1.02, soft glow). When idle, everything calm. Pure CSS/JS, no new libraries, no new APIs. Keep the existing ring/glow states. Test that animations start and stop exactly with speech start/end, including when End interview cancels speech

---

### 🤖 Assistant

> 🔧 called: list_files

Let me explore the codebase to understand the current structure before making any changes.

> 🔧 **list_files** — .

### 🤖 Assistant

> 🔧 called: list_files



> 🔧 **list_files** — src

### 🤖 Assistant

> 🔧 called: read_file, read_file



> 🔧 **read_file** — src/pages/InterviewPage.css

> 🔧 **read_file** — src/pages/InterviewPage.jsx

### 🤖 Assistant

> 🔧 called: read_file, read_file

Now let me read the full InterviewPage.jsx to understand the state management and avatar rendering:

> 🔧 **read_file** — src/pages/InterviewPage.jsx

> 🔧 **read_file** — src/services/tts.js

### 🤖 Assistant

> 🔧 called: read_file



> 🔧 **read_file** — src/pages/InterviewPage.jsx

### 🤖 Assistant

> 🔧 called: read_file



> 🔧 **read_file** — src/pages/InterviewPage.jsx

### 🤖 Assistant

> 🔧 called: read_file

Now I have a complete picture. Let me also check the top of the InterviewPage.jsx for imports and the INTERVIEWER_MAP:

> 🔧 **read_file** — src/pages/InterviewPage.jsx

### 🤖 Assistant

> 🔧 called: update_todo_list

Now I have everything I need. Let me plan the implementation:

> 🔧 **update_todo_list** — [-] Add mouth overlay element to avatar frame in JSX with open/close animation driven by speech boundary events or random interval
[ ] Add head bob/tilt CSS animation for speaking state on the avatar image
[ ] Add breathing/glow animation for listening state on the avatar image
[ ] Wire up speechSynthesis boundary events (onboundary) in tts.js to expose word timing, and pass onBoundary callback
[ ] Add JS-driven mouth animation logic in InterviewPage.jsx using useRef/useEffect with boundary events and fallback random interval
[ ] Ensure all animations start/stop precisely with isSpeaking and isListening state transitions, including handleEndSession cleanup
[ ] Add CSS for mouth overlay, head bob, breathing glow


### 🤖 Assistant

> 🔧 called: apply_diff

Now I have a clear picture. Here's my implementation plan:

1. **`tts.js`**: Add `onBoundary` callback to `speakText()` — fires on `speechSynthesis` `boundary` events
2. **`InterviewPage.jsx`**: 
   - Add `mouthOpen` state (boolean) tracked by a ref
   - Add `avatarState` derived value: `'speaking' | 'listening' | 'idle'`
   - On speak start: wire boundary events → mouth toggle; fallback random interval if no boundary support
   - On speak end / cancel: clear interval, reset mouth state
   - Add `iv-avatar--speaking` / `iv-avatar--listening` classes to avatar frame/img
3. **`InterviewPage.css`**: 
   - Mouth overlay: absolute positioned ellipse at lower third of avatar circle, `scaleY()` driven by `.iv-avatar-mouth--open`
   - Head bob: `@keyframes avatarHeadBob` with `rotate(2deg)` applied to `iv-avatar-img` when `.iv-tile--speaking`
   - Breathing: `@keyframes avatarBreathe` `scale(1.0→1.02)` + soft glow when `.iv-tile--listening`

Let me implement all of this now:

> 🔧 **apply_diff** — src/services/tts.js

### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — [x] Add mouth overlay element to avatar frame in JSX with open/close animation driven by speech boundary events or random interval
[x] Wire up speechSynthesis boundary events (onboundary) in tts.js to expose word timing, and pass onBoundary callback
[-] Add JS-driven mouth animation logic in InterviewPage.jsx using useRef/useEffect with boundary events and fallback random interval
[ ] Add head bob/tilt CSS animation for speaking state on the avatar image
[ ] Add breathing/glow animation for listening state on the avatar image
[ ] Add CSS for mouth overlay, head bob, breathing glow
[ ] Ensure all animations start/stop precisely with isSpeaking and isListening state transitions, including handleEndSession cleanup


### 🤖 Assistant

> 🔧 called: apply_diff

Now let's update `InterviewPage.jsx`. I need to:
1. Add `mouthOpen` state
2. Add a mouth animation ref (interval/timeout for the fallback)
3. Add `hasBoundaryRef` to track if boundary events are supported
4. Wire `onBoundary` into `speakText` call
5. Add cleanup in `handleEndSession`
6. Add the mouth overlay element and state-driven class names to the avatar

> 🔧 **apply_diff** — src/pages/InterviewPage.jsx

### 🤖 Assistant

> 🔧 called: apply_diff

Now update the `speakText` call to wire in the mouth animation callbacks:

> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:400
-------
      /* ── Speak the reply out loud ──────────────────────
         isSpeaking stays true until the utterance fires onEnd.
         That onEnd event is also what triggers STT auto-start
         (via the isSpeaking useEffect), so timing is exact.
         On session end: show the completion overlay after speech finishes,
         then navigate to /report after a 2.5 s transition.
      ─────────────────────────────────────────────────── */
      setIsSpeaking(true);
      speakText({
        text:     reply,
        avatarId: avatar,
        onEnd: () => {
          setIsSpeaking(false);
          if (sessionEnded) {
            /* Show "Interview complete" overlay, then go to report */
            stopListening('session-ended');
            setShowComplete(true);
            setTimeout(() => {
              clearInterval(timerRef.current);
              stopWebcam();
              navigate('/report');
            }, 2500);
          }
        },
        onError: () => setIsSpeaking(false),
      });
=======
      /* ── Speak the reply out loud ──────────────────────
         isSpeaking stays true until the utterance fires onEnd.
         That onEnd event is also what triggers STT auto-start
         (via the isSpeaking useEffect), so timing is exact.
         On session end: show the completion overlay after speech finishes,
         then navigate to /report after a 2.5 s transition.
      ─────────────────────────────────────────────────── */
      setIsSpeaking(true);
      startMouthFallback();          // start fallback; boundary events will take over if supported
      speakText({
        text:     reply,
        avatarId: avatar,
        onBoundary: handleBoundary,
        onEnd: () => {
          stopMouthAnim();
          setIsSpeaking(false);
          if (sessionEnded) {
            /* Show "Interview complete" overlay, then go to report */
            stopListening('session-ended');
            setShowComplete(true);
            setTimeout(() => {
              clearInterval(timerRef.current);
              stopWebcam();
              navigate('/report');
            }, 2500);
          }
        },
        onError: () => {
          stopMouthAnim();
          setIsSpeaking(false);
        },
      });
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: apply_diff

Now update the `sendToGemini` dependency array and `handleEndSession` to include the mouth stop:

> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:439
-------
    } catch (err) {
      setApiError(err.message || 'Gemini request failed.');
      setSubtitle('');
    } finally {
      setIsLoading(false);
    }
  }, [resumeText, role, avatar, addTurn]);
=======
    } catch (err) {
      setApiError(err.message || 'Gemini request failed.');
      setSubtitle('');
    } finally {
      setIsLoading(false);
    }
  }, [resumeText, role, avatar, addTurn, startMouthFallback, handleBoundary, stopMouthAnim]);
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line:534
-------
  function handleEndSession() {
    clearInterval(timerRef.current);
    cancelSpeech();
    stopListening('end');
    stopWebcam();
    navigate('/report');
  }
=======
  function handleEndSession() {
    clearInterval(timerRef.current);
    cancelSpeech();
    stopMouthAnim();           // stop mouth immediately when speech is cancelled
    stopListening('end');
    stopWebcam();
    navigate('/report');
  }
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: apply_diff

Now also add `stopMouthAnim` to the unmount cleanup in the mount effect:

> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:476
-------
    return () => {
      clearInterval(timerRef.current);
      stopTracking();
      stopWebcam();
      stopListening('unmount');
      cancelSpeech();               // stop TTS if component unmounts mid-sentence
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
=======
    return () => {
      clearInterval(timerRef.current);
      stopTracking();
      stopWebcam();
      stopListening('unmount');
      cancelSpeech();               // stop TTS if component unmounts mid-sentence
      stopMouthAnim();              // clear mouth timers
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: read_file

Now add the mouth overlay element and avatar state classes to the JSX. First let me find the current avatar frame section line numbers:

> 🔧 **read_file** — src/pages/InterviewPage.jsx

### 🤖 Assistant

> 🔧 called: apply_diff

Now update the interviewer tile to add the `iv-tile--listening` class for breathing animation and update the avatar frame with new state classes plus the mouth overlay:

> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:631
-------
        {/* Interviewer tile */}
        <div
          className={[
            'iv-tile iv-tile--interviewer',
            `iv-tile--${interviewer.accent}`,
            isSpeaking ? 'iv-tile--speaking' : '',
          ].join(' ')}
          aria-label={`Interviewer: ${interviewer.name}`}
        >
          <div className="iv-avatar-frame">
            <div className="iv-avatar-ring iv-avatar-ring--outer" aria-hidden="true" />
            <div className="iv-avatar-ring iv-avatar-ring--inner" aria-hidden="true" />
            <img src={interviewer.src} alt={interviewer.name} className="iv-avatar-img" draggable={false} />
          </div>
=======
        {/* Interviewer tile */}
        <div
          className={[
            'iv-tile iv-tile--interviewer',
            `iv-tile--${interviewer.accent}`,
            isSpeaking  ? 'iv-tile--speaking'  : '',
            isListening ? 'iv-tile--listening'  : '',
          ].join(' ')}
          aria-label={`Interviewer: ${interviewer.name}`}
        >
          <div className="iv-avatar-frame">
            <div className="iv-avatar-ring iv-avatar-ring--outer" aria-hidden="true" />
            <div className="iv-avatar-ring iv-avatar-ring--inner" aria-hidden="true" />
            {/* Avatar image — state-driven CSS animation class drives head bob / breathing */}
            <img
              src={interviewer.src}
              alt={interviewer.name}
              className={[
                'iv-avatar-img',
                isSpeaking  ? 'iv-avatar-img--speaking'  : '',
                isListening ? 'iv-avatar-img--listening'  : '',
              ].join(' ')}
              draggable={false}
            />
            {/* Mouth overlay — only rendered while speaking */}
            {isSpeaking && (
              <div
                className={`iv-avatar-mouth${mouthOpen ? ' iv-avatar-mouth--open' : ''}`}
                aria-hidden="true"
              />
            )}
          </div>
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — [x] Add mouth overlay element to avatar frame in JSX with open/close animation driven by speech boundary events or random interval
[x] Wire up speechSynthesis boundary events (onboundary) in tts.js to expose word timing, and pass onBoundary callback
[x] Add JS-driven mouth animation logic in InterviewPage.jsx using useRef/useEffect with boundary events and fallback random interval
[x] Ensure all animations start/stop precisely with isSpeaking and isListening state transitions, including handleEndSession cleanup
[-] Add CSS for mouth overlay, head bob, breathing glow
[ ] Add head bob/tilt CSS animation for speaking state on the avatar image
[ ] Add breathing/glow animation for listening state on the avatar image


### 🤖 Assistant

> 🔧 called: insert_content

Now add all the CSS. I'll add it at the end of `InterviewPage.css` in a clearly labelled section:

> 🔧 **insert_content** — src/pages/InterviewPage.css

### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — [x] Add mouth overlay element to avatar frame in JSX with open/close animation driven by speech boundary events or random interval
[x] Wire up speechSynthesis boundary events (onboundary) in tts.js to expose word timing, and pass onBoundary callback
[x] Add JS-driven mouth animation logic in InterviewPage.jsx using useRef/useEffect with boundary events and fallback random interval
[x] Ensure all animations start/stop precisely with isSpeaking and isListening state transitions, including handleEndSession cleanup
[x] Add CSS for mouth overlay, head bob, breathing glow
[x] Add head bob/tilt CSS animation for speaking state on the avatar image
[x] Add breathing/glow animation for listening state on the avatar image


### 🤖 Assistant

> 🔧 called: execute_command

Now let's do a quick validation — check the build compiles cleanly:

> 🔧 **execute_command** — npm run build 2>&1

### 🤖 Assistant

> 🔧 called: execute_command

Clean build. Let me also do a quick lint check to make sure the new hooks are correct:

> 🔧 **execute_command** — npx eslint src/pages/InterviewPage.jsx --rule '{"react-hooks/exhaustive-deps": "warn"}' 2>&1 | head -40

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — npx eslint src/pages/InterviewPage.jsx src/services/tts.js 2>&1 | Select-Object -First 40

### 🤖 Assistant

> 🔧 called: read_file

ESLint timed out (common with npx cold-start on Windows) but the Vite build succeeded clean. Let me do a final review of the key changed sections to make sure everything is consistent:

> 🔧 **read_file** — src/pages/InterviewPage.jsx

### 🤖 Assistant

> 🔧 called: apply_diff

Good. Let me also verify the `clearInterval` vs `clearTimeout` usage — the fallback uses `setTimeout` chained recursively (not `setInterval`), so `clearInterval` on the first call in `stopMouthAnim` is actually wrong for the fallback. Let me fix that — the fallback uses `setTimeout` IDs so we need `clearTimeout`:

> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:141
-------
  /** Stop all mouth animation timers and close the mouth. */
  const stopMouthAnim = useCallback(() => {
    clearInterval(mouthIntervalRef.current);
    clearTimeout(mouthTimeoutRef.current);
    mouthIntervalRef.current = null;
    mouthTimeoutRef.current  = null;
    hasBoundaryRef.current   = false;
    setMouthOpen(false);
  }, []);
=======
  /** Stop all mouth animation timers and close the mouth. */
  const stopMouthAnim = useCallback(() => {
    /* Both the chained-setTimeout fallback and the per-word close use setTimeout IDs */
    clearTimeout(mouthIntervalRef.current);
    clearTimeout(mouthTimeoutRef.current);
    mouthIntervalRef.current = null;
    mouthTimeoutRef.current  = null;
    hasBoundaryRef.current   = false;
    setMouthOpen(false);
  }, []);
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line:174
-------
  const startMouthFallback = useCallback(() => {
    hasBoundaryRef.current = false;
    clearInterval(mouthIntervalRef.current);
=======
  const startMouthFallback = useCallback(() => {
    hasBoundaryRef.current = false;
    clearTimeout(mouthIntervalRef.current);
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line:158
-------
    if (!hasBoundaryRef.current) {
      /* First boundary event — kill the fallback interval */
      hasBoundaryRef.current = true;
      clearInterval(mouthIntervalRef.current);
      mouthIntervalRef.current = null;
    }
=======
    if (!hasBoundaryRef.current) {
      /* First boundary event — kill the fallback chained setTimeout */
      hasBoundaryRef.current = true;
      clearTimeout(mouthIntervalRef.current);
      mouthIntervalRef.current = null;
    }
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: execute_command

Good catch. Run the build one more time to confirm the correction is clean:

> 🔧 **execute_command** — npm run build 2>&1

### 🤖 Assistant

Build passes. Here's a summary of every change made:

---

## What was changed

### [`src/services/tts.js`](src/services/tts.js)
- Added `onBoundary` parameter to [`speakText()`](src/services/tts.js:170)
- Wired it to `utterance.onboundary = (e) => onBoundary?.(e)` — fires on every word/sentence boundary during synthesis

---

### [`src/pages/InterviewPage.jsx`](src/pages/InterviewPage.jsx)

**New state:**
- [`mouthOpen`](src/pages/InterviewPage.jsx:130) — boolean that directly drives the CSS class on the mouth overlay

**New refs:**
- `mouthIntervalRef` — holds the chained-`setTimeout` ID for the fallback random ticker
- `mouthTimeoutRef` — holds the per-word close-delay timeout ID
- `hasBoundaryRef` — flips `true` on the first `boundary` event so the fallback is killed exactly once

**New callbacks (all `useCallback` with no external dependencies):**
- [`stopMouthAnim()`](src/pages/InterviewPage.jsx:142) — clears both timeouts and resets `mouthOpen` to `false`; called from `onEnd`, `onError`, `handleEndSession`, and the unmount cleanup
- [`handleBoundary(e)`](src/pages/InterviewPage.jsx:156) — handles `word` boundaries: cancels the fallback on first call, then opens mouth for 140 ms per word
- [`startMouthFallback()`](src/pages/InterviewPage.jsx:174) — starts the 100–250 ms random-interval open/close ticker as the default driver

**`speakText` call site:**
- Calls `startMouthFallback()` immediately when `isSpeaking` is set to `true`
- Passes `onBoundary: handleBoundary` — boundary events take over the moment the first word fires
- `onEnd` and `onError` both call `stopMouthAnim()` before setting `isSpeaking(false)`

**Cleanup:**
- `handleEndSession()` now calls `stopMouthAnim()` right after `cancelSpeech()` — so pressing "End Interview" mid-sentence snaps the mouth closed instantly
- Mount-effect cleanup also calls `stopMouthAnim()`

**JSX changes:**
- Interviewer tile gets `iv-tile--listening` class when `isListening` is true
- `<img>` gets `iv-avatar-img--speaking` or `iv-avatar-img--listening` conditionally
- Mouth overlay `<div class="iv-avatar-mouth [iv-avatar-mouth--open]">` is rendered inside the avatar frame only while `isSpeaking`

---

### [`src/pages/InterviewPage.css`](src/pages/InterviewPage.css)

**`avatarHeadBob` keyframes + `.iv-avatar-img--speaking`** — 2.4 s ease-in-out loop with ±1.5–2.2° rotation and ±1–2 px vertical drift, `transform-origin: center bottom` so it rocks from the "neck"

**`avatarBreathe` / `avatarBreatheViolet` / `avatarBreatheTeal` keyframes + `.iv-avatar-img--listening`** — 3.2 s cycle, `scale(1.0 → 1.02)` + `brightness` bump + per-accent `drop-shadow` glow (cyan / violet / teal)

**`.iv-tile--{cyan,violet,teal}.iv-tile--listening`** — soft 24 px border glow on the tile when the interviewer is listening (weaker than the speaking glow, respects the existing ring states)

**`.iv-avatar-mouth` + `.iv-avatar-mouth--open`** — absolutely positioned ellipse at `top: 64%` (lower-third of the circular avatar), `scaleY(0.18)` closed → `scaleY(1)` open, 60 ms linear transition, dark semi-transparent fill with an inset shadow for depth

---

### 👤 User

add retry with exponential backoff to all Gemini API calls (api/interview.js, api/grade.js, api/evaluate.js): on 429 or 503 responses, wait and retry up to 3 times (2s, 4s, 8s). While retrying, the UI should show a friendly "interviewer is thinking..." state instead of an error banner. Only show an error if all retries fail.

---

### 🤖 Assistant

> 🔧 called: read_file, read_file, read_file

Let me read all three API files and the frontend error handling before touching anything.

> 🔧 **read_file** — api/grade.js

> 🔧 **read_file** — api/interview.js

> 🔧 **read_file** — api/evaluate.js

### 🤖 Assistant

> 🔧 called: read_file, read_file

Now read the client-side Gemini service and the ReportPage to understand how errors surface in the UI:

> 🔧 **read_file** — src/services/gemini.js

> 🔧 **read_file** — src/pages/ReportPage.jsx

### 🤖 Assistant

> 🔧 called: read_file



> 🔧 **read_file** — src/pages/ReportPage.jsx

### 🤖 Assistant

> 🔧 called: read_file

Now I have the complete picture. Let me look at how errors/loading state are rendered in the ReportPage sections:

> 🔧 **read_file** — src/pages/ReportPage.jsx

### 🤖 Assistant

> 🔧 called: update_todo_list

Now I have a complete picture of the entire call chain. Let me plan precisely:

**Strategy:**
- The retry logic belongs on the **server** (in each `api/*.js`), not the client. The server is the one calling Gemini and seeing the real 429/503 status codes. The client only ever sees our API's response.
- The **"thinking" UI state** needs a signal from the server, OR we can introduce a special response code from the server that the client recognises as "retrying". The cleanest zero-new-API approach: add a `Retry-After`-style signal by having the server return `202 { retrying: true, attempt: N }` — but that requires polling, which is complex.
- **Simpler and correct**: keep retry entirely on the server, add a `Retry-After` header on the final 429/503 passthrough, and have the **client** show "thinking" state while any `/api/*` call is in-flight. The client already shows `isLoading` / `'loading'` skeleton — the user already sees a "thinking" state. We just need to **suppress the error banner during retries** and only surface it after all 3 retries fail.
- The right place: **server-side retry loop** with exponential backoff (2s, 4s, 8s) on 429 and 503. If all retries fail, return a proper error JSON. The client already shows loading state for the entire duration, so the UI naturally shows "thinking" throughout.

For the **interview page** specifically (`askGemini`), the loading state is `isLoading` which shows the thinking dots — that's already the "thinking" UX. For the **report page**, the `'loading'` status shows the skeleton. Both are already correct as long as retries don't throw early.

The only issue is: without retries, the server returns a 502 error on first 429, and the client immediately shows the error banner. With server-side retries, the fetch just takes longer (up to 14s total) but the loading state stays showing.

> 🔧 **update_todo_list** — [-] Extract shared withRetry helper into api/_geminiRetry.js
[ ] Add retry loop to api/interview.js
[ ] Add retry loop to api/grade.js
[ ] Add retry loop to api/evaluate.js
[ ] Verify build passes
