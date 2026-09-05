import React, { useRef, useState, useCallback, useEffect } from 'react';
import { positionToDB, dBToPosition, DEVIATION_THRESHOLD } from '../../utils/stemConfig';

const SCALE_MARKS = [
  { dB: 18,  label: '+18' },
  { dB: 12,  label: '+12' },
  { dB: 6,   label: '+6' },
  { dB: 0,   label: '0',  isUnity: true },
  { dB: -6,  label: '-6' },
  { dB: -12, label: '-12' },
  { dB: -24, label: '-24' },
  { dB: -48, label: '-48' },
];

const TRACK_HEIGHT = 240;

const VerticalFader = ({ stemId, initialDB, safeRange, onGainChange, isSelected, bypass, bypassVersion, locked, onLockedAttempt }) => {
  const trackRef = useRef(null);
  const isDragging = useRef(false);
  const [position, setPosition] = useState(() => dBToPosition(initialDB));

  const dB = positionToDB(position);
  const deviation = Math.abs(dB - initialDB);
  const threshold = safeRange != null ? safeRange : DEVIATION_THRESHOLD;
  const isInDanger = !bypass && deviation > threshold;
  const isInSafe = !bypass && deviation <= threshold;

  const dBDisplay = dB <= -60 ? '−∞' : `${dB >= 0 ? '+' : ''}${dB.toFixed(1)}`;

  // Bypass toggle
  const lastBypassVersionRef = useRef(bypassVersion);
  useEffect(() => {
    if (bypassVersion !== lastBypassVersionRef.current) {
      lastBypassVersionRef.current = bypassVersion;
      setPosition(dBToPosition(bypass ? 0 : initialDB));
    }
  }, [bypass, bypassVersion, initialDB]);

  const updateFromPointer = useCallback((clientY) => {
    if (locked) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const rawPos = 1 - ((clientY - rect.top) / rect.height);
    const clamped = Math.max(0, Math.min(1, rawPos));
    setPosition(clamped);
    onGainChange(stemId, positionToDB(clamped));
  }, [stemId, onGainChange, locked]);

  useEffect(() => {
    const handleMove = (e) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      updateFromPointer(clientY);
    };
    const handleUp = () => { isDragging.current = false; };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [updateFromPointer]);

  const handleDoubleClick = () => {
    if (locked) return;
    setPosition(dBToPosition(initialDB));
    onGainChange(stemId, initialDB);
  };

  // Color derivation — danger overrides everything, otherwise theme-aware via CSS vars
  const railBg = isInDanger
    ? 'linear-gradient(180deg, var(--danger-color-50), var(--danger-color-15))'
    : isSelected ? 'var(--mixer-fader-rail-selected)' : 'var(--mixer-fader-rail)';

  const fillBg = isInDanger
    ? 'linear-gradient(180deg, var(--danger-color), var(--danger-color-20))'
    : isSelected ? 'var(--mixer-fader-fill-selected)' : 'var(--mixer-fader-fill)';

  const handleBg = isInDanger
    ? 'linear-gradient(180deg, var(--danger-color-light), var(--danger-color-dark))'
    : isSelected ? 'var(--mixer-handle-bg-selected)' : 'var(--mixer-handle-bg)';

  const handleBorder = isInDanger
    ? '1px solid var(--danger-color)'
    : isSelected ? '1px solid var(--mixer-handle-border-selected)' : `1px solid var(--mixer-handle-border)`;

  const handleShadow = isInDanger
    ? '0 2px 12px var(--danger-color-40)'
    : isSelected ? 'var(--mixer-handle-shadow-selected)' : 'var(--mixer-handle-shadow)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      
      <div style={{ display: 'flex', gap: '2px', alignItems: 'stretch' }}>
        
        {/* dB Scale labels */}
        <div style={{
          position: 'relative',
          width: '24px',
          height: `${TRACK_HEIGHT}px`,
          flexShrink: 0,
        }}>
          {SCALE_MARKS.map((mark) => {
            const markPos = dBToPosition(mark.dB);
            return (
              <div key={mark.dB} style={{
                position: 'absolute',
                bottom: `${markPos * 100}%`,
                right: '0px',
                transform: 'translateY(50%)',
                fontSize: '7px',
                fontFamily: "'JetBrains Mono', monospace",
                color: mark.isUnity 
                  ? (isSelected ? 'var(--mixer-readout-color-selected)' : 'var(--mixer-scale-unity-color)') 
                  : 'var(--mixer-scale-color)',
                fontWeight: mark.isUnity ? 700 : 400,
                lineHeight: 1,
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}>
                {mark.label}
              </div>
            );
          })}
        </div>

        {/* Fader track */}
        <div
          ref={trackRef}
          onPointerDown={(e) => {
            e.preventDefault();
            if (locked) { onLockedAttempt?.(); return; }
            isDragging.current = true;
            updateFromPointer(e.clientY);
          }}
          style={{
            position: 'relative',
            width: '32px',
            height: `${TRACK_HEIGHT}px`,
            cursor: locked ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Rail groove */}
          <div style={{
            position: 'absolute',
            width: '4px',
            height: '100%',
            background: railBg,
            borderRadius: '2px',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
          }} />

          {/* Scale tick marks */}
          {SCALE_MARKS.map((mark) => {
            const markPos = dBToPosition(mark.dB);
            return (
              <div key={mark.dB} style={{
                position: 'absolute',
                bottom: `${markPos * 100}%`,
                left: '50%',
                transform: 'translate(-50%, 0)',
                width: mark.isUnity ? '18px' : '8px',
                height: mark.isUnity ? '2px' : '1px',
                background: mark.isUnity
                  ? (isSelected ? 'var(--mixer-tick-unity-selected)' : 'var(--mixer-tick-unity)')
                  : 'var(--mixer-tick-color)',
                borderRadius: '1px',
              }} />
            );
          })}

          {/* Fill indicator */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            width: '4px',
            height: `${position * 100}%`,
            background: fillBg,
            borderRadius: '2px',
            transition: isDragging.current ? 'none' : 'height 0.08s ease-out',
          }} />

          {/* Fader Handle */}
          <div
            onDoubleClick={handleDoubleClick}
            style={{
              position: 'absolute',
              bottom: `calc(${position * 100}% - 12px)`,
              width: '44px',
              height: '24px',
              background: handleBg,
              borderRadius: '4px',
              border: handleBorder,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              cursor: locked ? 'not-allowed' : 'grab',
              touchAction: 'none',
              zIndex: 2,
              boxShadow: handleShadow,
              transition: isDragging.current ? 'none' : 'bottom 0.08s ease-out',
              opacity: locked ? 0.7 : 1,
            }}
          >
            <div style={{
              width: '26px', height: '2px',
              background: isSelected ? 'var(--mixer-handle-notch-selected)' : 'var(--mixer-handle-notch)',
              borderRadius: '1px',
            }} />
            {[0,1].map(i => (
              <div key={i} style={{
                width: '20px', height: '1px',
                background: isSelected ? 'var(--mixer-handle-notch-selected)' : 'var(--mixer-handle-notch)',
                borderRadius: '1px',
                opacity: 0.5,
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* dB Readout */}
      <div style={{
        fontSize: '10px',
        fontFamily: "'JetBrains Mono', monospace",
        color: isInDanger ? 'var(--danger-color)' : (isInSafe ? 'var(--safe-color)' : 'var(--mixer-readout-color)'),
        letterSpacing: '0.5px',
        minWidth: '52px',
        textAlign: 'center',
        padding: '2px 6px',
        background: isInDanger
          ? 'var(--danger-color-12)'
          : (isInSafe ? 'var(--safe-color-08)' : 'var(--mixer-readout-bg)'),
        borderRadius: '4px',
        border: `0.5px solid ${
          isInDanger ? 'var(--danger-color-30)'
          : isInSafe ? 'var(--safe-color-15)'
          : 'var(--mixer-readout-border)'
        }`,
        transition: 'all 0.2s ease',
      }}>
        {dBDisplay}
      </div>
    </div>
  );
};

export default VerticalFader;
