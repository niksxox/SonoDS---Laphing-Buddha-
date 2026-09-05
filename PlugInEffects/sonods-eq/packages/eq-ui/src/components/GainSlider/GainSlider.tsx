import React, { useRef } from 'react';
import styles from './GainSlider.module.css';

export interface GainSliderProps {
  gain: number;
  min?: number;
  max?: number;
  color?: string;
  onChange: (gain: number) => void;
}

export const GainSlider: React.FC<GainSliderProps> = ({
  gain,
  min = -18,
  max = 18,
  color = '#84CC16',
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize gain (-18..+18) to 0..1 (top is 1, bottom is 0)
  const norm = Math.max(0, Math.min(1, (gain - min) / (max - min)));
  const topPercent = (1 - norm) * 100;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !containerRef.current) return;
    containerRef.current.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current?.hasPointerCapture(e.pointerId)) return;
    updateFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const updateFromPointer = (clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const fraction = 1 - Math.max(0, Math.min(1, y / rect.height));
    const newGain = min + fraction * (max - min);
    onChange(Math.round(newGain * 10) / 10);
  };

  const handleDoubleClick = () => {
    onChange(0.0);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * (e.shiftKey ? 0.05 : 0.2);
    const newGain = Math.max(min, Math.min(max, gain + delta));
    onChange(Math.round(newGain * 10) / 10);
  };

  // Colored fill from 0 dB center mark to current thumb position
  const zeroPercent = 50;
  const isPositive = gain >= 0;
  const fillTop = isPositive ? topPercent : zeroPercent;
  const fillHeight = Math.abs(topPercent - zeroPercent);

  return (
    <div
      ref={containerRef}
      className={styles.sliderContainer}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      title={`Gain: ${gain > 0 ? '+' : ''}${gain.toFixed(1)} dB (Double-click to reset)`}
    >
      <div className={styles.track} />
      <div className={styles.zeroMark} />
      <div
        className={styles.fill}
        style={{
          top: `${fillTop}%`,
          height: `${fillHeight}%`,
          backgroundColor: color,
        }}
      />
      <div
        className={styles.thumb}
        style={{
          top: `${topPercent}%`,
          borderColor: color,
        }}
      >
        <div className={styles.thumbLine} />
      </div>
    </div>
  );
};
