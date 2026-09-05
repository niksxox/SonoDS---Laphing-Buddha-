import React, { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Compressor Plugin Panel — Rich compressor interface inspired by SonoDS Compressor standalone.
 * Features: live GR meter, interactive transfer curve canvas, character modes (VCA, Optical, FET),
 * Attack/Release/Threshold/Ratio/Knee/Makeup/Mix controls, factory presets, and bypass.
 */

const PRESETS = [
  { id: 'vocal-glue', name: 'Vocal Glue', thresh: -18, ratio: 3.5, attack: 15, release: 120, knee: 6, makeup: 3, char: 'optical' },
  { id: 'punchy-drums', name: 'Punchy Drums', thresh: -14, ratio: 4, attack: 30, release: 80, knee: 3, makeup: 4, char: 'fet' },
  { id: 'bass-control', name: 'Bass Control', thresh: -20, ratio: 4.5, attack: 10, release: 180, knee: 6, makeup: 3.5, char: 'fet' },
  { id: 'gentle-bus', name: 'Master Bus', thresh: -10, ratio: 2, attack: 40, release: 250, knee: 8, makeup: 1.5, char: 'vca' },
  { id: 'brickwall', name: 'Limiter', thresh: -6, ratio: 12, attack: 1, release: 50, knee: 0, makeup: 0, char: 'vca' },
];

const PluginKnob = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  color = '#ef4444',
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

export const CompressorPluginPanel = ({
  stemId,
  trackName = 'Track 1',
  fxData = {},
  onUpdateFx,
  onClose,
  width = 640,
}) => {
  const comp = fxData?.comp || {};
  const [thresh, setThresh] = useState(comp.thresh ?? -16);
  const [ratio, setRatio] = useState(comp.ratio ?? 4);
  const [attack, setAttack] = useState(comp.attack ?? 20);
  const [release, setRelease] = useState(comp.release ?? 120);
  const [knee, setKnee] = useState(comp.knee ?? 6);
  const [makeup, setMakeup] = useState(comp.makeup ?? 0);
  const [mix, setMix] = useState(comp.mix ?? 100);
  const [char, setChar] = useState(comp.char || 'vca');
  const [isBypassed, setIsBypassed] = useState(false);
  const [gainReduction, setGainReduction] = useState(0);

  const canvasRef = useRef(null);

  // Sync state upward when parameters change
  const syncParams = useCallback(
    (newParams) => {
      if (onUpdateFx) {
        onUpdateFx(stemId, {
          comp: {
            thresh,
            ratio,
            attack,
            release,
            knee,
            makeup,
            mix,
            char,
            ...newParams,
          },
        });
      }
    },
    [stemId, onUpdateFx, thresh, ratio, attack, release, knee, makeup, mix, char]
  );

  // Simulate dynamic gain reduction meter response
  useEffect(() => {
    let animId;
    let currentGR = 0;
    const updateMeter = () => {
      // Estimate GR based on threshold & ratio
      const estimatedMaxGR = Math.max(0, (-thresh - 6) * (1 - 1 / ratio) * 0.45);
      const targetGR = isBypassed ? 0 : estimatedMaxGR * (0.5 + 0.5 * Math.sin(Date.now() / 250));
      currentGR += (targetGR - currentGR) * 0.2;
      setGainReduction(Math.max(0, currentGR));
      animId = requestAnimationFrame(updateMeter);
    };
    updateMeter();
    return () => cancelAnimationFrame(animId);
  }, [thresh, ratio, isBypassed]);

  // Draw Transfer Curve Canvas
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
    for (let db = -60; db <= 0; db += 12) {
      const x = ((db + 60) / 60) * w;
      const y = h - ((db + 60) / 60) * h;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 1:1 Unity reference line (dashed)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Transfer curve
    ctx.strokeStyle = isBypassed ? '#94a3b8' : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    const threshX = ((thresh + 60) / 60) * w;
    const threshY = h - ((thresh + 60) / 60) * h;

    ctx.moveTo(0, h);
    ctx.lineTo(threshX, threshY);

    // Compression line above threshold
    const endInputDb = 0;
    const endOverDb = endInputDb - thresh;
    const endOutputDb = thresh + endOverDb / ratio + makeup;
    const endX = w;
    const endY = h - ((Math.min(0, endOutputDb) + 60) / 60) * h;

    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Knee curve smoothing
    if (knee > 0 && threshX > 10 && threshX < w - 10) {
      ctx.fillStyle = isBypassed ? 'rgba(148, 163, 184, 0.15)' : 'rgba(239, 68, 68, 0.12)';
      ctx.beginPath();
      ctx.arc(threshX, threshY, 6 + knee, 0, Math.PI * 2);
      ctx.fill();
    }

    // Threshold point dot
    ctx.fillStyle = isBypassed ? '#64748b' : '#dc2626';
    ctx.beginPath();
    ctx.arc(threshX, threshY, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [thresh, ratio, knee, makeup, isBypassed]);

  const applyPreset = (p) => {
    setThresh(p.thresh);
    setRatio(p.ratio);
    setAttack(p.attack);
    setRelease(p.release);
    setKnee(p.knee);
    setMakeup(p.makeup);
    setChar(p.char);
    syncParams({
      thresh: p.thresh,
      ratio: p.ratio,
      attack: p.attack,
      release: p.release,
      knee: p.knee,
      makeup: p.makeup,
      char: p.char,
    });
  };

  const handleReset = () => {
    setThresh(-16);
    setRatio(4);
    setAttack(20);
    setRelease(120);
    setKnee(6);
    setMakeup(0);
    setMix(100);
    setChar('vca');
    setIsBypassed(false);
    syncParams({ thresh: -16, ratio: 4, attack: 20, release: 120, knee: 6, makeup: 0, mix: 100, char: 'vca' });
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
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '-0.2px', color: '#0f172a' }}>
            SONODS COMPRESSOR
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

        {/* GR badge + Traffic Lights */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '3px 8px',
              borderRadius: '6px',
              background: gainReduction > 0.5 ? 'rgba(239, 68, 68, 0.1)' : '#f1f5f9',
              border: gainReduction > 0.5 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #e2e8f0',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              color: gainReduction > 0.5 ? '#dc2626' : '#64748b',
              minWidth: '78px',
              textAlign: 'center',
            }}
          >
            GR: -{gainReduction.toFixed(1)} dB
          </div>

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
            { id: 'vca', label: 'VCA (Fast/Punchy)' },
            { id: 'optical', label: 'OPTICAL (Smooth)' },
            { id: 'fet', label: 'FET (Aggressive)' },
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
                color: char === m.id ? '#0f172a' : '#64748b',
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
          aria-label="Compressor Presets"
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

      {/* --- Middle Visual Area: Transfer Curve & Gain Reduction Meter Bar --- */}
      <div style={{ display: 'flex', gap: '12px', padding: '12px 16px', background: '#ffffff' }}>
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
          <canvas ref={canvasRef} width={380} height={110} style={{ width: '100%', height: '100%' }} />
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
            IN: -60 dB to 0 dB
          </div>
          <div
            style={{
              position: 'absolute',
              top: '4px',
              right: '8px',
              fontSize: '8px',
              color: '#94a3b8',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            OUT: -60 dB to 0 dB
          </div>
        </div>

        {/* Gain Reduction Vertical Bar Meter */}
        <div
          style={{
            width: '40px',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '6px 4px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '7px', fontWeight: 700, color: '#ef4444' }}>GR</span>
          <div
            style={{
              width: '10px',
              flex: 1,
              background: '#e2e8f0',
              borderRadius: '3px',
              margin: '4px 0',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: `${Math.min(100, (gainReduction / 18) * 100)}%`,
                background: 'linear-gradient(to bottom, #ef4444, #f87171)',
                transition: 'height 0.05s ease-out',
                borderRadius: '3px',
              }}
            />
          </div>
          <span
            style={{
              fontSize: '7px',
              fontFamily: "'JetBrains Mono', monospace",
              color: '#64748b',
            }}
          >
            -{gainReduction.toFixed(0)}
          </span>
        </div>
      </div>

      {/* --- Controls Section: Knobs --- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
          padding: '12px 16px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          alignItems: 'center',
        }}
      >
        <PluginKnob
          label="THRESH"
          value={thresh}
          min={-60}
          max={0}
          step={1}
          unit=" dB"
          color="#ef4444"
          onChange={(v) => {
            setThresh(v);
            syncParams({ thresh: v });
          }}
        />

        <PluginKnob
          label="RATIO"
          value={ratio}
          min={1}
          max={20}
          step={0.5}
          unit=":1"
          color="#ef4444"
          onChange={(v) => {
            setRatio(v);
            syncParams({ ratio: v });
          }}
        />

        <PluginKnob
          label="ATTACK"
          value={attack}
          min={0.1}
          max={100}
          step={0.5}
          unit="ms"
          color="#f97316"
          onChange={(v) => {
            setAttack(v);
            syncParams({ attack: v });
          }}
        />

        <PluginKnob
          label="RELEASE"
          value={release}
          min={10}
          max={1000}
          step={10}
          unit="ms"
          color="#f97316"
          onChange={(v) => {
            setRelease(v);
            syncParams({ release: v });
          }}
        />

        <PluginKnob
          label="KNEE"
          value={knee}
          min={0}
          max={18}
          step={1}
          unit=" dB"
          color="#eab308"
          onChange={(v) => {
            setKnee(v);
            syncParams({ knee: v });
          }}
        />

        <PluginKnob
          label="MAKEUP"
          value={makeup}
          min={-12}
          max={24}
          step={0.5}
          unit=" dB"
          color="#10b981"
          onChange={(v) => {
            setMakeup(v);
            syncParams({ makeup: v });
          }}
        />

        <PluginKnob
          label="MIX"
          value={mix}
          min={0}
          max={100}
          step={1}
          unit="%"
          color="#06b6d4"
          onChange={(v) => {
            setMix(v);
            syncParams({ mix: v });
          }}
        />
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
        <span>DSP: Dynamic Gain Computer + Envelope Follower</span>
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

export default CompressorPluginPanel;
