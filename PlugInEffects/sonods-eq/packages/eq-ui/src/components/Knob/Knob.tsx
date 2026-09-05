import React, { useRef, useCallback } from 'react';
import styles from './Knob.module.css';

export interface KnobProps {
  value: number;
  min: number;
  max: number;
  defaultValue?: number;
  label?: string;
  isLog?: boolean;
  color?: string;
  ringColor?: string;
  formatValue?: (val: number) => string;
  onChange: (val: number) => void;
}

export const Knob: React.FC<KnobProps> = ({
  value,
  min,
  max,
  defaultValue = (min + max) / 2,
  label,
  isLog = false,
  color = '#84CC16',
  ringColor = '#EAB308',
  formatValue = (v) => v.toFixed(1),
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef(0);
  const dragStartValRef = useRef(0);

  // Normalize value between 0 and 1
  const getNormalized = useCallback(
    (v: number) => {
      if (isLog) {
        const logMin = Math.log10(Math.max(1e-5, min));
        const logMax = Math.log10(max);
        const logVal = Math.log10(Math.max(1e-5, v));
        return Math.max(0, Math.min(1, (logVal - logMin) / (logMax - logMin)));
      }
      return Math.max(0, Math.min(1, (v - min) / (max - min)));
    },
    [min, max, isLog]
  );

  // Convert 0..1 back to value
  const fromNormalized = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(1, n));
      if (isLog) {
        const logMin = Math.log10(Math.max(1e-5, min));
        const logMax = Math.log10(max);
        return Math.pow(10, logMin + clamped * (logMax - logMin));
      }
      return min + clamped * (max - min);
    },
    [min, max, isLog]
  );

  const norm = getNormalized(value);
  // Rotation angle from -135deg to +135deg
  const rotationDeg = -135 + norm * 270;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !containerRef.current) return;
    dragStartYRef.current = e.clientY;
    dragStartValRef.current = norm;
    containerRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current?.hasPointerCapture(e.pointerId)) return;
    const dy = dragStartYRef.current - e.clientY;
    const sensitivity = e.shiftKey ? 0.0015 : 0.006;
    const newNorm = Math.max(0, Math.min(1, dragStartValRef.current + dy * sensitivity));
    onChange(fromNormalized(newNorm));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * (e.shiftKey ? 0.0005 : 0.002);
    const newNorm = Math.max(0, Math.min(1, norm + delta));
    onChange(fromNormalized(newNorm));
  };

  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  return (
    <div
      ref={containerRef}
      className={styles.knobContainer}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      title={`${label || ''}: ${formatValue(value)} (Double-click to reset)`}
    >
      <div className={styles.knobWrapper}>
        <div
          className={styles.knobBody}
          style={{
            transform: `rotate(${rotationDeg}deg)`,
            backgroundColor: color,
            borderColor: ringColor,
          }}
        >
          <div className={styles.knobIndicator} />
        </div>
      </div>
      {label && <span className={styles.label}>{label}</span>}
      <span className={styles.valueReadout}>{formatValue(value)}</span>
    </div>
  );
};
