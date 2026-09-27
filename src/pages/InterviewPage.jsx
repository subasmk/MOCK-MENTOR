/**
 * InterviewPage.jsx
 *
 * Full-viewport mock video-call with Gemini AI interviewer + Web Speech API.
 *
 * ┌─────────────────────────────────────────────────────┐
 * │  HUD  (role · wordmark · timer · LIVE)              │
 * ├──────────────────────┬──────────────────────────────┤
 * │  INTERVIEWER tile    │  USER WEBCAM tile            │
 * │  avatar + glow rings │  getUserMedia + mic ring     │
 * ├──────────────────────┴──────────────────────────────┤
 * │  SUBTITLES  (interviewer text OR live STT interim)  │
 * │  INPUT ROW  (mic button + text fallback + send)     │
 * │  CONTROLS   (End Interview)                         │
 * └─────────────────────────────────────────────────────┘
 *
 * ── Voice flow ──────────────────────────────────────────
 *  1. Interviewer "speaks" (isSpeaking = true, avatar ring animates).
 *  2. When speaking ends (isSpeaking → false) listening auto-starts after
 *     300 ms so the question has fully "settled".
 *  3. webkitSpeechRecognition runs in continuous mode with interim results:
 *     • Interim words appear in the subtitle bar in real-time (italic/dim).
 *     • Each `onresult` event resets a 2 s silence timer.
 *  4. After 2 s of silence (or the user clicks Stop), `commitAnswer` fires:
 *     stops recognition, trims the final transcript, sends to Gemini.
 *  5. `no-speech` event → show reprompt message → restart listening after 1 s.
 *  6. Users can manually toggle the mic with the mic button at any time.
 *
 * ── Text fallback ───────────────────────────────────────
 *  A text input + Send button always coexist with the mic.
 *  Submitting via text also stops any active recognition session.
 *
 * ── Gemini history ──────────────────────────────────────
 *  geminiHistoryRef (ref, not state) tracks all turns in Gemini format.
 *  sendToGemini() appends both the user turn and the model reply after each
 *  exchange, giving the model full conversational context.
 */
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useNavigate }                          from 'react-router-dom';
import { useMockMentor }                        from '../context/MockMentorContext';
import { askGemini }                            from '../services/gemini';
import { speakText, cancelSpeech, TTS_SUPPORTED } from '../services/tts';
import { startTracking, stopTracking }             from '../tracking/faceTracker';
import './InterviewPage.css';

/* ─────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────── */
const INTERVIEWER_MAP = {
  male:   { name: 'Alex Turner', tag: 'Technical Lead',  src: '/avatars/interviewer-male.png',   accent: 'cyan'   },
  female: { name: 'Priya Nair',  tag: 'Hiring Manager',  src: '/avatars/interviewer-female.png', accent: 'violet' },
  robot:  { name: 'ARIA-7',      tag: 'AI Evaluator',    src: '/avatars/interviewer-robot.png',  accent: 'teal'   },
};

/** Sentinel sent as the first user turn to kick off question 1. */
const FIRST_TURN_SENTINEL = '__START_INTERVIEW__';

/** ms of silence before auto-committing the spoken answer. */
const SILENCE_TIMEOUT_MS = 2000;

/** True when the browser exposes webkitSpeechRecognition. */
const SPEECH_SUPPORTED =
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

/* ─────────────────────────────────────────────────────────
   Helper
───────────────────────────────────────────────────────── */
function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* ─────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────── */
export default function InterviewPage() {
  const navigate = useNavigate();
  const { avatar, role, resumeText, addTurn, clearTranscript } = useMockMentor();

  const interviewer = INTERVIEWER_MAP[avatar] ?? INTERVIEWER_MAP.male;

  /* ── Guard ── */
  if (!role || !resumeText) {
    return (
      <div className="iv-gate">
        <p className="iv-gate__msg">No active session — please complete setup first.</p>
        <button className="btn btn-primary" onClick={() => navigate('/setup')}>
          Go to Setup
        </button>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────
     Refs — nothing here should trigger a re-render
  ───────────────────────────────────────────────────── */
  const geminiHistoryRef = useRef([]);   // Gemini-format conversation history
  const videoRef         = useRef(null); // <video> element
  const streamRef        = useRef(null); // MediaStream
  const timerRef         = useRef(null); // session interval
  const seededRef        = useRef(false);// first-question guard

  /* Speech recognition refs */
  const recognitionRef    = useRef(null);  // SpeechRecognition instance
  const silenceTimerRef   = useRef(null);  // auto-commit timer
  const finalTranscriptRef = useRef('');   // accumulated confirmed words
  const shouldAutoStartRef = useRef(false);// set true after speak ends

  /* ─────────────────────────────────────────────────────
     UI state
  ───────────────────────────────────────────────────── */
  const [camStatus,   setCamStatus]   = useState('idle');   // 'idle'|'active'|'denied'
  const [elapsed,     setElapsed]     = useState(0);
  const [isSpeaking,    setIsSpeaking]    = useState(false); // interviewer speaking animation
  const [isLoading,     setIsLoading]     = useState(false); // Gemini in-flight
  const [listenState,   setListenState]   = useState('idle');// 'idle'|'listening'|'paused'
  const [subtitle,      setSubtitle]      = useState('');    // shown in subtitle bar
  const [interimText,   setInterimText]   = useState('');    // live STT partial
  const [apiError,      setApiError]      = useState('');
  const [isDone,        setIsDone]        = useState(false); // 6 questions complete
  const [reprompt,      setReprompt]      = useState(false); // "didn't catch that" flag
  const [showComplete,  setShowComplete]  = useState(false); // completion overlay

  /* Text input fallback */
  const [inputText, setInputText] = useState('');
  const inputRef = useRef(null);

  /* ─────────────────────────────────────────────────────
     Webcam
  ───────────────────────────────────────────────────── */
  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamStatus('active');
    } catch {
      setCamStatus('denied');
    }
  }, []);

  const stopWebcam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /* ─────────────────────────────────────────────────────
     Speech Recognition — setup
  ───────────────────────────────────────────────────── */

  /**
   * Stop any active recognition session and cancel the silence timer.
   * Safe to call repeatedly.
   */
  const stopListening = useCallback((reason = 'manual') => {
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;

    if (recognitionRef.current) {
      /* Suppress the onend callback that would otherwise restart listening */
      recognitionRef.current._intentionallyStopped = true;
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
    }

    if (reason !== 'commit') {
      /* Only reset interims; keep finalTranscript for text-fallback edit */
      setInterimText('');
    }
    setListenState('idle');
  }, []);

  /**
   * Commit the accumulated final transcript as the user's answer:
   * stop recognition, send to Gemini.
   */
  const commitAnswer = useCallback(async (textOverride) => {
    stopListening('commit');
    setInterimText('');

    const text = (textOverride ?? finalTranscriptRef.current).trim();
    finalTranscriptRef.current = '';
    setListenState('sending');

    if (!text) return; // nothing to send

    await sendToGeminiRef.current(text);
    setListenState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopListening]);

  /**
   * Create and start a new SpeechRecognition session.
   * Calling this while already listening is a no-op.
   */
  const startListening = useCallback(() => {
    if (!SPEECH_SUPPORTED || isDone) return;
    if (listenState === 'listening') return;

    /* Reset accumulators */
    finalTranscriptRef.current = '';
    setInterimText('');
    setReprompt(false);

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const rec = new SpeechRecognition();
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = 'en-US';
    rec.maxAlternatives = 1;
    rec._intentionallyStopped = false;

    /* ── onresult: accumulate words + reset silence timer ── */
    rec.onresult = (event) => {
      let interim = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalChunk) {
        finalTranscriptRef.current += finalChunk;
      }

      /* Show live interim in subtitle bar */
      const liveText = (finalTranscriptRef.current + interim).trim();
      setInterimText(liveText);
      if (liveText) setSubtitle('');  // clear interviewer subtitle while user speaks

      /* Reset the silence timer on every new word */
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        /* 2 s passed without any new words → commit */
        commitAnswer();
      }, SILENCE_TIMEOUT_MS);
    };

    /* ── no-speech: reprompt the user ── */
    rec.onnomatch = rec.onspeechend = () => {
      /* Let the silence timer handle the commit path naturally */
    };
    rec.onerror = (event) => {
      if (event.error === 'no-speech') {
        clearTimeout(silenceTimerRef.current);
        setInterimText('');
        setReprompt(true);
        setListenState('idle');
        finalTranscriptRef.current = '';
        /* Auto-restart after 1 s to give the user a chance */
        setTimeout(() => {
          setReprompt(false);
          startListeningRef.current();
        }, 1000);
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setListenState('idle');
        setReprompt(false);
      } else {
        /* Network / aborted — silently reset */
        setListenState('idle');
      }
    };

    /* ── onend: restart only if not intentionally stopped ── */
    rec.onend = () => {
      if (rec._intentionallyStopped) return;
      /* Browser stopped on its own (e.g. timeout) — restart if still listening */
      if (listenStateRef.current === 'listening') {
        try { rec.start(); } catch { /* may throw if already started */ }
      }
    };

    recognitionRef.current = rec;
    setListenState('listening');

    try {
      rec.start();
    } catch {
      setListenState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, commitAnswer]);

  /* Stable refs so callbacks inside recognition events can call the latest version */
  const startListeningRef   = useRef(startListening);
  const sendToGeminiRef     = useRef(null);          // filled below
  const listenStateRef      = useRef(listenState);

  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);
  useEffect(() => { listenStateRef.current    = listenState;    }, [listenState]);

  /* ─────────────────────────────────────────────────────
     Gemini — send and handle reply
  ───────────────────────────────────────────────────── */
  const sendToGemini = useCallback(async (userText) => {
    setIsLoading(true);
    setApiError('');
    setReprompt(false);

    try {
      const reply = await askGemini({
        history:     geminiHistoryRef.current,
        userMessage: userText,
        resumeText,
        role,
      });

      /* Append to Gemini history */
      geminiHistoryRef.current = [
        ...geminiHistoryRef.current,
        { role: 'user',  parts: [{ text: userText }] },
        { role: 'model', parts: [{ text: reply    }] },
      ];

      /* Update display transcript */
      if (userText !== FIRST_TURN_SENTINEL) addTurn('user', userText);
      addTurn('mentor', reply);
      setSubtitle(reply);
      setInterimText('');

      /* Interview complete? (check before speaking so isDone is set first) */
      const doneWords = [
        'interview is complete', 'interview is now complete',
        'that concludes', 'that wraps up', 'we have covered all',
        'all 6 questions', 'all six questions',
      ];
      const sessionEnded = doneWords.some((p) => reply.toLowerCase().includes(p));
      if (sessionEnded) setIsDone(true);

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

    } catch (err) {
      setApiError(err.message || 'Gemini request failed.');
      setSubtitle('');
    } finally {
      setIsLoading(false);
    }
  }, [resumeText, role, avatar, addTurn]);

  /* Keep the stable ref current */
  useEffect(() => { sendToGeminiRef.current = sendToGemini; }, [sendToGemini]);

  /* ─────────────────────────────────────────────────────
     Auto-start listening when interviewer finishes speaking
  ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isSpeaking && shouldAutoStartRef.current && !isDone && !isLoading) {
      shouldAutoStartRef.current = false;
      /* Small delay so the last word of the question has "settled" */
      const t = setTimeout(() => startListeningRef.current(), 300);
      return () => clearTimeout(t);
    }
    if (isSpeaking) {
      /* Mark that we should start listening once speaking finishes */
      shouldAutoStartRef.current = true;
      /* Stop any current recognition while interviewer is speaking */
      stopListening('interviewer-speaking');
    }
  }, [isSpeaking, isDone, isLoading, stopListening]);

  /* ─────────────────────────────────────────────────────
     Mount effect
  ───────────────────────────────────────────────────── */
  useEffect(() => {
    startWebcam().then(() => {
      // videoRef.current now has a live srcObject — start face tracking
      startTracking(videoRef.current);
    });
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    if (!seededRef.current) {
      seededRef.current = true;
      sendToGeminiRef.current(FIRST_TURN_SENTINEL);
    }

    return () => {
      clearInterval(timerRef.current);
      stopTracking();
      stopWebcam();
      stopListening('unmount');
      cancelSpeech();               // stop TTS if component unmounts mid-sentence
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─────────────────────────────────────────────────────
     Manual mic toggle
  ───────────────────────────────────────────────────── */
  function handleMicToggle() {
    if (isLoading || isSpeaking || isDone) return;

    if (listenState === 'listening') {
      /* User manually stops — commit whatever we have */
      commitAnswer();
    } else {
      startListening();
    }
  }

  /* ─────────────────────────────────────────────────────
     Text input fallback
  ───────────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || isLoading || isDone) return;
    /* Stop recognition if running — user chose to type instead */
    stopListening('manual');
    setInputText('');
    await sendToGemini(text);
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  /* ─────────────────────────────────────────────────────
     End session
  ───────────────────────────────────────────────────── */
  /**
   * End session — stop all I/O, preserve transcript in context, go to /report.
   * Transcript is intentionally NOT cleared here; ReportPage reads it.
   * Call clearTranscript() only when a brand-new session starts on SetupPage.
   */
  function handleEndSession() {
    clearInterval(timerRef.current);
    cancelSpeech();
    stopListening('end');
    stopWebcam();
    navigate('/report');
  }

  /* ─────────────────────────────────────────────────────
     Derived display values
  ───────────────────────────────────────────────────── */
  const isListening     = listenState === 'listening';
  const isMicBusy       = isLoading || isSpeaking;

  /* What the subtitle bar should show */
  const subtitleContent = (() => {
    if (apiError)                      return { type: 'error',    text: apiError };
    if (reprompt)                      return { type: 'reprompt', text: "Sorry, I didn't catch that. Could you repeat your answer?" };
    if (interimText)                   return { type: 'interim',  text: interimText };
    if (isLoading && !subtitle)        return { type: 'loading',  text: 'Preparing your first question…' };
    if (subtitle)                      return { type: 'text',     text: subtitle };
    if (isListening)                   return { type: 'prompt',   text: 'Listening… speak your answer' };
    return { type: 'placeholder',       text: 'Subtitles will appear here…' };
  })();

  /* Mic pill label on webcam tile */
  const micPillActive = isListening;

  /* ─────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────── */
  return (
    <div className="iv-root">

      {/* ══════════════════════════════════════════════
          Interview-complete transition overlay
          Shown when Gemini signals the 6 questions are done.
          Fades in over the call screen, then the page navigates to /report.
      ══════════════════════════════════════════════ */}
      {showComplete && (
        <div className="iv-complete-overlay" role="status" aria-live="assertive">
          {/* Animated checkmark ring */}
          <div className="iv-complete-ring" aria-hidden="true">
            <svg viewBox="0 0 52 52" fill="none">
              <circle className="iv-complete-ring__track" cx="26" cy="26" r="22" stroke="rgba(0,229,255,0.15)" strokeWidth="3"/>
              <circle className="iv-complete-ring__progress" cx="26" cy="26" r="22" stroke="#00e5ff" strokeWidth="3"
                strokeDasharray="138" strokeDashoffset="138" strokeLinecap="round"/>
              <path className="iv-complete-ring__check" d="M14 26l8 8 16-16"
                stroke="#00e5ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                fill="none"/>
            </svg>
          </div>
          <h2 className="iv-complete-title">Interview Complete</h2>
          <p className="iv-complete-sub">Preparing your report…</p>
          {/* Loading dots */}
          <span className="iv-complete-dots" aria-hidden="true">
            <span /><span /><span />
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          HUD
      ══════════════════════════════════════════════ */}
      <header className="iv-hud">
        <div className="iv-hud__left">
          <span className="iv-role-pill">{role}</span>
        </div>
        <div className="iv-hud__centre">
          <span className="iv-wordmark">⬡ MockMentor</span>
        </div>
        <div className="iv-hud__right">
          <span className="iv-timer" aria-label="Session duration">{formatTime(elapsed)}</span>
          {/* Voice output indicator — shown only when TTS is supported */}
          {TTS_SUPPORTED && (
            <span
              className={`iv-tts-badge${isSpeaking ? ' iv-tts-badge--active' : ''}`}
              aria-label={isSpeaking ? 'Voice output active' : 'Voice output ready'}
              title="Voice output"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              {isSpeaking ? 'SPEAKING' : 'VOICE'}
            </span>
          )}
          <span className="iv-live-badge">
            <span className="iv-live-badge__dot" aria-hidden="true" />
            LIVE
          </span>
        </div>
      </header>

      {/* ══════════════════════════════════════════════
          Stage
      ══════════════════════════════════════════════ */}
      <main className="iv-stage">

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

          <div className="iv-tile__hud">
            <span className="iv-tile__name">{interviewer.name}</span>
            <span className="iv-tile__tag">{interviewer.tag}</span>
          </div>

          <div className="iv-tile__status" aria-live="polite">
            {isLoading ? (
              <span className="iv-dots" aria-label="Thinking"><span /><span /><span /></span>
            ) : isSpeaking ? (
              <span className="iv-soundwave" aria-label="Speaking"><span /><span /><span /><span /><span /></span>
            ) : (
              <span className="iv-idle-dot" aria-label="Listening" />
            )}
          </div>

          <div className="iv-scanline" aria-hidden="true" />
        </div>

        {/* Webcam tile */}
        <div
          className={[
            'iv-tile iv-tile--user',
            isListening ? 'iv-tile--user-listening' : '',
          ].join(' ')}
          aria-label="Your video"
        >
          {camStatus === 'denied' ? (
            <div className="iv-cam-fallback">
              <div className="iv-cam-fallback__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 2l20 20M10.5 6H19a2 2 0 0 1 2 2v9M5 5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11"/>
                  <path d="m15 10-3 3m0 0-3 3M12 7v.01"/>
                </svg>
              </div>
              <p className="iv-cam-fallback__msg">Camera access denied</p>
              <button type="button" className="btn btn-outline iv-cam-retry" onClick={startWebcam}>Retry</button>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="iv-webcam" autoPlay playsInline muted aria-label="Your camera preview" />
              {/* Status pills */}
              <div className="iv-cam-pills" aria-hidden="true">
                <span className="iv-cam-pill iv-cam-pill--cam">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z"/></svg>
                  CAM
                </span>
                {/* Mic pill — updates to reflect real listen state */}
                <span className={`iv-cam-pill iv-cam-pill--mic${micPillActive ? ' iv-cam-pill--active' : ' iv-cam-pill--muted'}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 10a6.5 6.5 0 0 1-13 0H4a8 8 0 0 0 7 7.93V21h2v-2.07A8 8 0 0 0 20 11h-1.5z"/>
                  </svg>
                  {micPillActive ? 'MIC ON' : 'MIC OFF'}
                </span>
              </div>
              {/* Listening ring — glows around webcam tile border when STT active */}
              {isListening && (
                <div className="iv-listen-ring" aria-hidden="true" />
              )}
              {camStatus === 'idle' && <div className="iv-cam-shimmer" aria-hidden="true" />}
            </>
          )}

          <div className="iv-tile__hud iv-tile__hud--user">
            <span className="iv-tile__name">You</span>
          </div>

          <div className="iv-corner iv-corner--tl" aria-hidden="true" />
          <div className="iv-corner iv-corner--tr" aria-hidden="true" />
          <div className="iv-corner iv-corner--bl" aria-hidden="true" />
          <div className="iv-corner iv-corner--br" aria-hidden="true" />
        </div>
      </main>

      {/* ══════════════════════════════════════════════
          Bottom bar
      ══════════════════════════════════════════════ */}
      <footer className="iv-bottom">

        {/* Subtitle bar */}
        <div
          className={[
            'iv-subtitles',
            interimText ? 'iv-subtitles--interim' : '',
          ].join(' ')}
          aria-live="polite"
          aria-label="Subtitles"
        >
          {subtitleContent.type === 'error' && (
            <p className="iv-subtitles__error">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{flexShrink:0}}>
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd"/>
              </svg>
              {subtitleContent.text}
            </p>
          )}
          {subtitleContent.type === 'reprompt' && (
            <p className="iv-subtitles__reprompt">{subtitleContent.text}</p>
          )}
          {subtitleContent.type === 'interim' && (
            <p className="iv-subtitles__interim" aria-label="You are saying">
              {subtitleContent.text}
              <span className="iv-subtitles__cursor" aria-hidden="true" />
            </p>
          )}
          {subtitleContent.type === 'loading' && (
            <p className="iv-subtitles__loading">
              <span className="iv-subtitles__loading-dots"><span /><span /><span /></span>
              {subtitleContent.text}
            </p>
          )}
          {subtitleContent.type === 'text' && (
            <p className="iv-subtitles__text">{subtitleContent.text}</p>
          )}
          {subtitleContent.type === 'prompt' && (
            <p className="iv-subtitles__listen-prompt">
              <span className="iv-listen-pulse" aria-hidden="true" />
              {subtitleContent.text}
            </p>
          )}
          {subtitleContent.type === 'placeholder' && (
            <p className="iv-subtitles__placeholder">{subtitleContent.text}</p>
          )}
        </div>

        {/* Input row — mic button + text input + send */}
        {!isDone && (
          <form className="iv-input-row" onSubmit={handleSubmit} aria-label="Answer input">

            {/* Mic toggle button */}
            {SPEECH_SUPPORTED && (
              <button
                type="button"
                className={[
                  'iv-mic-btn',
                  isListening  ? 'iv-mic-btn--active'   : '',
                  isMicBusy    ? 'iv-mic-btn--busy'     : '',
                ].join(' ')}
                onClick={handleMicToggle}
                disabled={isMicBusy}
                aria-label={isListening ? 'Stop listening' : 'Start listening'}
                title={isListening ? 'Click to send your answer' : 'Click to speak'}
              >
                {isListening ? (
                  /* Live mic bars */
                  <span className="iv-mic-bars" aria-hidden="true">
                    <span /><span /><span /><span /><span />
                  </span>
                ) : (
                  /* Static mic icon */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 10a6.5 6.5 0 0 1-13 0H4a8 8 0 0 0 7 7.93V21h2v-2.07A8 8 0 0 0 20 11h-1.5z"/>
                  </svg>
                )}
                {/* Ripple ring when listening */}
                {isListening && <span className="iv-mic-ripple" aria-hidden="true" />}
              </button>
            )}

            {/* Text input */}
            <input
              ref={inputRef}
              type="text"
              className="iv-input"
              placeholder={
                isLoading   ? 'Waiting for interviewer…'
                : isSpeaking ? 'Interviewer is speaking…'
                : isListening ? 'Or type your answer here…'
                : 'Type your answer or use the mic…'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isSpeaking}
              autoComplete="off"
              aria-label="Your answer (text)"
            />

            {/* Send button */}
            <button
              type="submit"
              className="iv-send-btn"
              disabled={!inputText.trim() || isLoading || isSpeaking}
              aria-label="Send answer"
            >
              {isLoading ? (
                <span className="iv-trigger-spinner" aria-hidden="true" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              )}
            </button>
          </form>
        )}

        {/* Controls row */}
        <div className="iv-controls">
          {isDone && (
            <span className="iv-done-badge" aria-live="polite">✓ Interview complete</span>
          )}
          <button type="button" className="iv-end-btn" onClick={handleEndSession} aria-label="End interview">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
            End Interview
          </button>
        </div>
      </footer>
    </div>
  );
}
