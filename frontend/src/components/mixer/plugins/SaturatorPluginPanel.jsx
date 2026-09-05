import React, { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Saturator Plugin Panel — Rich saturator interface inspired by SonoDS Saturator standalone.
 * Features: expressive animated character face, non-linear transfer curve, harmonic visualizer,
 * Drive/Tone/Mix/Output knobs, character modes (Tape, Tube, Transformer), presets, and bypass.
 */

const PRESETS = [
  { id: 'tape-glue', name: 'Tape Master Glue', drive: 22, tone: 1.5, char: 'tape', mix: 100, outGain: 0, autoGain: true },
  { id: 'tube-heat', name: 'Warm Tube Heat', drive: 45, tone: -2.0, char: 'tube', mix: 85, outGain: -1.0, autoGain: true },
  { id: 'iron-punch', name: 'Iron Core Punch', drive: 38, tone: 3.0, char: 'transformer', mix: 100, outGain: 0, autoGain: false },
  { id: 'subtle-air', name: 'Subtle Vocal Air', drive: 15, tone: 4.5, char: 'tape', mix: 60, outGain: 0, autoGain: true },
  { id: 'heavy-drive', name: 'Heavy Crunch', drive: 75, tone: 0.0, char: 'tube', mix: 100, outGain: -3.5, autoGain: false },
];

const PluginKnob = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  color = '#f59e0b',
  size = 40,
  formatter,
}) => {
  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startVal = value;
    const range = max - min;

    const handleMouseMove = (moveEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const sensitivity = range / 140;
      let newVal = startVal + deltaY * sensitivity;
      newVal = Math.max(min, Math.min(max, newVal));
      if (step >= 1) {
        newVal = Math.round(newVal);
      } else {
        newVal = Math.round(newVal * 10) / 10;
      }
      onChange(newVal);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const norm = (value - min) / (max - min);
  const rotation = Math.max(0, Math.min(1, norm)) * 270 - 135;
  const displayVal = formatter ? formatter(value) : `${value}${unit}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', userSelect: 'none' }}>
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: 'linear-gradient(145deg, #f1f5f9, #e2e8f0)',
          border: '1px solid rgba(0,0,0,0.1)',
          position: 'relative',
          cursor: 'ns-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08), inset 0 1px 1px rgba(255,255,255,0.8)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: '65%',
            height: '65%',
            borderRadius: '50%',
            background: '#fff',
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.05s ease-out',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '2px',
              height: '7px',
              background: color,
              borderRadius: '1px',
              marginTop: '3px',
              boxShadow: `0 0 4px ${color}`,
            }}
          />
        </div>
      </div>
      <span
        style={{
          fontSize: '8px',
          fontWeight: 700,
          color: '#64748b',
          letterSpacing: '0.5px',
          fontFamily: "'JetBrains Mono', monospace",
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '8px',
          color: '#334155',
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 600,
        }}
      >
        {displayVal}
      </span>
    </div>
  );
};

export const SaturatorPluginPanel = ({
  stemId,
  trackName = 'Track 1',
  fxData = {},
  onUpdateFx,
  onClose,
  width = 640,
}) => {
  const initialSat = typeof fxData?.sat === 'number' ? fxData.sat : 0;
  const [drive, setDrive] = useState(initialSat > 0 ? Math.round(initialSat * 100) : 25);
  const [char, setChar] = useState('tape');
  const [tone, setTone] = useState(0);
  const [mix, setMix] = useState(100);
  const [outGain, setOutGain] = useState(0);
  const [autoGain, setAutoGain] = useState(true);
  const [isBypassed, setIsBypassed] = useState(false);
  const [audioPeak, setAudioPeak] = useState(0);

  const canvasRef = useRef(null);

  // Sync state upward when parameters change
  const syncParams = useCallback(
    (newParams) => {
      const satNormalized = (newParams.drive ?? drive) / 100;
      if (onUpdateFx) {
        onUpdateFx(stemId, {
          sat: isBypassed ? 0 : satNormalized,
          saturator: {
            drive: newParams.drive ?? drive,
            char: newParams.char ?? char,
            tone: newParams.tone ?? tone,
            mix: newParams.mix ?? mix,
            outGain: newParams.outGain ?? outGain,
            autoGain: newParams.autoGain ?? autoGain,
            ...newParams,
          },
        });
      }
    },
    [stemId, onUpdateFx, drive, char, tone, mix, outGain, autoGain, isBypassed]
  );

  // Character colors & themes
  const charAccent =
    char === 'tape' ? '#f59e0b' : char === 'tube' ? '#f43f5e' : '#06b6d4';

  // Real-time animation simulation for peak/character face
  useEffect(() => {
    let animId;
    const animate = () => {
      const basePulse = Math.sin(Date.now() / 200) * 0.5 + 0.5;
      const intensity = (drive / 100) * (isBypassed ? 0 : 0.85);
      setAudioPeak(intensity * (0.3 + 0.7 * basePulse));
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animId);
  }, [drive, isBypassed]);

  // Draw Transfer Curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Linear reference (dashed)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Transfer curve function based on character and drive
    ctx.strokeStyle = isBypassed ? '#94a3b8' : charAccent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    const d = (drive / 100) * 4 + 1; // Drive scaling
    const steps = 100;

    for (let i = 0; i <= steps; i++) {
      const normX = (i / steps) * 2 - 1; // -1 to +1
      let normY = normX;

      if (!isBypassed) {
        if (char === 'tape') {
          // Soft saturation (tanh style)
          normY = Math.tanh(normX * d) / Math.tanh(d);
        } else if (char === 'tube') {
          // Asymmetric tube saturation
          if (normX >= 0) {
            normY = (1 - Math.exp(-normX * d)) / (1 - Math.exp(-d));
          } else {
            normY = -Math.tanh(-normX * d * 0.75) / Math.tanh(d * 0.75);
          }
        } else {
          // Transformer / Iron (harder knee with subtle hysteresis)
          normY = Math.sign(normX) * (1 - Math.exp(-Math.abs(normX * d))) / (1 - Math.exp(-d));
        }
      }

      const screenX = (normX + 1) * 0.5 * w;
      const screenY = (1 - (normY + 1) * 0.5) * h;

      if (i === 0) {
        ctx.moveTo(screenX, screenY);
      } else {
        ctx.lineTo(screenX, screenY);
      }
    }
    ctx.stroke();
  }, [drive, char, charAccent, isBypassed]);

  const applyPreset = (p) => {
    setDrive(p.drive);
    setTone(p.tone);
    setChar(p.char);
    setMix(p.mix);
    setOutGain(p.outGain);
    setAutoGain(p.autoGain);
    syncParams({
      drive: p.drive,
      tone: p.tone,
      char: p.char,
      mix: p.mix,
      outGain: p.outGain,
      autoGain: p.autoGain,
    });
  };

  const handleReset = () => {
    setDrive(25);
    setTone(0);
    setChar('tape');
    setMix(100);
    setOutGain(0);
    setAutoGain(true);
    setIsBypassed(false);
    syncParams({ drive: 25, tone: 0, char: 'tape', mix: 100, outGain: 0, autoGain: true });
  };

  return (
    <div
      style={{
        width: `${width}px`,
        maxWidth: '100%',
        borderRadius: '16px',
        background: '#ffffff',
        border: '1px solid rgba(0, 0, 0, 0.12)',
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* --- Top Header Bar --- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: charAccent }} />
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '-0.2px', color: '#0f172a' }}>
            SONODS SATURATOR
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: '#e2e8f0',
              padding: '2px 6px',
              borderRadius: '4px',
              color: '#475569',
            }}
          >
            {trackName}
          </span>
        </div>

        {/* Status + Bypass + Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '3px 8px',
              borderRadius: '6px',
              background: drive > 50 ? `${charAccent}15` : '#f1f5f9',
              border: drive > 50 ? `1px solid ${charAccent}40` : '1px solid #e2e8f0',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              color: drive > 50 ? charAccent : '#64748b',
              minWidth: '78px',
              textAlign: 'center',
            }}
          >
            DRIVE: {drive}%
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !isBypassed;
              setIsBypassed(next);
              syncParams({ drive: next ? 0 : drive });
            }}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid #cbd5e1',
              background: isBypassed ? '#fef2f2' : '#ffffff',
              color: isBypassed ? '#ef4444' : '#64748b',
            }}
          >
            {isBypassed ? 'BYPASS ON' : 'ACTIVE'}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: '14px',
                fontWeight: 700,
                lineHeight: 1,
                padding: '2px 4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* --- Character Mode Switcher --- */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f8fafc',
          padding: '6px 16px',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '6px', gap: '2px' }}>
          {[
            { id: 'tape', label: 'WARMTH (Tape)', color: '#f59e0b' },
            { id: 'tube', label: 'GLOW (Tube)', color: '#f43f5e' },
            { id: 'transformer', label: 'IRON (Core)', color: '#06b6d4' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setChar(m.id);
                syncParams({ char: m.id });
              }}
              style={{
                background: char === m.id ? '#ffffff' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '9px',
                fontWeight: 700,
                color: char === m.id ? m.color : '#64748b',
                cursor: 'pointer',
                boxShadow: char === m.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Preset quick picker */}
        <select
          aria-label="Saturator Presets"
          onChange={(e) => {
            const preset = PRESETS.find((p) => p.id === e.target.value);
            if (preset) applyPreset(preset);
          }}
          defaultValue=""
          style={{
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: 600,
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          <option value="" disabled>
            Presets...
          </option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* --- Middle Visual Area: Character Face & Transfer Curve & Harmonics --- */}
      <div style={{ display: 'flex', gap: '12px', padding: '12px 16px', background: '#ffffff', alignItems: 'center' }}>
        {/* Animated Character Face (Signature SonoDS visual element) */}
        <div
          style={{
            width: '100px',
            height: '110px',
            background: `radial-gradient(circle at 50% 40%, ${charAccent}12, #f8fafc)`,
            borderRadius: '12px',
            border: `1.5px solid ${charAccent}30`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            boxShadow: `inset 0 0 20px ${charAccent}10`,
          }}
        >
          {/* Eyes */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
            <div
              style={{
                width: '8px',
                height: `${8 + audioPeak * 6}px`,
                borderRadius: '4px',
                background: charAccent,
                transition: 'height 0.08s ease',
              }}
            />
            <div
              style={{
                width: '8px',
                height: `${8 + audioPeak * 6}px`,
                borderRadius: '4px',
                background: charAccent,
                transition: 'height 0.08s ease',
              }}
            />
          </div>

          {/* Mouth (reacts dynamically to drive and signal level) */}
          <div
            style={{
              width: `${24 + audioPeak * 16}px`,
              height: `${6 + audioPeak * 10}px`,
              borderRadius: char === 'tube' ? '0 0 12px 12px' : '8px',
              border: `2px solid ${charAccent}`,
              background: drive > 60 ? `${charAccent}40` : 'transparent',
              transition: 'all 0.08s ease',
            }}
          />

          <span
            style={{
              position: 'absolute',
              bottom: '4px',
              fontSize: '8px',
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              color: charAccent,
              textTransform: 'uppercase',
            }}
          >
            {char}
          </span>
        </div>

        {/* Transfer curve canvas */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            height: '110px',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          <canvas ref={canvasRef} width={260} height={110} style={{ width: '100%', height: '100%' }} />
          <div
            style={{
              position: 'absolute',
              bottom: '4px',
              left: '8px',
              fontSize: '8px',
              color: '#94a3b8',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Transfer Profile
          </div>
        </div>

        {/* Harmonic Generator Visualizer */}
        <div
          style={{
            width: '80px',
            height: '110px',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontSize: '7px', fontWeight: 700, color: '#64748b', textAlign: 'center' }}>
            HARMONICS
          </span>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '65px' }}>
            {[
              { label: 'f0', level: 1.0 },
              { label: '2nd', level: char === 'tube' ? 0.8 : 0.3 },
              { label: '3rd', level: char === 'tape' ? 0.75 : 0.4 },
              { label: '4th', level: 0.25 },
            ].map((h, i) => {
              const barHeight = isBypassed ? 10 : Math.min(100, h.level * (drive / 100) * 100 + 10);
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <div
                    style={{
                      width: '8px',
                      height: `${barHeight * 0.55}px`,
                      background: `linear-gradient(to top, ${charAccent}, #fde68a)`,
                      borderRadius: '2px',
                      transition: 'height 0.1s ease',
                    }}
                  />
                  <span style={{ fontSize: '6px', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                    {h.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- Controls Section: Knobs --- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '8px',
          padding: '12px 16px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          alignItems: 'center',
        }}
      >
        <PluginKnob
          label="DRIVE"
          value={drive}
          min={0}
          max={100}
          step={1}
          unit="%"
          color={charAccent}
          onChange={(v) => {
            setDrive(v);
            syncParams({ drive: v });
          }}
        />

        <PluginKnob
          label="TONE / TILT"
          value={tone}
          min={-12}
          max={12}
          step={0.5}
          unit=" dB"
          color="#3b82f6"
          onChange={(v) => {
            setTone(v);
            syncParams({ tone: v });
          }}
        />

        <PluginKnob
          label="OUTPUT"
          value={outGain}
          min={-18}
          max={18}
          step={0.5}
          unit=" dB"
          color="#10b981"
          onChange={(v) => {
            setOutGain(v);
            syncParams({ outGain: v });
          }}
        />

        <PluginKnob
          label="MIX"
          value={mix}
          min={0}
          max={100}
          step={1}
          unit="%"
          color="#8b5cf6"
          onChange={(v) => {
            setMix(v);
            syncParams({ mix: v });
          }}
        />

        {/* Auto Gain Toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={() => {
              const next = !autoGain;
              setAutoGain(next);
              syncParams({ autoGain: next });
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid #cbd5e1',
              background: autoGain ? '#dbeafe' : '#ffffff',
              color: autoGain ? '#1d4ed8' : '#64748b',
              boxShadow: autoGain ? '0 1px 3px rgba(37,99,235,0.1)' : 'none',
            }}
          >
            AUTO GAIN
          </button>
          <span style={{ fontSize: '7px', color: '#94a3b8', textTransform: 'uppercase' }}>
            {autoGain ? 'ON (Compensated)' : 'OFF (Raw)'}
          </span>
        </div>
      </div>

      {/* --- Footer bar with Reset --- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 16px',
          background: '#ffffff',
          borderTop: '1px solid #f1f5f9',
          fontSize: '9px',
          color: '#94a3b8',
        }}
      >
        <span>DSP: Anti-Aliased ADAA Non-linear Waveshaper</span>
        <button
          type="button"
          onClick={handleReset}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: 600,
            textDecoration: 'underline',
          }}
        >
          Reset Defaults
        </button>
      </div>
    </div>
  );
};

export default SaturatorPluginPanel;
