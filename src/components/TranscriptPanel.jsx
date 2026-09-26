/**
 * TranscriptPanel.jsx
 *
 * Scrollable transcript viewer used on the InterviewPage.
 * Renders each turn in the interview as a chat bubble aligned
 * left (mentor) or right (user).
 *
 * Props:
 *   transcript  {Array<{ id, speaker: 'user'|'mentor', text: string }>}
 */
import React, { useEffect, useRef } from 'react';
import './TranscriptPanel.css';

export default function TranscriptPanel({ transcript }) {
  const bottomRef = useRef(null);

  /* Auto-scroll to the newest turn whenever the transcript grows */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  if (transcript.length === 0) {
    return (
      <div className="transcript transcript--empty">
        <span className="transcript__empty-hint">
          Your conversation will appear here…
        </span>
      </div>
    );
  }

  return (
    <div className="transcript" role="log" aria-live="polite" aria-label="Interview transcript">
      {transcript.map((turn) => (
        <div
          key={turn.id}
          className={`transcript__turn transcript__turn--${turn.speaker}`}
        >
          {/* Speaker label */}
          <span className="transcript__speaker" aria-hidden="true">
            {turn.speaker === 'mentor' ? '🤖 Mentor' : '🧑 You'}
          </span>
          {/* Message bubble */}
          <p className="transcript__bubble">{turn.text}</p>
        </div>
      ))}
      {/* Invisible anchor for auto-scroll */}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
