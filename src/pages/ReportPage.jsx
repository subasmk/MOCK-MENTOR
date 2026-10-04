/**
 * ReportPage.jsx  —  /report
 *
 * Futuristic game-results screen that surfaces after a monitoring/interview session.
 *
 * Data sources (both optional — page degrades gracefully if either is absent):
 *   A. MockMentorContext  — interview transcript + role + avatar
 *   B. localStorage       — latest vision session (mm_vision_sessions)
 *
 * Sections (top → bottom):
 *   1. Hero banner        — SESSION COMPLETE, duration, date
 *   2. Transcript panel   — scrollable holographic Q&A
 *   3. Answer Feedback    — per-answer AI ratings (1-10) + improvement tips
 *   4. Speech Analysis    — filler-word counts + speaking pace (WPM)
 *   5. Score rings        — Confidence · Eye Contact · Non-Fearful · Face Presence
 *   6. Expression bars    — horizontal breakdown of the four categories
 *   7. Session stats      — compact data grid
 *   8. Footer nav         — Start New Session · Back to Dashboard
 */

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate }        from 'react-router-dom';
import { useMockMentor }      from '../context/MockMentorContext';
import { getSavedSessions }   from '../tracking/sessionManager';
import { rateTranscript, evaluateTranscript } from '../services/gemini';
import './ReportPage.css';

/* ─────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────── */
const INTERVIEWER_MAP = {
  male:   { name: 'Alex Turner', tag: 'Technical Lead' },
  female: { name: 'Priya Nair',  tag: 'Hiring Manager' },
  robot:  { name: 'ARIA-7',      tag: 'AI Evaluator'   },
};

/* ─────────────────────────────────────────────────────────
   Pure helpers
───────────────────────────────────────────────────────── */
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtSecs(totalSecs) {
  const s   = Math.floor(totalSecs ?? 0);
  const m   = Math.floor(s / 60);
  const rem = String(s % 60).padStart(2, '0');
  return m > 0 ? `${m}m ${rem}s` : `${s}s`;
}

function fmtMM(totalSecs) {
  const s = Math.floor(totalSecs ?? 0);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function computeConfidence(eyeContactPct, expressionCounts) {
  const { neutral = 0, happy = 0, fearful = 0, surprised = 0 } = expressionCounts ?? {};
  const total = neutral + happy + fearful + surprised;
  if (total === 0) return null;
  const eyeScore        = Math.min(100, Math.max(0, eyeContactPct ?? 0));
  const nonFearfulPct   = ((neutral + happy + surprised) / total) * 100;
  const overall         = eyeScore * 0.5 + nonFearfulPct * 0.5;
  return {
    overall:         +Math.min(100, Math.max(0, overall)).toFixed(1),
    eyeScore:        +eyeScore.toFixed(1),
    nonFearfulScore: +nonFearfulPct.toFixed(1),
  };
}

/* ─────────────────────────────────────────────────────────
   Speech analysis helpers
───────────────────────────────────────────────────────── */

/**
 * List of filler tokens to detect (lower-case, word-boundary matched).
 * "you know" is a two-word phrase so we match it before splitting.
 */
const FILLER_PHRASES = ['you know'];
const FILLER_WORDS   = ['um', 'uh', 'like'];

/**
 * Count filler occurrences in a single string of text.
 * Returns { um, uh, like, youKnow, total }.
 */
function countFillers(text) {
  const lower = text.toLowerCase();
  // Count "you know" first (phrase match)
  const youKnow = (lower.match(/\byou know\b/g) || []).length;
  // Remove "you know" so "know" isn't double-counted in single-word step
  const stripped = lower.replace(/\byou know\b/g, '');
  const um   = (stripped.match(/\bum\b/g)   || []).length;
  const uh   = (stripped.match(/\buh\b/g)   || []).length;
  const like = (stripped.match(/\blike\b/g) || []).length;
  return { um, uh, like, youKnow, total: um + uh + like + youKnow };
}

/**
 * Count words in a string (splits on whitespace, filters empties).
 */
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Analyse only the user turns in the transcript.
 *
 * Returns:
 *  {
 *    fillers:      { um, uh, like, youKnow, total }
 *    totalWords:   number   — all words spoken by user
 *    durationSecs: number   — wall-clock span of user speech (approx.)
 *    wpm:          number|null  — words per minute (null if < 2 turns)
 *    fillerRate:   number   — fillers per 100 words (0 if no words)
 *  }
 */
function analyseSpeech(transcript) {
  const userTurns = transcript.filter((t) => t.speaker === 'user' && t.text?.trim());

  if (userTurns.length === 0) {
    return { fillers: { um: 0, uh: 0, like: 0, youKnow: 0, total: 0 },
             totalWords: 0, durationSecs: 0, wpm: null, fillerRate: 0 };
  }

  // Aggregate filler counts and word counts across all user turns
  const fillers = { um: 0, uh: 0, like: 0, youKnow: 0, total: 0 };
  let totalWords = 0;

  for (const turn of userTurns) {
    const f = countFillers(turn.text);
    fillers.um      += f.um;
    fillers.uh      += f.uh;
    fillers.like    += f.like;
    fillers.youKnow += f.youKnow;
    fillers.total   += f.total;
    totalWords      += wordCount(turn.text);
  }

  // WPM: total user words / total elapsed time of the whole session in minutes.
  // We use the first and last user-turn timestamps as the speaking window.
  // If there's only one user turn we can't compute a meaningful rate.
  let wpm = null;
  let durationSecs = 0;
  if (userTurns.length >= 2) {
    const first = new Date(userTurns[0].timestamp).getTime();
    const last  = new Date(userTurns[userTurns.length - 1].timestamp).getTime();
    durationSecs = Math.max(1, (last - first) / 1000);
    wpm = Math.round((totalWords / durationSecs) * 60);
  }

  const fillerRate = totalWords > 0
    ? +((fillers.total / totalWords) * 100).toFixed(1)
    : 0;

  return { fillers, totalWords, durationSecs, wpm, fillerRate };
}

/**
 * Pair up mentor-questions with the following user-answers from the raw
 * transcript array.  Returns only pairs where both halves are non-empty.
 *
 * @param {Array<{speaker:'user'|'mentor', text:string}>} transcript
 * @returns {Array<{question:string, answer:string}>}
 */
function buildQAPairs(transcript) {
  const pairs = [];
  for (let i = 0; i < transcript.length - 1; i++) {
    const curr = transcript[i];
    const next = transcript[i + 1];
    if (curr.speaker === 'mentor' && next.speaker === 'user') {
      const q = curr.text?.trim();
      const a = next.text?.trim();
      if (q && a) pairs.push({ question: q, answer: a });
    }
  }
  return pairs;
}

function facePresencePct(stats) {
  const { expressionCounts, noFaceCount } = stats ?? {};
  const { neutral = 0, happy = 0, fearful = 0, surprised = 0 } = expressionCounts ?? {};
  const faceCount = neutral + happy + fearful + surprised;
  const total     = faceCount + (noFaceCount ?? 0);
  if (total === 0) return null;
  return +((faceCount / total) * 100).toFixed(1);
}

/* ─────────────────────────────────────────────────────────
   ScoreRing — animated SVG circular progress indicator
───────────────────────────────────────────────────────── */
function ScoreRing({ pct, label, sublabel, color = 'var(--color-accent)', size = 160 }) {
  const radius        = (size - 24) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled        = pct !== null ? Math.min(100, Math.max(0, pct)) : 0;
  const offset        = circumference - (filled / 100) * circumference;

  return (
    <div
      className="rp2-ring"
      style={{ '--ring-color': color, width: size, height: size }}
      aria-label={`${label}: ${pct !== null ? Math.round(pct) + '%' : 'no data'}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track ring */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="12"
        />
        {/* Glow duplicate (blurred, slightly wider) */}
        <circle
          className="rp2-ring__glow"
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{
            '--circ':   circumference,
            '--offset': offset,
            strokeDashoffset: offset,
            opacity: 0.25,
            filter: 'blur(4px)',
          }}
        />
        {/* Active arc */}
        <circle
          className="rp2-ring__arc"
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{
            '--circ':   circumference,
            '--offset': offset,
            strokeDashoffset: offset,
          }}
        />
      </svg>

      {/* Centre text */}
      <div className="rp2-ring__center">
        <span className="rp2-ring__pct">
          {pct !== null ? `${Math.round(pct)}%` : '--'}
        </span>
        <span className="rp2-ring__label">{label}</span>
        {sublabel && <span className="rp2-ring__sub">{sublabel}</span>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   StatRow — single label / value pair
───────────────────────────────────────────────────────── */
function StatRow({ label, value }) {
  return (
    <div className="rp2-stat-row">
      <span className="rp2-stat-row__label">{label}</span>
      <span className="rp2-stat-row__value">{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ExpressionBars — horizontal bar breakdown
───────────────────────────────────────────────────────── */
function ExpressionBars({ counts }) {
  const items = [
    { key: 'neutral',   label: 'Neutral',   color: 'var(--color-text-muted)' },
    { key: 'happy',     label: 'Happy',     color: 'var(--color-success)' },
    { key: 'surprised', label: 'Surprised', color: '#a78bfa' },
    { key: 'fearful',   label: 'Fearful',   color: 'var(--color-danger)' },
  ];
  const max = Math.max(1, ...items.map(({ key }) => counts[key] ?? 0));

  return (
    <div className="rp2-expr-bars">
      {items.map(({ key, label, color }) => {
        const count = counts[key] ?? 0;
        const pct   = (count / max) * 100;
        return (
          <div key={key} className="rp2-expr-bar-row">
            <span className="rp2-expr-bar-row__label">{label}</span>
            <div className="rp2-expr-bar-row__track">
              <div
                className="rp2-expr-bar-row__fill"
                style={{ '--bar-pct': `${pct}%`, '--bar-color': color }}
              />
            </div>
            <span className="rp2-expr-bar-row__count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   TranscriptPanel — scrollable holographic Q&A
───────────────────────────────────────────────────────── */
function TranscriptPanel({ transcript, interviewer }) {
  if (!transcript || transcript.length === 0) {
    return (
      <div className="rp2-transcript rp2-transcript--empty">
        <div className="rp2-transcript__empty-inner">
          <span className="rp2-transcript__empty-icon" aria-hidden="true">◎</span>
          <p className="rp2-transcript__empty-msg">No transcript recorded for this session.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rp2-transcript" role="log" aria-label="Session transcript">
      {/* Scanline fade at top */}
      <div className="rp2-transcript__fade-top" aria-hidden="true" />
      <div className="rp2-transcript__inner">
        {transcript.map((turn) => {
          const isMentor = turn.speaker === 'mentor';
          return (
            <div
              key={turn.id ?? turn.timestamp}
              className={`rp2-turn rp2-turn--${isMentor ? 'ai' : 'user'}`}
            >
              <div className="rp2-turn__meta">
                <span className="rp2-turn__ts">{fmtTime(turn.timestamp)}</span>
                <span className="rp2-turn__speaker">
                  {isMentor ? (interviewer?.name ?? 'AI') : 'YOU'}
                </span>
              </div>
              <p className="rp2-turn__text">{turn.text}</p>
            </div>
          );
        })}
      </div>
      {/* Scanline fade at bottom */}
      <div className="rp2-transcript__fade-bottom" aria-hidden="true" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   AnswerFeedback — per-answer rating card
───────────────────────────────────────────────────────── */

/** Colour ramp: red → amber → green as score rises */
function scoreColor(score) {
  if (score >= 8) return 'var(--color-success)';
  if (score >= 5) return '#f59e0b';
  return 'var(--color-danger)';
}

/**
 * A single Q&A pair with its AI-generated score and tip.
 */
function AnswerCard({ index, question, answer, rating }) {
  const color = rating ? scoreColor(rating.score) : 'var(--color-text-dim)';
  return (
    <div className="rp2-answer-card" style={{ '--answer-color': color }}>
      {/* Index badge */}
      <div className="rp2-answer-card__index" aria-hidden="true">
        Q{index + 1}
      </div>

      <div className="rp2-answer-card__body">
        {/* Question */}
        <p className="rp2-answer-card__question">{question}</p>

        {/* Answer */}
        <p className="rp2-answer-card__answer">{answer}</p>

        {/* Rating row */}
        {rating && (
          <div className="rp2-answer-card__rating">
            {/* Score dial */}
            <div className="rp2-answer-card__score" style={{ color }}>
              <span className="rp2-answer-card__score-num">{rating.score}</span>
              <span className="rp2-answer-card__score-denom">/10</span>
            </div>

            {/* Mini score bar */}
            <div className="rp2-answer-card__bar-track" aria-hidden="true">
              <div
                className="rp2-answer-card__bar-fill"
                style={{
                  '--score-pct': `${rating.score * 10}%`,
                  '--score-color': color,
                }}
              />
            </div>

            {/* Tip */}
            <p className="rp2-answer-card__tip">
              <span className="rp2-answer-card__tip-icon" aria-hidden="true">↗</span>
              {rating.tip}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Full feedback section: loading skeleton → error state → list of AnswerCards.
 */
function FeedbackSection({ pairs, ratings, status, error }) {
  if (pairs.length === 0) return null;

  return (
    <section className="rp2-section" aria-labelledby="rp2-feedback-heading">
      <SectionHead
        icon="★"
        title="Answer Ratings"
        id="rp2-feedback-heading"
        badge={
          status === 'done'
            ? `avg ${(ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(1)}/10`
            : null
        }
      />

      {/* Loading skeleton */}
      {status === 'loading' && (
        <div className="rp2-feedback-loading" aria-label="Analysing answers…">
          <span className="rp2-feedback-loading__dot" />
          <span className="rp2-feedback-loading__dot" />
          <span className="rp2-feedback-loading__dot" />
          <span className="rp2-feedback-loading__text">
            Analysing your answers with AI…
          </span>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="rp2-feedback-error" role="alert">
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}

      {/* Cards */}
      {status === 'done' && (
        <div className="rp2-answer-list">
          {pairs.map((pair, i) => (
            <AnswerCard
              key={i}
              index={i}
              question={pair.question}
              answer={pair.answer}
              rating={ratings.find((r) => r.index === i) ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   CommEvalSection — 4-dimension communication evaluation
───────────────────────────────────────────────────────── */

/**
 * Metadata for the four evaluation dimensions — label, icon char, accent colour.
 */
const EVAL_DIMENSIONS = [
  {
    key:    'grammarClarity',
    label:  'Grammar & Clarity',
    icon:   'Aa',
    color:  'var(--color-accent)',
  },
  {
    key:    'answerStructure',
    label:  'Answer Structure',
    icon:   '≡',
    color:  '#a78bfa',
  },
  {
    key:    'relevance',
    label:  'Relevance',
    icon:   '◎',
    color:  'var(--color-glow-teal)',
  },
  {
    key:    'professionalTone',
    label:  'Professional Tone',
    icon:   '◈',
    color:  'var(--color-success)',
  },
];

/** Colour ramp shared with the answer-card score colour */
function evalScoreColor(score) {
  if (score >= 8) return 'var(--color-success)';
  if (score >= 5) return '#f59e0b';
  return 'var(--color-danger)';
}

/**
 * Single evaluation dimension card — score ring + reason line.
 */
function EvalDimCard({ label, icon, accentColor, score, reason }) {
  const scoreColor = evalScoreColor(score);
  const radius     = 44;
  const circ       = 2 * Math.PI * radius;
  const offset     = circ - (score / 10) * circ;

  return (
    <div className="rp2-eval-card" style={{ '--eval-accent': accentColor }}>
      {/* Mini ring */}
      <div className="rp2-eval-ring" aria-hidden="true">
        <svg width="108" height="108" viewBox="0 0 108 108"
             style={{ transform: 'rotate(-90deg)' }}>
          {/* track */}
          <circle cx="54" cy="54" r={radius} fill="none"
                  stroke="rgba(255,255,255,0.05)" strokeWidth="9" />
          {/* glow */}
          <circle cx="54" cy="54" r={radius} fill="none"
                  stroke={scoreColor} strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={circ}
                  className="rp2-eval-ring__glow"
                  style={{ '--circ': circ, '--offset': offset,
                           strokeDashoffset: offset, opacity: 0.22,
                           filter: 'blur(3px)' }} />
          {/* arc */}
          <circle cx="54" cy="54" r={radius} fill="none"
                  stroke={scoreColor} strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={circ}
                  className="rp2-eval-ring__arc"
                  style={{ '--circ': circ, '--offset': offset,
                           strokeDashoffset: offset }} />
        </svg>
        {/* Centre */}
        <div className="rp2-eval-ring__center">
          <span className="rp2-eval-ring__score" style={{ color: scoreColor }}>
            {score}
          </span>
          <span className="rp2-eval-ring__denom">/10</span>
        </div>
      </div>

      {/* Label + icon */}
      <div className="rp2-eval-card__meta">
        <span className="rp2-eval-card__icon" style={{ color: accentColor }}
              aria-hidden="true">{icon}</span>
        <p className="rp2-eval-card__label">{label}</p>
      </div>

      {/* Reason */}
      <p className="rp2-eval-card__reason">{reason}</p>
    </div>
  );
}

/**
 * Full section: loading state → error → 4 evaluation cards in a row.
 */
function CommEvalSection({ pairs, evaluation, status, error }) {
  if (pairs.length === 0) return null;

  /* Compute overall average once ratings are available */
  const avg = evaluation
    ? +(Object.values(evaluation).reduce((s, d) => s + d.score, 0) / 4).toFixed(1)
    : null;

  return (
    <section className="rp2-section" aria-labelledby="rp2-eval-heading">
      <SectionHead
        icon="◆"
        title="Communication Evaluation"
        id="rp2-eval-heading"
        badge={avg !== null ? `avg ${avg}/10` : null}
      />

      {status === 'loading' && (
        <div className="rp2-feedback-loading" aria-label="Evaluating communication…">
          <span className="rp2-feedback-loading__dot" />
          <span className="rp2-feedback-loading__dot" />
          <span className="rp2-feedback-loading__dot" />
          <span className="rp2-feedback-loading__text">
            Evaluating communication skills…
          </span>
        </div>
      )}

      {status === 'error' && (
        <div className="rp2-feedback-error" role="alert">
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}

      {status === 'done' && evaluation && (
        <div className="rp2-eval-grid">
          {EVAL_DIMENSIONS.map(({ key, label, icon, color }) => (
            <EvalDimCard
              key={key}
              label={label}
              icon={icon}
              accentColor={color}
              score={evaluation[key].score}
              reason={evaluation[key].reason}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ImprovementSection({ pairs, evaluation, status, error }) {
  if (pairs.length === 0) return null;

  const priorities = evaluation
    ? EVAL_DIMENSIONS
        .map(({ key, label, color }) => ({ ...evaluation[key], key, label, color }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
    : [];

  return (
    <section className="rp2-section" aria-labelledby="rp2-improve-heading">
      <SectionHead
        icon="↗"
        title="What to Improve"
        id="rp2-improve-heading"
        badge={status === 'done' ? '3 lowest scores' : null}
      />

      {status === 'loading' && (
        <div className="rp2-feedback-loading" aria-label="Preparing improvement tips…">
          <span className="rp2-feedback-loading__dot" />
          <span className="rp2-feedback-loading__dot" />
          <span className="rp2-feedback-loading__dot" />
          <span className="rp2-feedback-loading__text">
            Finding your highest-impact improvements…
          </span>
        </div>
      )}

      {status === 'error' && (
        <div className="rp2-feedback-error" role="alert">
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}

      {status === 'done' && priorities.length > 0 && (
        <ol className="rp2-improve-list" aria-label="Three lowest-scoring communication areas">
          {priorities.map(({ key, label, score, tip, color }, index) => (
            <li
              className="rp2-improve-item"
              key={key}
              style={{ '--improve-accent': color }}
            >
              <span className="rp2-improve-item__number" aria-hidden="true">
                0{index + 1}
              </span>
              <div className="rp2-improve-item__content">
                <div className="rp2-improve-item__meta">
                  <span className="rp2-improve-item__dimension">{label}</span>
                  <span className="rp2-improve-item__score" style={{ color: evalScoreColor(score) }}>
                    {score}<span>/10</span>
                  </span>
                </div>
                <p className="rp2-improve-item__tip">{tip}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   SpeechStats — filler-word counts + WPM panel
───────────────────────────────────────────────────────── */

/**
 * WPM benchmark labels — typical interview speaking-pace ranges.
 * Conversational: 120-160 wpm. Fast: >180. Slow: <100.
 */
function wpmLabel(wpm) {
  if (wpm === null) return null;
  if (wpm < 90)  return { text: 'Very slow',  color: 'var(--color-danger)' };
  if (wpm < 120) return { text: 'Slow',        color: '#f59e0b' };
  if (wpm <= 160) return { text: 'Good pace',  color: 'var(--color-success)' };
  if (wpm <= 185) return { text: 'Slightly fast', color: '#f59e0b' };
  return               { text: 'Too fast',    color: 'var(--color-danger)' };
}

/**
 * Filler-rate severity colour.
 * < 2 per 100 words = fine, 2-5 = moderate, > 5 = high.
 */
function fillerRateColor(rate) {
  if (rate <= 2)  return 'var(--color-success)';
  if (rate <= 5)  return '#f59e0b';
  return 'var(--color-danger)';
}

function SpeechStats({ speech }) {
  const { fillers, totalWords, wpm, fillerRate } = speech;
  const hasData = totalWords > 0;

  if (!hasData) return null;

  const pace    = wpmLabel(wpm);
  const frColor = fillerRateColor(fillerRate);

  const fillerItems = [
    { key: 'um',       label: 'Um',       count: fillers.um },
    { key: 'uh',       label: 'Uh',       count: fillers.uh },
    { key: 'like',     label: 'Like',     count: fillers.like },
    { key: 'youKnow',  label: 'You know', count: fillers.youKnow },
  ];
  const maxFiller = Math.max(1, ...fillerItems.map((f) => f.count));

  return (
    <section className="rp2-section" aria-labelledby="rp2-speech-heading">
      <SectionHead
        icon="◈"
        title="Speech Analysis"
        id="rp2-speech-heading"
        badge={`${totalWords} words`}
      />

      <div className="rp2-speech-grid">

        {/* ── WPM card ── */}
        <div className="rp2-speech-card rp2-speech-card--wpm">
          <p className="rp2-speech-card__eyebrow">Speaking Pace</p>
          <div className="rp2-speech-wpm">
            <span
              className="rp2-speech-wpm__num"
              style={{ color: pace?.color ?? 'var(--color-accent)' }}
            >
              {wpm !== null ? wpm : '—'}
            </span>
            <span className="rp2-speech-wpm__unit">wpm</span>
          </div>
          {pace && (
            <p className="rp2-speech-wpm__label" style={{ color: pace.color }}>
              {pace.text}
            </p>
          )}
          <p className="rp2-speech-wpm__hint">
            Ideal interview pace: 120–160 wpm
          </p>
        </div>

        {/* ── Filler card ── */}
        <div className="rp2-speech-card rp2-speech-card--fillers">
          <div className="rp2-speech-card__header">
            <p className="rp2-speech-card__eyebrow">Filler Words</p>
            <span
              className="rp2-speech-filler-total"
              style={{ color: frColor }}
            >
              {fillers.total}
              <span className="rp2-speech-filler-total__rate">
                ({fillerRate}%)
              </span>
            </span>
          </div>

          {/* Individual filler bars */}
          <div className="rp2-filler-bars">
            {fillerItems.map(({ key, label, count }) => (
              <div key={key} className="rp2-filler-bar-row">
                <span className="rp2-filler-bar-row__label">{label}</span>
                <div className="rp2-filler-bar-row__track">
                  <div
                    className="rp2-filler-bar-row__fill"
                    style={{
                      '--bar-pct':   `${(count / maxFiller) * 100}%`,
                      '--bar-color': count > 0 ? frColor : 'var(--color-border)',
                    }}
                  />
                </div>
                <span className="rp2-filler-bar-row__count">{count}</span>
              </div>
            ))}
          </div>

          <p className="rp2-speech-filler-hint">
            Aim for &lt; 2 fillers per 100 words spoken
          </p>
        </div>

      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   SectionHead — labelled section header
───────────────────────────────────────────────────────── */
function SectionHead({ icon, title, badge, id }) {
  return (
    <div className="rp2-section__head">
      <h2 className="rp2-section__title" id={id}>
        <span className="rp2-section__title-icon" aria-hidden="true">{icon}</span>
        {title}
      </h2>
      {badge != null && (
        <span className="rp2-section__badge">{badge}</span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Main page component
───────────────────────────────────────────────────────── */
import { loadCoachSummary, TIPS as COACH_TIPS } from '../tracking/coach';

function CoachSection({ data }) {
  if (!data || !data.samples) return null;
  const rows = Object.entries(data.issues || {}).filter(([, v]) => v.seconds > 0).sort((a, b) => b[1].seconds - a[1].seconds);
  return (
    <section className="rp2-section" aria-labelledby="rp2-coach-heading">
      <div className="rp2-section__head">
        <h2 className="rp2-section__title" id="rp2-coach-heading">Camera Coaching</h2>
        <span className="rp2-section__badge">{data.goodPct}% good posture</span>
      </div>
      <div className="rp2-section--card rp2-coach">
        <p className="rp2-coach__lead">Seconds the camera saw each issue during the interview ({data.samples}s tracked).</p>
        {rows.length === 0 ? <p className="rp2-coach__ok">No issues spotted. Nice and steady.</p> : (
          <ul className="rp2-coach__list">
            {rows.map(([k, v]) => (
              <li key={k} className="rp2-coach__row">
                <span className="rp2-coach__name">{(COACH_TIPS[k] || {}).text || k}</span>
                <span className="rp2-coach__sec">{v.seconds}s</span>
                <span className="rp2-coach__advice">{(COACH_TIPS[k] || {}).advice}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="rp2-coach__note">Estimated from camera landmarks, so treat it as a guide.</p>
      </div>
    </section>
  );
}

export default function ReportPage() {
  const navigate = useNavigate();
  const { transcript, role, avatar, clearTranscript } = useMockMentor();

  const interviewer = INTERVIEWER_MAP[avatar] ?? INTERVIEWER_MAP.male;

  /* Load the latest saved vision session from localStorage */
  const visionSession = useMemo(() => {
    const sessions = getSavedSessions();
    return sessions.length > 0 ? sessions[sessions.length - 1] : null;
  }, []);

  const vStats = visionSession?.stats ?? null;
  const coachData = useMemo(() => loadCoachSummary(), []);

  /* Derived metrics */
  const confidence = useMemo(() => {
    if (!vStats) return null;
    return computeConfidence(vStats.eyeContactPct, vStats.expressionCounts);
  }, [vStats]);

  const facePct = useMemo(() => (vStats ? facePresencePct(vStats) : null), [vStats]);

  /* Session timing */
  const sessionDate = visionSession?.startedAt ?? transcript?.[0]?.timestamp ?? null;
  const sessionDuration = vStats
    ? fmtMM(vStats.sessionDuration)
    : transcript.length >= 2
      ? fmtMM(
          (new Date(transcript[transcript.length - 1]?.timestamp) -
            new Date(transcript[0]?.timestamp)) /
            1000,
        )
      : null;

  /* Expression counts */
  const { neutral = 0, happy = 0, fearful = 0, surprised = 0 } =
    vStats?.expressionCounts ?? {};
  const totalExpressions = neutral + happy + fearful + surprised;
  const totalSamples     = totalExpressions + (vStats?.noFaceCount ?? 0);

  /* Gate flags */
  const hasVision     = vStats !== null;
  const hasTranscript = transcript && transcript.length > 0;
  const hasAnything   = hasVision || hasTranscript;

  /* ── Q&A pairs derived from transcript ── */
  const qaPairs = useMemo(() => buildQAPairs(transcript), [transcript]);

  /* ── Speech analysis (filler words + WPM) — pure client-side ── */
  const speech = useMemo(() => analyseSpeech(transcript), [transcript]);

  /* ── AI answer ratings ── */
  // 'idle' | 'loading' | 'done' | 'error'
  const [ratingStatus, setRatingStatus] = useState('idle');
  const [ratings,      setRatings]      = useState([]);
  const [ratingError,  setRatingError]  = useState('');

  const fetchRatings = useCallback(async () => {
    if (qaPairs.length === 0) return;
    setRatingStatus('loading');
    setRatingError('');
    try {
      const result = await rateTranscript({ role: role || 'General', turns: qaPairs });
      setRatings(result);
      setRatingStatus('done');
    } catch (err) {
      setRatingError(err.message ?? 'Failed to get ratings from AI.');
      setRatingStatus('error');
    }
  }, [qaPairs, role]);

  /* ── Communication evaluation (4 dimensions) ── */
  const [evalStatus, setEvalStatus] = useState('idle');
  const [evaluation, setEvaluation] = useState(null);
  const [evalError,  setEvalError]  = useState('');

  const fetchEvaluation = useCallback(async () => {
    if (qaPairs.length === 0) return;
    setEvalStatus('loading');
    setEvalError('');
    try {
      const result = await evaluateTranscript({ role: role || 'General', turns: qaPairs });
      setEvaluation(result);
      setEvalStatus('done');
    } catch (err) {
      setEvalError(err.message ?? 'Failed to evaluate communication.');
      setEvalStatus('error');
    }
  }, [qaPairs, role]);

  /* Auto-fetch once when the page mounts and there are Q&A pairs */
  useEffect(() => {
    if (qaPairs.length > 0) {
      fetchRatings();
      fetchEvaluation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — qaPairs is stable after mount

  /* ── Entrance animation trigger ── */
  const rootRef = useRef(null);
  useEffect(() => {
    // Trigger CSS animation classes after a micro-tick so transitions fire
    const t = setTimeout(() => {
      rootRef.current?.classList.add('rp2-root--ready');
    }, 50);
    return () => clearTimeout(t);
  }, []);

  /* ── Gate: nothing to show ── */
  if (!hasAnything) {
    return (
      <div className="rp2-gate">
        <div className="rp2-gate__icon" aria-hidden="true">◎</div>
        <h1 className="rp2-gate__title">No Session Data</h1>
        <p className="rp2-gate__msg">
          Complete a vision monitoring session or interview first.
        </p>
        <div className="rp2-gate__actions">
          <button className="btn btn-primary" onClick={() => navigate('/vision')}>
            Start Vision Session
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/setup')}>
            Go to Setup
          </button>
        </div>
      </div>
    );
  }

  /* ── Handlers ── */
  function handleNewSession() {
    clearTranscript();
    navigate('/vision');
  }

  function handleDashboard() {
    navigate('/setup');
  }

  /* ─────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────── */
  return (
    <div className="rp2-root" ref={rootRef}>

      {/* ══════════════════════════════════════════════════
          1. HERO BANNER
      ══════════════════════════════════════════════════ */}
      <header className="rp2-hero">
        <div className="rp2-hero__grid" aria-hidden="true" />
        <div className="rp2-hero__scan" aria-hidden="true" />

        <div className="rp2-hero__inner">
          <p className="rp2-hero__eyebrow">
            <span className="rp2-hero__eyebrow-dot" aria-hidden="true" />
            SESSION COMPLETE
          </p>

          <h1 className="rp2-hero__title">Communication Report</h1>
          <p className="rp2-hero__sub">Your session results are ready</p>

          <div className="rp2-hero__meta">
            {sessionDuration && (
              <span className="rp2-hero__pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
                </svg>
                {sessionDuration}
              </span>
            )}
            {sessionDate && (
              <span className="rp2-hero__pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/>
                </svg>
                {fmtDate(sessionDate)}
              </span>
            )}
            {role && (
              <span className="rp2-hero__pill rp2-hero__pill--role">
                {role}
              </span>
            )}
          </div>

          <p className="rp2-hero__brand" aria-hidden="true">⬡ MockMentor</p>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════
          2. TRANSCRIPT
      ══════════════════════════════════════════════════ */}
      <section className="rp2-section" aria-labelledby="rp2-transcript-heading">
        <SectionHead
          icon="▶"
          title="Transcript"
          badge={hasTranscript ? `${transcript.length} turns` : null}
          id="rp2-transcript-heading"
        />
        <TranscriptPanel transcript={transcript} interviewer={interviewer} />
      </section>

      {/* ══════════════════════════════════════════════════
          3. ANSWER RATINGS
      ══════════════════════════════════════════════════ */}
      <FeedbackSection
        pairs={qaPairs}
        ratings={ratings}
        status={ratingStatus}
        error={ratingError}
      />

      {/* ══════════════════════════════════════════════════
          4. SPEECH ANALYSIS
      ══════════════════════════════════════════════════ */}
      <SpeechStats speech={speech} />
      <CoachSection data={coachData} />

      {/* ══════════════════════════════════════════════════
          5. COMMUNICATION EVALUATION
      ══════════════════════════════════════════════════ */}
      <CommEvalSection
        pairs={qaPairs}
        evaluation={evaluation}
        status={evalStatus}
        error={evalError}
      />

      <ImprovementSection
        pairs={qaPairs}
        evaluation={evaluation}
        status={evalStatus}
        error={evalError}
      />

      {/* ══════════════════════════════════════════════════
          6. SCORE RINGS
      ══════════════════════════════════════════════════ */}
      {hasVision && (
        <section className="rp2-section" aria-labelledby="rp2-scores-heading">
          <SectionHead icon="◎" title="Session Score" id="rp2-scores-heading" />

          <div className="rp2-rings-grid">
            <div className="rp2-ring-cell">
              <ScoreRing
                pct={confidence?.overall ?? null}
                label="CONFIDENCE"
                sublabel={
                  confidence
                    ? `${confidence.eyeScore}% eye · ${confidence.nonFearfulScore}% expr`
                    : undefined
                }
                color="var(--color-accent)"
                size={172}
              />
            </div>
            <div className="rp2-ring-cell">
              <ScoreRing
                pct={vStats?.eyeContactPct ?? null}
                label="EYE CONTACT"
                sublabel={vStats ? fmtSecs(vStats.eyeContactDuration) : undefined}
                color="var(--color-glow-teal)"
                size={172}
              />
            </div>
            <div className="rp2-ring-cell">
              <ScoreRing
                pct={confidence?.nonFearfulScore ?? null}
                label="NON-FEARFUL"
                sublabel={
                  totalExpressions > 0
                    ? `${totalExpressions} detections`
                    : undefined
                }
                color="#a78bfa"
                size={172}
              />
            </div>
            <div className="rp2-ring-cell">
              <ScoreRing
                pct={facePct}
                label="FACE PRESENCE"
                sublabel={
                  totalSamples > 0 ? `${totalSamples} samples` : undefined
                }
                color="var(--color-success)"
                size={172}
              />
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          4 & 5. EXPRESSION BREAKDOWN + SESSION DATA
          Side-by-side on wide screens, stacked on mobile
      ══════════════════════════════════════════════════ */}
      {hasVision && (
        <div className="rp2-lower-row">

          {/* Expression Breakdown */}
          {totalExpressions > 0 && (
            <section
              className="rp2-section rp2-section--card"
              aria-labelledby="rp2-expr-heading"
            >
              <SectionHead icon="≡" title="Expression Breakdown" id="rp2-expr-heading" />
              <ExpressionBars counts={vStats.expressionCounts} />
            </section>
          )}

          {/* Session Data */}
          <section
            className="rp2-section rp2-section--card"
            aria-labelledby="rp2-stats-heading"
          >
            <SectionHead icon="▦" title="Session Data" id="rp2-stats-heading" />

            <div className="rp2-stats-grid">
              <div className="rp2-stats-col">
                <StatRow label="Duration"     value={fmtSecs(vStats.sessionDuration)} />
                <StatRow label="Samples"       value={totalSamples} />
                <StatRow label="Eye Contact"   value={fmtSecs(vStats.eyeContactDuration)} />
                <StatRow label="Eye Contact %"  value={`${vStats.eyeContactPct}%`} />
                {confidence && (
                  <StatRow label="Confidence"  value={`${confidence.overall}%`} />
                )}
              </div>
              <div className="rp2-stats-col">
                <StatRow label="Neutral"   value={neutral} />
                <StatRow label="Happy"     value={happy} />
                <StatRow label="Fearful"   value={fearful} />
                <StatRow label="Surprised" value={surprised} />
                <StatRow label="No Face"   value={vStats.noFaceCount} />
              </div>
            </div>
          </section>

        </div>
      )}

      {/* ══════════════════════════════════════════════════
          6. FOOTER NAV
      ══════════════════════════════════════════════════ */}
      <footer className="rp2-footer">
        <button
          type="button"
          className="btn btn-primary rp2-footer__btn"
          onClick={handleNewSession}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Start New Session
        </button>
        <button
          type="button"
          className="btn btn-ghost rp2-footer__btn"
          onClick={handleDashboard}
        >
          Back to Dashboard
        </button>
      </footer>

    </div>
  );
}
