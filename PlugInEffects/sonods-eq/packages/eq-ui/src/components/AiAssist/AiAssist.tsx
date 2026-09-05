import React, { useState, useRef, useEffect } from 'react';
import styles from './AiAssist.module.css';

export interface AiAssistProps {
  onSelectPreset: (presetKey: 'vocal' | 'kick' | 'bass' | 'acoustic') => void;
}

export const AiAssist: React.FC<AiAssistProps> = ({ onSelectPreset }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={styles.aiContainer}>
      <button
        className={styles.aiButton}
        onClick={() => setIsOpen(!isOpen)}
        title="SonoAI Tone & Resonance Assist"
      >
        <span className={styles.aiBadge}>AI</span>
        <span>Assist</span>
      </button>

      {isOpen && (
        <div className={styles.aiDropdown}>
          <div
            className={styles.aiOption}
            onClick={() => {
              onSelectPreset('vocal');
              setIsOpen(false);
            }}
          >
            Vocal Presence & Clarity
          </div>
          <div
            className={styles.aiOption}
            onClick={() => {
              onSelectPreset('kick');
              setIsOpen(false);
            }}
          >
            Kick Punch & Low End
          </div>
          <div
            className={styles.aiOption}
            onClick={() => {
              onSelectPreset('bass');
              setIsOpen(false);
            }}
          >
            Bass Unmasking & Warmth
          </div>
          <div
            className={styles.aiOption}
            onClick={() => {
              onSelectPreset('acoustic');
              setIsOpen(false);
            }}
          >
            Acoustic Clean & Air
          </div>
        </div>
      )}
    </div>
  );
};
