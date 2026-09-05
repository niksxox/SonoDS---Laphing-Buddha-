import React, { useEffect, useState, useCallback } from 'react';
import { SonodsCompressorNode, CompressorCharacterType, CompressorState } from '@sonods/comp-engine';
import { PressKnob } from './PressKnob.js';
import { CompressorLiveTimeline } from './CompressorLiveTimeline.js';
import { TrafficLights } from './TrafficLights.js';
import '../theme/tokens.css';

export interface SonodsCompressorPluginProps {
  node: SonodsCompressorNode;
  width?: number | string;
  trackName?: string;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

export const SonodsCompressorPlugin: React.FC<SonodsCompressorPluginProps> = ({
  node,
  width = 780,
  trackName = 'Track 1',
  onClose,
  onMinimize,
  onMaximize,
}) => {
  const [state, setState] = useState<CompressorState>(node.getState());
  const [gainReductionDb, setGainReductionDb] = useState(node.getCurrentGainReductionDb());
  const [isMinimized, setIsMinimized] = useState(false);
  const [isBypassed, setIsBypassed] = useState(false);
  const [activeMode, setActiveMode] = useState<'COMP' | 'LIMIT'>('COMP');

  useEffect(() => {
    const unsubState = node.subscribe((newState) => {
      setState(newState);
    });
    const unsubGr = node.subscribeGainReduction((gr) => {
      setGainReductionDb(gr);
    });

    return () => {
      unsubState();
      unsubGr();
    };
  }, [node]);

  const handleMinimizeAction = useCallback(() => {
    if (onMinimize) {
      onMinimize();
    } else {
      setIsMinimized((prev) => !prev);
    }
  }, [onMinimize]);

  const handleMaximizeAction = useCallback(() => {
    if (onMaximize) {
      onMaximize();
    } else {
      setIsMinimized(false);
    }
  }, [onMaximize]);

  const handleCloseAction = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      setIsMinimized(true);
    }
  }, [onClose]);

  const handleModeSwitch = (mode: 'COMP' | 'LIMIT') => {
    setActiveMode(mode);
    if (mode === 'LIMIT') {
      node.setRatio(20.0);
      node.setAttack(0.001); // 1ms
      node.setKnee(0.0); // Hard knee
    } else {
      node.setRatio(4.0);
      node.setAttack(0.020);
      node.setKnee(6.0);
    }
  };

  const handleReset = () => {
    node.setThreshold(-16.0);
    node.setRatio(4.0);
    node.setAttack(0.020);
    node.setRelease(0.150);
    node.setKnee(6.0);
    node.setCharacter('vca');
    node.setMix(1.0);
    node.setOutputGain(0.0);
    node.setSidechainHpf(20.0);
    setIsBypassed(false);
    setActiveMode('COMP');
  };

  const handleToggleBypass = () => {
    const nextBypass = !isBypassed;
    setIsBypassed(nextBypass);
    if (nextBypass) {
      node.setMix(0);
    } else {
      node.setMix(state.mix > 0 ? state.mix : 1.0);
    }
  };

  if (isMinimized) {
    return (
      <div
        className="comp-root"
        style={{
          width,
          maxWidth: '100%',
          borderRadius: '16px',
          background: '#FFFFFF',
          border: '3px solid #18181B',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxSizing: 'border-box',
          userSelect: 'none',
          color: '#18181B',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#18181B', letterSpacing: '-0.2px' }}>
            SONODS COMPRESSOR
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              background: '#F4F4F5',
              border: '1px solid #E4E4E7',
              padding: '2px 8px',
              borderRadius: '4px',
              color: '#0891B2',
            }}
          >
            {state.character.toUpperCase()} · GR: -{gainReductionDb.toFixed(1)} dB
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #D4D4D8',
              borderRadius: '6px',
              color: '#18181B',
              fontSize: '11px',
              fontWeight: 700,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            RESTORE
          </button>
          <TrafficLights
            onClose={handleCloseAction}
            onMinimize={handleMinimizeAction}
            onMaximize={handleMaximizeAction}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="comp-root"
      style={{
        width,
        maxWidth: '100%',
        borderRadius: '24px',
        background: '#FFFFFF',
        border: '3px solid #18181B',
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#18181B',
      }}
    >
      {/* --- Top Header Bar --- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          background: '#FAFAFA',
          borderBottom: '1.5px solid #E4E4E7',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.3px', color: '#18181B' }}>
            SONODS COMPRESSOR
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: '#F4F4F5',
              border: '1px solid #E4E4E7',
              padding: '2px 8px',
              borderRadius: '4px',
              color: '#71717A',
            }}
          >
            {trackName}
          </span>
        </div>

        {/* Right Header: Gain Reduction meter badge + Traffic Lights */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              minWidth: '105px',
              textAlign: 'center',
              fontSize: '11px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 800,
              color: gainReductionDb > 0.5 ? '#DC2626' : '#71717A',
              padding: '4px 10px',
              borderRadius: '6px',
              background: gainReductionDb > 0.5 ? 'rgba(239, 68, 68, 0.1)' : '#F4F4F5',
              border: gainReductionDb > 0.5 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #E4E4E7',
              transition: 'background 0.1s ease, color 0.1s ease',
            }}
          >
            GR: -{gainReductionDb.toFixed(1)} dB
          </div>

          <TrafficLights
            onClose={handleCloseAction}
            onMinimize={handleMinimizeAction}
            onMaximize={handleMaximizeAction}
          />
        </div>
      </div>

      {/* --- TOP ZONE: Full-Width Live Scrolling Visualization Strip --- */}
      <CompressorLiveTimeline
        node={node}
        state={state}
        gainReductionDb={gainReductionDb}
        height={210}
      />

      {/* --- BOTTOM ZONE: Grouped & Labeled Sections (FL Fruity Limiter Structure) --- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 3.2fr 1.6fr',
          background: '#FFFFFF',
          padding: '16px 20px',
          gap: '16px',
          alignItems: 'stretch',
        }}
      >
        {/* Section 1: LOUDNESS / LEVEL */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#FAFAFA',
            borderRadius: '12px',
            border: '1.5px solid #E4E4E7',
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#71717A',
              borderBottom: '1px solid #E4E4E7',
              paddingBottom: '6px',
              marginBottom: '12px',
              textAlign: 'center',
            }}
          >
            LOUDNESS
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flex: 1 }}>
            <PressKnob
              label="GAIN"
              value={state.outputGain}
              min={-18.0}
              max={18.0}
              step={0.5}
              defaultValue={0.0}
              unit=" dB"
              onChange={(val) => node.setOutputGain(val)}
            />

            <PressKnob
              label="MIX"
              value={state.mix}
              min={0.0}
              max={1.0}
              step={0.01}
              defaultValue={1.0}
              displayFormatter={(val) => `${Math.round(val * 100)}%`}
              onChange={(val) => node.setMix(val)}
            />
          </div>
        </div>

        {/* Section 2: ENVELOPE (Core Compressor Dynamics) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#FAFAFA',
            borderRadius: '12px',
            border: '1.5px solid #E4E4E7',
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#0891B2',
              borderBottom: '1px solid #E4E4E7',
              paddingBottom: '6px',
              marginBottom: '12px',
              textAlign: 'center',
            }}
          >
            ENVELOPE
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1, gap: '8px' }}>
            <PressKnob
              label="THRES"
              value={state.threshold}
              min={-60.0}
              max={0.0}
              step={0.5}
              defaultValue={-16.0}
              unit=" dB"
              onChange={(val) => node.setThreshold(val)}
            />

            <PressKnob
              label="KNEE"
              value={state.knee}
              min={0.0}
              max={24.0}
              step={0.5}
              defaultValue={6.0}
              unit=" dB"
              onChange={(val) => node.setKnee(val)}
            />

            <PressKnob
              label="RATIO"
              value={state.ratio}
              min={1.0}
              max={20.0}
              step={0.1}
              defaultValue={4.0}
              displayFormatter={(val) => (val >= 20 ? '∞:1' : `${val.toFixed(1)}:1`)}
              onChange={(val) => node.setRatio(val)}
            />

            <PressKnob
              label="ATT"
              value={state.attack * 1000}
              min={0.1}
              max={100.0}
              step={0.5}
              defaultValue={20.0}
              unit=" ms"
              onChange={(val) => node.setAttack(val / 1000)}
            />

            <PressKnob
              label="REL"
              value={state.release * 1000}
              min={10.0}
              max={1000.0}
              step={5.0}
              defaultValue={150.0}
              unit=" ms"
              onChange={(val) => node.setRelease(val / 1000)}
            />

            <PressKnob
              label="HPF"
              value={state.sidechainHpf}
              min={20.0}
              max={300.0}
              step={5.0}
              defaultValue={20.0}
              unit=" Hz"
              onChange={(val) => node.setSidechainHpf(val)}
            />
          </div>
        </div>

        {/* Section 3: CHARACTER / TOPOLOGY */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#FAFAFA',
            borderRadius: '12px',
            border: '1.5px solid #E4E4E7',
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#71717A',
              borderBottom: '1px solid #E4E4E7',
              paddingBottom: '6px',
              marginBottom: '12px',
              textAlign: 'center',
            }}
          >
            TOPOLOGY
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, justifyContent: 'center' }}>
            {(
              [
                { id: 'vca', title: 'VCA', desc: 'Precision Bus' },
                { id: 'opto', title: 'OPTO', desc: 'Smooth Tube' },
                { id: 'fet', title: 'FET', desc: 'Fast Grab' },
              ] as const
            ).map((t) => {
              const active = state.character === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => node.setCharacter(t.id as CompressorCharacterType)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: active ? '1.5px solid #06B6D4' : '1.5px solid #E4E4E7',
                    background: active ? '#ECFEFF' : '#FFFFFF',
                    color: active ? '#0891B2' : '#71717A',
                    boxShadow: active ? '0 1px 3px rgba(6, 182, 212, 0.12)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 800 }}>{t.title}</span>
                  <span style={{ fontSize: '9px', fontWeight: 600, opacity: 0.8 }}>{t.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- Bottom Status / Mode Bar (Fruity Limiter Bottom Selector Strip) --- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 20px',
          background: '#FAFAFA',
          borderTop: '1.5px solid #E4E4E7',
        }}
      >
        {/* Bottom-Left Mode Selector: COMP / LIMIT */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#71717A', marginRight: '4px' }}>MODE:</span>
          <div style={{ display: 'flex', background: '#E4E4E7', padding: '2px', borderRadius: '6px', gap: '2px' }}>
            {(['COMP', 'LIMIT'] as const).map((mode) => {
              const active = activeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleModeSwitch(mode)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    background: active ? '#06B6D4' : 'transparent',
                    color: active ? '#FFFFFF' : '#71717A',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>

        {/* Master Actions: Reset & Bypass */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #D4D4D8',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              padding: '5px 12px',
              color: '#18181B',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            RESET
          </button>

          <button
            type="button"
            onClick={handleToggleBypass}
            style={{
              background: isBypassed ? '#EF4444' : '#FFFFFF',
              border: isBypassed ? '1.5px solid #DC2626' : '1.5px solid #D4D4D8',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              padding: '5px 12px',
              color: isBypassed ? '#FFFFFF' : '#18181B',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {isBypassed ? 'BYPASSED' : 'BYPASS'}
          </button>
        </div>
      </div>
    </div>
  );
};
