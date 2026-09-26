/**
 * MockMentorContext.jsx
 *
 * Shared application state passed down via React Context.
 * Holds:
 *  - resumeText   : raw text of the user's uploaded / pasted résumé
 *  - role         : target job role string (e.g. "Senior Frontend Engineer")
 *  - avatar       : filename of the chosen interviewer avatar (e.g. "mentor-aria.png")
 *  - transcript   : array of { speaker: 'user'|'mentor', text: string } turn objects
 *
 * All setters are exposed so any descendant component can update state
 * without prop-drilling.
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
   * @param {'user'|'mentor'} speaker
   * @param {string} text
   */
  const addTurn = useCallback((speaker, text) => {
    setTranscript((prev) => [...prev, { speaker, text, id: Date.now() + Math.random() }]);
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
