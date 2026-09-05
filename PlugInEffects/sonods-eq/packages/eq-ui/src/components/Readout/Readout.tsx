import React, { useState, useEffect, useRef } from 'react';
import { BandState } from '@sonods/eq-engine';
import { formatFrequency, formatGain, formatQ } from '../../coords.js';
import styles from './Readout.module.css';

export interface ReadoutProps {
  selectedBand: BandState | null;
  onFrequencyChange?: (newFreq: number) => void;
}

export const Readout: React.FC<ReadoutProps> = ({ selectedBand, onFrequencyChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (selectedBand) {
      setInputValue(`${Math.round(selectedBand.freq)}`);
      setIsEditing(true);
    }
  };

  const handleCommit = () => {
    const val = parseFloat(inputValue);
    if (!isNaN(val) && val >= 10 && val <= 22000 && onFrequencyChange) {
      onFrequencyChange(val);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCommit();
    if (e.key === 'Escape') setIsEditing(false);
  };

  return (
    <div
      className={styles.readout}
      onDoubleClick={handleDoubleClick}
      title="Double-click to type precise frequency"
    >
      <span className={styles.label}>:</span>
      {isEditing ? (
        <span>
          <input
            ref={inputRef}
            type="text"
            className={styles.inlineInput}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
          />
          Hz
        </span>
      ) : selectedBand ? (
        <span>
          {formatFrequency(selectedBand.freq)}Hz &nbsp;{formatGain(selectedBand.gain)} &nbsp;Q{' '}
          {formatQ(selectedBand.q)}
        </span>
      ) : (
        <span>450Hz &nbsp;0.0 dB</span>
      )}
    </div>
  );
};
