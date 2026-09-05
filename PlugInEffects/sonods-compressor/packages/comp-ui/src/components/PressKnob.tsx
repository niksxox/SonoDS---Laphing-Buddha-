import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface PressKnobProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  size?: number; // default 56px
  label: string;
  unit?: string;
  displayFormatter?: (val: number) => string;
  onChange: (val: number) => void;
  accentColor?: string;
}

/**
 * PressKnob Component — Clean Light Studio Rotary Dial
 *
 * Matches the SonoDS Light Studio aesthetic (consistent with Saturator & EQ):
 * - Circular SVG track with active progress arc
 * - Precision metallic rotary body with subtle radial gradient and bevel
 * - Crisp colored indicator pip
 * - Smooth drag, double-click reset, mouse wheel, and arrow key nudge
 */
export const PressKnob: React.FC<PressKnobProps> = ({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue = 0,
  size = 56,
  label,
  unit = '',
  displayFormatter,
  onChange,
  accentColor = '#06B6D4',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartY = useRef(0);
  const dragStartValue = useRef(0);

  // Map value to angle (-135deg to +135deg => 270deg total sweep)
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + normalized * 270;

  // Arc calculation for SVG progress
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * (270 / 360);
  const strokeDashoffset = arcLength * (1 - normalized);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      dragStartY.current = e.clientY;
      dragStartValue.current = value;
    },
    [value]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const deltaY = dragStartY.current - e.clientY; // Upward increases value
      const range = max - min;
      const sensitivity = 160; // pixels to traverse full range
      const stepVal = e.shiftKey ? step * 0.1 : step;
      let nextVal = dragStartValue.current + (deltaY / sensitivity) * range;

      // Quantize to step
      if (stepVal > 0) {
        nextVal = Math.round(nextVal / stepVal) * stepVal;
      }
      nextVal = Math.max(min, Math.min(max, nextVal));
      onChange(Number(nextVal.toFixed(4)));
    },
    [isDragging, max, min, onChange, step]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    onChange(defaultValue);
  }, [defaultValue, onChange]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = -Math.sign(e.deltaY) * (e.shiftKey ? step * 0.1 : step);
      const nextVal = Math.max(min, Math.min(max, value + delta));
      onChange(Number(nextVal.toFixed(4)));
    },
    [max, min, onChange, step, value]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let delta = 0;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = step;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -step;

      if (delta !== 0) {
        e.preventDefault();
        const nextVal = Math.max(min, Math.min(max, value + delta));
        onChange(Number(nextVal.toFixed(4)));
      }
    },
    [max, min, onChange, step, value]
  );

  const formattedValue = displayFormatter
    ? displayFormatter(value)
    : `${Number(value.toFixed(2))}${unit}`;

  const dialBodySize = size - 14;
  const innerRingSize = dialBodySize - 10;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        userSelect: 'none',
        fontFamily: 'var(--comp-font-family, -apple-system, BlinkMacSystemFont, sans-serif)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Knob Body with SVG Arc and Rotary Center */}
      <div
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          outline: 'none',
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(135deg)', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id={`compKnobGrad-${label}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06B6D4" />
              <stop offset="100%" stopColor="#0284C7" />
            </linearGradient>
          </defs>

          {/* Background Track Arc (subtle light gray) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(0, 0, 0, 0.08)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />

          {/* Active Progress Arc (cyan/teal studio accent) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#compKnobGrad-${label})`}
            strokeWidth={strokeWidth + 0.5}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: isDragging ? 'none' : 'stroke-dashoffset 0.1s ease',
              filter: isDragging || isHovered ? 'drop-shadow(0 0 3px rgba(6, 182, 212, 0.5))' : 'none',
            }}
          />
        </svg>

        {/* Rotary Dial Center Body — Light Studio Brushed Aluminum */}
        <div
          style={{
            position: 'absolute',
            width: `${dialBodySize}px`,
            height: `${dialBodySize}px`,
            borderRadius: '50%',
            background: 'linear-gradient(145deg, #FFFFFF, #EBEBEF)',
            boxShadow: isDragging || isHovered
              ? '0 4px 10px rgba(0,0,0,0.14), inset 0 1px 2px rgba(255,255,255,0.95)'
              : '0 2px 6px rgba(0,0,0,0.08), inset 0 1px 2px rgba(255,255,255,0.95)',
            border: '1.5px solid #D4D4D8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `rotate(${angle}deg)`,
            transition: isDragging ? 'none' : 'transform 0.08s ease, box-shadow 0.15s ease',
          }}
        >
          {/* Inner concentric recessed face */}
          <div
            style={{
              width: `${innerRingSize}px`,
              height: `${innerRingSize}px`,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #FAFAFA 0%, #E4E4E7 100%)',
              border: '1px solid #E4E4E7',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
              position: 'relative',
            }}
          >
            {/* Precision Indicator Pip */}
            <div
              style={{
                position: 'absolute',
                top: '2px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '3px',
                height: `${Math.max(5, Math.floor(innerRingSize * 0.3))}px`,
                borderRadius: '2px',
                backgroundColor: isDragging ? '#18181B' : accentColor,
                boxShadow: isDragging
                  ? '0 0 3px rgba(24, 24, 27, 0.4)'
                  : `0 0 5px ${accentColor}`,
                transition: 'background-color 0.15s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Label and Value */}
      <div style={{ textAlign: 'center', minHeight: '28px', marginTop: '2px' }}>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: '#18181B',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontVariantNumeric: 'tabular-nums',
            color: isDragging || isHovered ? '#0891B2' : '#71717A',
            transition: 'color 0.15s ease',
          }}
        >
          {formattedValue}
        </div>
      </div>
    </div>
  );
};
