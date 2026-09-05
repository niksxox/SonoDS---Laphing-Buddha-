import React, { useMemo } from 'react';
import { CharacterType } from '@sonods/sat-engine';

interface SaturatorCharacterFaceProps {
  drive: number; // 0.0 to 1.0 continuous
  character: CharacterType;
  audioPeak?: number; // 0.0 to 1.0 live audio amplitude
}

export const SaturatorCharacterFace: React.FC<SaturatorCharacterFaceProps> = ({
  drive,
  character,
  audioPeak = 0.0,
}) => {
  // Character-specific heart color
  const charAccent = useMemo(() => {
    switch (character) {
      case 'tape':
        return { primary: '#f59e0b', glow: 'rgba(245, 158, 11, 0.3)' };
      case 'tube':
        return { primary: '#f43f5e', glow: 'rgba(244, 63, 94, 0.35)' };
      case 'transformer':
        return { primary: '#06b6d4', glow: 'rgba(6, 182, 212, 0.3)' };
    }
  }, [character]);

  // Continuous drive-based parameters
  const bounceY = -audioPeak * 4 * (0.3 + drive * 0.7);
  const headTilt = (drive - 0.5) * 3;

  // Eye crossfade
  const caretOpacity = Math.max(0, Math.min(1, 1 - (drive - 0.3) * 3));
  const heartOpacity = Math.max(0, Math.min(1, (drive - 0.3) * 3));
  const heartScale = 0.55 + drive * 0.2;

  // Mouth opening
  const mouthOpen = Math.max(0, (drive - 0.12) / 0.88); // 0 to 1
  const mouthW = 14 + mouthOpen * 16;
  const mouthH = 4 + mouthOpen * 20;

  // Rainbow stream
  const streamProgress = Math.max(0, (drive - 0.08) / 0.92);
  const streamLen = streamProgress * 120;
  const streamWidth = 20 + streamProgress * 40;
  const sWave = streamProgress * 14 + audioPeak * 8 * drive;

  // Blush intensity
  const blushOpacity = Math.min(1, drive * 1.5);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        userSelect: 'none',
      }}
    >
      <svg
        width="280"
        height="300"
        viewBox="0 0 280 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Smooth vertical rainbow gradient for the stream fill */}
          <linearGradient id="satStreamRainbow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="16%" stopColor="#f97316" />
            <stop offset="32%" stopColor="#facc15" />
            <stop offset="48%" stopColor="#22c55e" />
            <stop offset="64%" stopColor="#38bdf8" />
            <stop offset="80%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>

          {/* Soft edge blur for the rainbow stream */}
          <filter id="softRainbow" x="-15%" y="-10%" width="130%" height="120%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>

          {/* Subtle outer glow for the stream */}
          <filter id="rainbowGlow" x="-25%" y="-15%" width="150%" height="130%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
          </filter>

          {/* Head shadow */}
          <filter id="headShadow" x="-10%" y="-5%" width="120%" height="120%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.08)" />
          </filter>
        </defs>

        {/* ================================================================
            RAINBOW WATERFALL — Smooth soft-edged gradient flow from mouth
            ================================================================ */}
        {streamProgress > 0.03 && (() => {
          // Origin: flows out of the mouth opening, cascading down-right
          const originX = 110;
          const originY = 128 + mouthH * 0.6;

          // S-curve bezier control points flowing down and sweeping right
          const cp1x = originX + 5;
          const cp1y = originY + streamLen * 0.3;
          const cp2x = originX + 30 + sWave;
          const cp2y = originY + streamLen * 0.65;
          const endX = originX + 50 + sWave * 1.4;
          const endY = originY + streamLen;

          // Build a wide filled shape by offsetting the center path
          const hw = streamWidth / 2; // half-width

          return (
            <g opacity={0.85 + drive * 0.15}>
              {/* Outer soft glow layer */}
              <path
                d={`
                  M ${originX - hw * 0.7} ${originY}
                  C ${cp1x - hw * 0.8} ${cp1y}, ${cp2x - hw * 1.1} ${cp2y}, ${endX - hw * 1.3} ${endY}
                  L ${endX + hw * 1.3} ${endY}
                  C ${cp2x + hw * 1.1} ${cp2y}, ${cp1x + hw * 0.8} ${cp1y}, ${originX + hw * 0.7} ${originY}
                  Z
                `}
                fill="url(#satStreamRainbow)"
                opacity={0.25 * streamProgress}
                filter="url(#rainbowGlow)"
              />

              {/* Main smooth rainbow body */}
              <path
                d={`
                  M ${originX - hw * 0.4} ${originY}
                  C ${cp1x - hw * 0.5} ${cp1y}, ${cp2x - hw * 0.7} ${cp2y}, ${endX - hw} ${endY}
                  L ${endX + hw} ${endY}
                  C ${cp2x + hw * 0.7} ${cp2y}, ${cp1x + hw * 0.5} ${cp1y}, ${originX + hw * 0.4} ${originY}
                  Z
                `}
                fill="url(#satStreamRainbow)"
                filter="url(#softRainbow)"
              />

              {/* Bright inner highlight core */}
              <path
                d={`
                  M ${originX - hw * 0.15} ${originY + 2}
                  C ${cp1x - hw * 0.15} ${cp1y}, ${cp2x - hw * 0.2} ${cp2y}, ${endX - hw * 0.3} ${endY}
                  L ${endX + hw * 0.3} ${endY}
                  C ${cp2x + hw * 0.2} ${cp2y}, ${cp1x + hw * 0.15} ${cp1y}, ${originX + hw * 0.15} ${originY + 2}
                  Z
                `}
                fill="white"
                opacity={0.2 + drive * 0.15}
                filter="url(#softRainbow)"
              />
            </g>
          );
        })()}

        {/* ================================================================
            CHARACTER — Cute doodle-style young guy matching hand-drawn art
            ================================================================ */}
        <g
          transform={`translate(110, 100) rotate(${headTilt}) translate(-110, -100) translate(0, ${bounceY})`}
          filter="url(#headShadow)"
        >
          {/* --- Spiky / Messy Hair (top crown) --- */}
          {/* Multiple overlapping rounded bumps creating the fluffy/spiky look */}
          <path
            d="
              M 72 78
              C 62 68, 58 48, 68 36
              C 74 26, 86 22, 96 18
              C 106 14, 118 16, 126 22
              C 136 16, 148 20, 154 30
              C 164 38, 164 56, 156 68
              C 152 76, 148 78, 144 80
            "
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Hair detail lines (gives it that hand-drawn messy feel) */}
          <path d="M 82 40 Q 90 34 98 42" stroke="#18181B" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M 108 30 Q 118 24 128 34" stroke="#18181B" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M 138 36 Q 146 30 152 40" stroke="#18181B" strokeWidth="1.8" strokeLinecap="round" fill="none" />

          {/* --- Side hair / sideburn wisps --- */}
          <path
            d="M 72 78 C 64 86, 58 102, 62 118 C 58 128, 64 138, 72 138"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* --- Main Face (rounded egg / bean shape) --- */}
          <path
            d="
              M 72 78
              C 70 110, 78 140, 110 142
              C 142 140, 150 110, 148 78
            "
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3"
            strokeLinejoin="round"
          />

          {/* --- Left Ear --- */}
          <ellipse cx="72" cy="98" rx="7" ry="10" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.5" />

          {/* --- Right Ear --- */}
          <ellipse cx="148" cy="98" rx="7" ry="10" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.5" />

          {/* =========== FACIAL FEATURES =========== */}

          {/* --- Cheek Blush (cute pink ovals, not harsh slashes) --- */}
          <ellipse
            cx="84"
            cy="112"
            rx={8 + drive * 3}
            ry={5 + drive * 2}
            fill="#ff8da1"
            opacity={blushOpacity * 0.5}
          />
          <ellipse
            cx="136"
            cy="112"
            rx={8 + drive * 3}
            ry={5 + drive * 2}
            fill="#ff8da1"
            opacity={blushOpacity * 0.5}
          />

          {/* --- EYES: Happy Carets ^ ^ (Low Drive) --- */}
          {caretOpacity > 0.01 && (
            <g
              stroke="#18181B"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={caretOpacity}
            >
              <polyline points="86,100 92,88 98,100" />
              <polyline points="122,100 128,88 134,100" />
            </g>
          )}

          {/* --- EYES: Heart Eyes (High Drive) --- */}
          {heartOpacity > 0.01 && (
            <g opacity={heartOpacity}>
              {/* Left Eye */}
              <ellipse cx="92" cy="94" rx="10" ry="14" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.5" />
              <g transform={`translate(92, 94) scale(${heartScale}) translate(-92, -94)`}>
                <path
                  d="M 92 91 C 92 87 88 84 85 86 C 82 88 82 92 85 95 L 92 101 L 99 95 C 102 92 102 88 99 86 C 96 84 92 87 92 91 Z"
                  fill="#ff007f"
                  stroke="#18181B"
                  strokeWidth="1.5"
                />
              </g>

              {/* Right Eye */}
              <ellipse cx="128" cy="94" rx="10" ry="14" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.5" />
              <g transform={`translate(128, 94) scale(${heartScale}) translate(-128, -94)`}>
                <path
                  d="M 128 91 C 128 87 124 84 121 86 C 118 88 118 92 121 95 L 128 101 L 135 95 C 138 92 138 88 135 86 C 132 84 128 87 128 91 Z"
                  fill="#ff007f"
                  stroke="#18181B"
                  strokeWidth="1.5"
                />
              </g>
            </g>
          )}

          {/* --- MOUTH --- */}
          {mouthOpen <= 0.06 ? (
            // Small closed happy smile (D-shape from doodle)
            <path
              d="M 102 118 Q 110 128 118 118"
              stroke="#18181B"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            // Wide open mouth — the rainbow pours out of here!
            <g>
              <rect
                x={110 - mouthW / 2}
                y={118}
                width={mouthW}
                height={mouthH}
                rx="4"
                fill="#18181B"
                stroke="#18181B"
                strokeWidth="2"
              />
              {/* Cute top teeth row */}
              <rect
                x={110 - mouthW / 2 + 3}
                y={119}
                width={mouthW - 6}
                height={Math.min(5, mouthH * 0.3)}
                rx="1.5"
                fill="#FFFFFF"
              />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
};
