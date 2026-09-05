import React, { useMemo } from 'react';
import { CharacterType } from '@sonods/sat-engine';

interface HarmonicVisualizerProps {
  drive: number; // 0.0 to 1.0
  character: CharacterType;
  audioPeak?: number;
}

export const HarmonicVisualizer: React.FC<HarmonicVisualizerProps> = ({
  drive,
  character,
  audioPeak = 0.0,
}) => {
  // Compute harmonic magnitudes based on active character waveshaping properties
  const harmonics = useMemo(() => {
    const d = drive * (0.4 + audioPeak * 0.6);

    switch (character) {
      case 'tube':
        // Asymmetric triode waveshaper produces strong 2nd (even) harmonic + 3rd harmonic
        return [
          { order: 'f0', label: '1st', mag: 1.0, type: 'fund' },
          { order: '2f0', label: '2nd (Even)', mag: Math.min(0.9, 0.05 + d * 0.65), type: 'even' },
          { order: '3f0', label: '3rd (Odd)', mag: Math.min(0.7, 0.02 + d * 0.35), type: 'odd' },
          { order: '4f0', label: '4th (Even)', mag: Math.min(0.5, d * 0.2), type: 'even' },
          { order: '5f0', label: '5th (Odd)', mag: Math.min(0.35, d * 0.1), type: 'odd' },
        ];
      case 'transformer':
        // Transformer core produces high 3rd + slight 2nd + 5th
        return [
          { order: 'f0', label: '1st', mag: 1.0, type: 'fund' },
          { order: '2f0', label: '2nd (Even)', mag: Math.min(0.5, 0.02 + d * 0.25), type: 'even' },
          { order: '3f0', label: '3rd (Odd)', mag: Math.min(0.85, 0.04 + d * 0.60), type: 'odd' },
          { order: '4f0', label: '4th (Even)', mag: Math.min(0.3, d * 0.12), type: 'even' },
          { order: '5f0', label: '5th (Odd)', mag: Math.min(0.45, d * 0.25), type: 'odd' },
        ];
      case 'tape':
      default:
        // Pure symmetric tanh produces pure odd harmonics (3rd, 5th, 7th)
        return [
          { order: 'f0', label: '1st', mag: 1.0, type: 'fund' },
          { order: '2f0', label: '2nd (Even)', mag: Math.min(0.15, d * 0.05), type: 'even' },
          { order: '3f0', label: '3rd (Odd)', mag: Math.min(0.8, 0.03 + d * 0.55), type: 'odd' },
          { order: '4f0', label: '4th (Even)', mag: Math.min(0.1, d * 0.03), type: 'even' },
          { order: '5f0', label: '5th (Odd)', mag: Math.min(0.5, d * 0.3), type: 'odd' },
        ];
    }
  }, [audioPeak, character, drive]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--sat-radius-md)',
        background: 'var(--sat-bg-input)',
        border: '1px solid var(--sat-border-subtle)',
        padding: '12px',
        width: '280px',
        height: '180px',
        justifyContent: 'space-between',
        boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.08)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--sat-text-muted)',
          }}
        >
          Harmonic Distribution
        </span>
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            color: character === 'tube' ? '#f43f5e' : character === 'tape' ? '#f59e0b' : '#06b6d4',
            textTransform: 'uppercase',
          }}
        >
          {character === 'tube' ? 'Even Harmonics Heavy' : 'Odd Harmonics Saturated'}
        </span>
      </div>

      {/* Harmonic Bars */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-around',
          height: '110px',
          gap: '8px',
          paddingTop: '8px',
        }}
      >
        {harmonics.map((h, i) => {
          const heightPct = Math.max(8, h.mag * 100);
          const barColor =
            h.type === 'fund'
              ? '#38bdf8'
              : h.type === 'even'
              ? '#f43f5e'
              : '#f59e0b';

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                height: '100%',
                justifyContent: 'flex-end',
                gap: '6px',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '24px',
                  height: `${heightPct}%`,
                  borderRadius: '4px 4px 1px 1px',
                  background: `linear-gradient(to top, ${barColor}33, ${barColor})`,
                  border: `1px solid ${barColor}aa`,
                  boxShadow: h.mag > 0.3 ? `0 0 10px ${barColor}66` : 'none',
                  transition: 'height 0.1s ease',
                }}
              />
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  fontFamily: 'var(--sat-font-mono)',
                  color: 'var(--sat-text-secondary)',
                }}
              >
                {h.order}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
