import React, { useState, useCallback, useRef, useEffect } from 'react';

/**
 * EQ Plugin Panel — Parametric EQ interface inspired by SonoDS EQ standalone plugin.
 * Features: interactive frequency curve, draggable band handles, per-band controls, presets, bypass, and reset.
 */

const BANDS = [
  { id: 'low', label: 'LOW', freq: 120, color: '#34d399', defaultGain: 0 },
  { id: 'mid', label: 'MID', freq: 1500, color: '#fbbf24', defaultGain: 0 },
  { id: 'high', label: 'HIGH', freq: 8000, color: '#60a5fa', defaultGain: 0 },
];

const PRESETS = {
  flat: { low: 0, mid: 0, high: 0, label: 'Flat' },
  warmth: { low: 3, mid: -1, high: -2, label: 'Warmth' },
  presence: { low: -1, mid: 2, high: 4, label: 'Presence' },
  scoop: { low: 3, mid: -4, high: 3, label: 'Mid Scoop' },
  brightness: { low: -2, mid: 0, high: 5, label: 'Brightness' },
  telephone: { low: -12, mid: 6, high: -10, label: 'Telephone' },
};

// Frequency range for the curve canvas
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const GAIN_RANGE = 18; // ±18 dB

const freqToX = (freq, width) => {
  const logMin = Math.log10(FREQ_MIN);
  const logMax = Math.log10(FREQ_MAX);
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width;
};

const gainToY = (gain, height) => {
  return height / 2 - (gain / GAIN_RANGE) * (height / 2);
};

const yToGain = (y, height) => {
  return -((y - height / 2) / (height / 2)) * GAIN_RANGE;
};

// Interactive Knob
const PluginKnob = ({ label, value, min, max, unit = 'dB', onChange, color = '#34d399', size = 40 }) => {
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
      onChange(Math.round(newVal * 10) / 10);
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
        {value > 0 && unit === 'dB' ? `+${value}` : value}
        {unit}
      </span>
    </div>
  );
};

export const EqPluginPanel = ({
  stemId,
  trackName = 'Track 1',
  stemName,
  fxData = {},
  fxSettings,
  onUpdateFx,
  onClose,
  width = 640,
}) => {
  const effectiveFx = fxData?.eq ? fxData : fxSettings || {};
  const initialEq = effectiveFx?.eq || { low: 0, mid: 0, high: 0 };

  const [eq, setEq] = useState(initialEq);
  const [draggingBand, setDraggingBand] = useState(null);
  const [hoveredBand, setHoveredBand] = useState(null);
  const [isBypassed, setIsBypassed] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('flat');

  const canvasRef = useRef(null);

  const displayTrackName = trackName || stemName || 'Track 1';

  // Sync state upward when parameters change
  const syncEq = useCallback(
    (newEq) => {
      setEq(newEq);
      if (onUpdateFx) {
        onUpdateFx(stemId, { eq: newEq });
      }
    },
    [stemId, onUpdateFx]
  );

  const applyPreset = (presetId) => {
    const preset = PRESETS[presetId];
    if (!preset) return;
    setSelectedPreset(presetId);
    const newEq = { low: preset.low, mid: preset.mid, high: preset.high };
    syncEq(newEq);
  };

  const handleBandGainChange = (bandId, value) => {
    setSelectedPreset('custom');
    const newEq = { ...eq, [bandId]: value };
    syncEq(newEq);
  };

  const handleReset = () => {
    setSelectedPreset('flat');
    setIsBypassed(false);
    syncEq({ low: 0, mid: 0, high: 0 });
  };

  // Draw the EQ curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;

    // Horizontal lines (gain)
    for (let db = -GAIN_RANGE; db <= GAIN_RANGE; db += 6) {
      const y = gainToY(db, h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Vertical lines (frequency)
    [100, 1000, 10000].forEach((f) => {
      const x = freqToX(f, w);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });

    // Zero line
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw combined EQ curve
    const bandData = BANDS.map((b) => ({
      ...b,
      gain: eq[b.id] || 0,
    }));

    // Compute combined response at each pixel
    const points = [];
    for (let px = 0; px < w; px++) {
      const logFreq = (px / w) * (Math.log10(FREQ_MAX) - Math.log10(FREQ_MIN)) + Math.log10(FREQ_MIN);
      const freq = Math.pow(10, logFreq);
      let totalGain = 0;
      bandData.forEach((band) => {
        const logDist = Math.log10(freq) - Math.log10(band.freq);
        const q = 1.0;
        const bw = 1.0 / q;
        const response = band.gain * Math.exp(-(logDist * logDist) / (2 * bw * bw * 0.15));
        totalGain += response;
      });
      totalGain = Math.max(-GAIN_RANGE, Math.min(GAIN_RANGE, totalGain));
      points.push({ x: px, y: gainToY(isBypassed ? 0 : totalGain, h) });
    }

    // Fill under curve
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, isBypassed ? 'rgba(148,163,184,0.06)' : 'rgba(16,185,129,0.08)');
    gradient.addColorStop(0.5, 'rgba(16,185,129,0)');
    gradient.addColorStop(1, isBypassed ? 'rgba(148,163,184,0.06)' : 'rgba(16,185,129,0.08)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(w, h / 2);
    ctx.closePath();
    ctx.fill();

    // Draw curve line
    ctx.strokeStyle = isBypassed ? '#94a3b8' : '#10b981';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Draw band handles
    if (!isBypassed) {
      bandData.forEach((band, i) => {
        const cx = freqToX(band.freq, w);
        const cy = gainToY(band.gain, h);
        const isHovered = hoveredBand === i;
        const isDragging = draggingBand === i;
        const radius = isHovered || isDragging ? 8 : 6;

        // Glow
        ctx.shadowColor = band.color;
        ctx.shadowBlur = isHovered || isDragging ? 12 : 6;

        // Circle
        ctx.fillStyle = band.color;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // White center
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Frequency label below handle
        ctx.fillStyle = '#64748b';
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.textAlign = 'center';
        const freqLabel = band.freq >= 1000 ? `${(band.freq / 1000).toFixed(1)}k` : `${band.freq}`;
        ctx.fillText(freqLabel, cx, h - 6);
      });
    }
  }, [eq, isBypassed, hoveredBand, draggingBand]);

  // Handle mouse interactions on the curve canvas
  const handleCanvasMouseDown = (e) => {
    if (isBypassed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (let i = 0; i < BANDS.length; i++) {
      const band = BANDS[i];
      const cx = freqToX(band.freq, canvas.width);
      const cy = gainToY(eq[band.id] || 0, canvas.height);
      const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
      if (dist < 15) {
        setDraggingBand(i);
        return;
      }
    }
  };

  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    if (draggingBand !== null) {
      const newGain = yToGain(my, canvas.height);
      const clamped = Math.round(Math.max(-GAIN_RANGE, Math.min(GAIN_RANGE, newGain)) * 10) / 10;
      handleBandGainChange(BANDS[draggingBand].id, clamped);
      return;
    }

    // Hover detection
    let found = null;
    for (let i = 0; i < BANDS.length; i++) {
      const band = BANDS[i];
      const cx = freqToX(band.freq, canvas.width);
      const cy = gainToY(eq[band.id] || 0, canvas.height);
      const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
      if (dist < 15) {
        found = i;
        break;
      }
    }
    setHoveredBand(found);
  };

  const handleCanvasMouseUp = () => {
    setDraggingBand(null);
  };

  useEffect(() => {
    if (draggingBand !== null) {
      document.addEventListener('mouseup', handleCanvasMouseUp);
      return () => {
        document.removeEventListener('mouseup', handleCanvasMouseUp);
      };
    }
  }, [draggingBand]);

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
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '-0.2px', color: '#0f172a' }}>
            SONODS PARAMETRIC EQ
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
            {displayTrackName}
          </span>
        </div>

        {/* Status + Bypass + Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setIsBypassed(!isBypassed)}
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

      {/* --- Mode & Preset Bar --- */}
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
        <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
          3-BAND PARAMETRIC FILTER (LOW SHELF / PEAK / HIGH SHELF)
        </span>

        <select
          value={selectedPreset}
          onChange={(e) => applyPreset(e.target.value)}
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
          {Object.entries(PRESETS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
          {selectedPreset === 'custom' && <option value="custom">Custom</option>}
        </select>
      </div>

      {/* --- Interactive EQ Curve Canvas --- */}
      <div style={{ padding: '12px 16px', background: '#ffffff' }}>
        <div
          style={{
            height: '140px',
            background: '#f8fafc',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            cursor: draggingBand !== null ? 'ns-resize' : hoveredBand !== null ? 'grab' : 'default',
            position: 'relative',
          }}
        >
          <canvas
            ref={canvasRef}
            width={600}
            height={140}
            style={{ width: '100%', height: '100%', display: 'block' }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoveredBand(null)}
          />
        </div>
      </div>

      {/* --- Band Knobs --- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
        }}
      >
        {BANDS.map((band) => (
          <div key={band.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <PluginKnob
              label={`${band.label} GAIN`}
              value={eq[band.id] ?? 0}
              min={-GAIN_RANGE}
              max={GAIN_RANGE}
              unit=" dB"
              color={band.color}
              onChange={(v) => handleBandGainChange(band.id, v)}
            />
            <span
              style={{
                fontSize: '8px',
                color: '#94a3b8',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
              }}
            >
              {band.freq >= 1000 ? `${(band.freq / 1000).toFixed(1)} kHz` : `${band.freq} Hz`}
            </span>
          </div>
        ))}
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
        <span>DSP: Biquad Parametric Filter Matrix</span>
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

export default EqPluginPanel;
