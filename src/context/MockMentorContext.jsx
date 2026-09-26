/**
 * MockMentorContext.jsx
 *
 * Shared application state passed down via React Context.
 * Holds:
 *  - resumeText   : raw résumé text
 *  - role         : target job role string
 *  - avatar       : chosen interviewer id ('male' | 'female' | 'robot')
 *  - transcript   : array of turn objects:
 *      { id, speaker: 'user'|'mentor', text, timestamp: ISO string }
 *
 * All setters are exposed so any descendant can update state without prop-drilling.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

/* ── Context object ── */
const MockMentorContext = createContext(null);

/* ── Provider ── */
export function MockMentorProvider({ children }) {
  const [resumeText, setResumeText]   = useState('');
  const [role, setRole]               = useState('');
  const [avatar, setAvatar]           = useState('');
  const [transcript, setTranscript]   = useState([]);

  /**
   * Append a single turn to the interview transcript.
   * Each turn carries a wall-clock timestamp so the report can display timing.
   * @param {'user'|'mentor'} speaker
   * @param {string} text
   */
  const addTurn = useCallback((speaker, text) => {
    setTranscript((prev) => [
      ...prev,
      {
        id:        Date.now() + Math.random(),
        speaker,
        text,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  /** Clear the transcript (e.g. when starting a fresh session). */
  const clearTranscript = useCallback(() => setTranscript([]), []);

  const value = {
    /* state */
    resumeText,
    role,
    avatar,
    transcript,
    /* setters */
    setResumeText,
    setRole,
    setAvatar,
    setTranscript,
    /* helpers */
    addTurn,
    clearTranscript,
  };

  return (
    <MockMentorContext.Provider value={value}>
      {children}
    </MockMentorContext.Provider>
  );
}

/* ── Hook ── */
/**
 * useMockMentor()
 * Convenience hook — throws if used outside <MockMentorProvider>.
 */
export function useMockMentor() {
  const ctx = useContext(MockMentorContext);
  if (!ctx) {
    throw new Error('useMockMentor must be used inside <MockMentorProvider>');
  }
  return ctx;
}

export default MockMentorContext;
