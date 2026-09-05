import React, { useState, useRef, useEffect } from 'react';
import { BandState, Shape } from '@sonods/eq-engine';
import { Knob } from '../Knob/index.js';
import { GainSlider } from '../GainSlider/index.js';
import { formatFrequency, formatQ } from '../../coords.js';
import styles from './BandStrip.module.css';

export interface BandStripProps {
  band: BandState;
  bandNumber: number;
  color: string;
  isSelected: boolean;
  onSelect: () => void;
  onGainChange: (gain: number) => void;
  onFreqChange: (freq: number) => void;
  onQChange: (q: number) => void;
  onShapeChange: (shape: Shape) => void;
}

const SHAPE_OPTIONS = [
  { shape: Shape.LowCut, label: 'Low Cut', short: 'HP' },
  { shape: Shape.LowShelf, label: 'Low Shelf', short: 'LS' },
  { shape: Shape.Bell, label: 'Peak / Bell', short: 'Peak' },
  { shape: Shape.HighShelf, label: 'High Shelf', short: 'HS' },
  { shape: Shape.HighCut, label: 'High Cut', short: 'LP' },
];

export const BandStrip: React.FC<BandStripProps> = ({
  band,
  bandNumber,
  color,
  isSelected,
  onSelect,
  onGainChange,
  onFreqChange,
  onQChange,
  onShapeChange,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const currentShapeOpt =
    SHAPE_OPTIONS.find((opt) => opt.shape === band.shape) || SHAPE_OPTIONS[2];

  const handleGain = (newGain: number) => {
    // If user moves gain on a Cut filter (HP/LP), automatically switch to Peak or Shelf so gain works immediately!
    if (band.shape === Shape.LowCut && Math.abs(newGain) > 0.2) {
      onShapeChange(Shape.LowShelf);
    } else if (band.shape === Shape.HighCut && Math.abs(newGain) > 0.2) {
      onShapeChange(Shape.HighShelf);
    }
    onGainChange(newGain);
  };

  return (
    <div
      className={`${styles.bandStrip} ${isSelected ? styles.selected : ''}`}
      onClick={onSelect}
    >
      {/* Header: Number on Top, Shape Dropdown Button Below */}
      <div className={styles.headerRow}>
        <div
          className={styles.bandNumber}
          style={{ backgroundColor: color }}
          title={`Band ${bandNumber} (Click to select)`}
        >
          {bandNumber}
        </div>
        <button
          className={styles.shapeBtn}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          title={`Filter: ${currentShapeOpt.label} (Click to change)`}
        >
          <span>{currentShapeOpt.short}</span>
          <span className={styles.chevron}>▾</span>
        </button>
      </div>

      {/* Floating Shape Dropdown Menu */}
      {menuOpen && (
        <div ref={menuRef} className={styles.shapeMenu} onClick={(e) => e.stopPropagation()}>
          {SHAPE_OPTIONS.map((opt) => (
            <div
              key={opt.shape}
              className={`${styles.shapeMenuItem} ${
                band.shape === opt.shape ? styles.active : ''
              }`}
              onClick={() => {
                onShapeChange(opt.shape);
                setMenuOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}

      {/* Vertical Gain Slider */}
      <GainSlider
        gain={band.gain}
        color={color}
        onChange={handleGain}
      />

      {/* FREQ & BW/Q Rotary Knobs */}
      <div className={styles.controlsColumn}>
        <Knob
          label="FREQ"
          value={band.freq}
          min={20}
          max={20000}
          isLog={true}
          color={color}
          ringColor="#EAB308"
          formatValue={(v) => formatFrequency(v)}
          onChange={onFreqChange}
        />
        <Knob
          label="BW"
          value={band.q}
          min={0.1}
          max={10.0}
          color={color}
          ringColor="#EAB308"
          formatValue={(v) => formatQ(v)}
          onChange={onQChange}
        />
      </div>
    </div>
  );
};
