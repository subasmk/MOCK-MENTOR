/**
 * AvatarPicker.jsx
 *
 * Horizontal scrollable grid of interviewer avatar cards.
 * Each card shows the avatar image (falling back to initials),
 * the mentor name, and a specialty tag.
 *
 * Props:
 *   selected  {string}   — currently selected avatar filename
 *   onSelect  {function} — called with filename when a card is clicked
 */
import React from 'react';
import './AvatarPicker.css';

/**
 * MENTORS — static catalogue of available interviewer personas.
 * Add new entries here as avatar images are added to /public/avatars/.
 */
const MENTORS = [
  {
    id:        'aria',
    filename:  'mentor-aria.png',
    name:      'Aria Chen',
    specialty: 'Frontend / UI',
    initials:  'AC',
  },
  {
    id:        'marcus',
    filename:  'mentor-marcus.png',
    name:      'Marcus Reid',
    specialty: 'System Design',
    initials:  'MR',
  },
  {
    id:        'priya',
    filename:  'mentor-priya.png',
    name:      'Priya Nair',
    specialty: 'Data & ML',
    initials:  'PN',
  },
  {
    id:        'leo',
    filename:  'mentor-leo.png',
    name:      'Leo Vasquez',
    specialty: 'Backend / APIs',
    initials:  'LV',
  },
];

export default function AvatarPicker({ selected, onSelect }) {
  return (
    <div className="avatar-picker" role="group" aria-label="Choose your interviewer">
      {MENTORS.map((mentor) => {
        const isSelected = selected === mentor.filename;

        return (
          <button
            key={mentor.id}
            type="button"
            className={`avatar-card${isSelected ? ' avatar-card--selected' : ''}`}
            onClick={() => onSelect(mentor.filename)}
            aria-pressed={isSelected}
            aria-label={`Select ${mentor.name}, ${mentor.specialty}`}
          >
            {/* Avatar image with initials fallback */}
            <div className="avatar-card__img-wrap">
              <img
                src={`/avatars/${mentor.filename}`}
                alt={mentor.name}
                className="avatar-card__img"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              {/* Initials shown when image fails to load */}
              <span className="avatar-card__initials" aria-hidden="true">
                {mentor.initials}
              </span>
            </div>

            <span className="avatar-card__name">{mentor.name}</span>
            <span className="avatar-card__tag">{mentor.specialty}</span>

            {/* Selected indicator ring */}
            {isSelected && (
              <span className="avatar-card__check" aria-hidden="true">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
