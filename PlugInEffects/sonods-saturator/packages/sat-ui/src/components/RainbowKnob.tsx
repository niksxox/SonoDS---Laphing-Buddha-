import React, { useCallback, useEffect, useRef, useState } from 'react';

interface RainbowKnobProps {
  value: number; // Current value
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  size?: number; // Diameter in px (default 72)
  label: string;
  unit?: string;
  displayFormatter?: (val: number) => string;
  onChange: (val: number) => void;
  accentColor?: string;
}

export const RainbowKnob: React.FC<RainbowKnobProps> = ({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue = 0,
  size = 72,
  label,
  unit = '',
  displayFormatter,
  onChange,
  accentColor = '#38bdf8',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartValue = useRef(0);

  // Map value to angle (-135deg to +135deg => 270deg sweep)
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + normalized * 270;

  // Arc calculation for SVG progress
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * (270 / 360);
  const strokeDashoffset = arcLength * (1 - normalized);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartY.current = e.clientY;
      dragStartValue.current = value;
    },
    [value]
  );

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

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartY.current - e.clientY;
      const sensitivity = e.shiftKey ? 0.001 : 0.005;
      const range = max - min;
      const deltaVal = deltaY * sensitivity * range;
      const rawVal = dragStartValue.current + deltaVal;
      const steppedVal = Math.round(rawVal / step) * step;
      const clampedVal = Math.max(min, Math.min(max, steppedVal));
      onChange(Number(clampedVal.toFixed(4)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, max, min, onChange, step]);

  const displayText = displayFormatter
    ? displayFormatter(value)
    : `${Number(value.toFixed(2))}${unit}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
        cursor: 'ns-resize',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
    >
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(135deg)', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id={`knobRainbow-${label}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="20%" stopColor="#f97316" />
              <stop offset="40%" stopColor="#eab308" />
              <stop offset="60%" stopColor="#22c55e" />
              <stop offset="80%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#8b5cf6" />
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

          {/* Active Progress Arc (vibrant rainbow) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#knobRainbow-${label})`}
            strokeWidth={strokeWidth + 0.5}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: isDragging ? 'none' : 'stroke-dashoffset 0.1s ease',
              filter: isDragging ? 'drop-shadow(0 0 4px rgba(234, 179, 8, 0.6))' : 'none',
            }}
          />
        </svg>

        {/* Rotary Dial Center Body — Light studio look matching EQ knobs */}
        <div
          style={{
            position: 'absolute',
            width: size - 18,
            height: size - 18,
            borderRadius: '50%',
            background: 'linear-gradient(145deg, #FFFFFF, #EBEBEF)',
            boxShadow: '0 3px 8px rgba(0,0,0,0.12), inset 0 1px 2px rgba(255,255,255,0.9)',
            border: '1.5px solid #D4D4D8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `rotate(${angle}deg)`,
            transition: isDragging ? 'none' : 'transform 0.1s ease',
          }}
        >
          {/* Inner knurled concentric ring */}
          <div
            style={{
              width: size - 30,
              height: size - 30,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #FAFAFA 0%, #E4E4E7 100%)',
              border: '1px solid #D4D4D8',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)',
              position: 'relative',
            }}
          >
            {/* Pointer / Pip Indicator */}
            <div
              style={{
                position: 'absolute',
                top: '2px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '3.5px',
                height: '8px',
                borderRadius: '2px',
                backgroundColor: isDragging ? '#18181B' : accentColor,
                boxShadow: isDragging
                  ? '0 0 4px rgba(24, 24, 27, 0.5)'
                  : `0 0 6px ${accentColor}`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Label and Value */}
      <span
        style={{
          marginTop: '6px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#18181B',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          fontFamily: 'var(--sat-font-mono)',
          color: isDragging ? '#18181B' : '#71717A',
          transition: 'color 0.15s ease',
        }}
      >
        {displayText}
      </span>
    </div>
  );
};
