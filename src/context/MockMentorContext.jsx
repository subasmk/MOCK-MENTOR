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

const DEMO_TRANSCRIPT = [
  ['mentor','Hi, I am Priya. Tell me about yourself and a project you are proud of.'],
  ['user','Um, I am a final-year CS student. I built a campus bus tracker in Flask, you know, and a to-do app in React.'],
  ['mentor','Nice. What was the hardest bug in the bus tracker and how did you fix it?'],
  ['user','The GPS updates arrived out of order, so I added timestamps and ignored older ones. It was basically an ordering problem.'],
  ['mentor','How would you explain a database index to a non-technical friend?'],
  ['user','Like the index of a book, so you jump to the page instead of reading everything. Like, it makes reads fast but writes a bit slower.'],
].map(([speaker,text],i)=>({id:i,speaker,text,timestamp:new Date(Date.now()-(6-i)*40000).toISOString()}));

/* ── Context object ── */
const MockMentorContext = createContext(null);

/* ── Provider ── */
export function MockMentorProvider({ children }) {
  const demo = typeof location!=='undefined' && new URLSearchParams(location.search).has('demo');
  const [resumeText, setResumeText]   = useState(demo ? 'SAMPLE RESUME (demo only). Alex Sample, final-year CS student. Projects: a to-do web app (React), a campus bus tracker (Python, Flask). Skills: Python, Java, React.' : '');
  const [role, setRole]               = useState(demo ? 'SDE' : '');
  const [avatar, setAvatar]           = useState(demo ? 'female' : '');
  const [transcript, setTranscript]   = useState(demo ? DEMO_TRANSCRIPT : []);

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
