import React, { useEffect, useState, useCallback } from 'react';
import {
  CharacterType,
  QualityType,
  SaturatorState,
  SonodsSaturatorNode,
} from '@sonods/sat-engine';
import { SaturatorCharacterFace } from './SaturatorCharacterFace.js';
import { RainbowKnob } from './RainbowKnob.js';
import { TrafficLights } from './TrafficLights.js';
import { FACTORY_PRESETS, SaturatorPreset } from '../presets.js';
import '../theme/tokens.css';

export interface SonodsSaturatorPluginProps {
  node: SonodsSaturatorNode;
  width?: number | string;
  trackName?: string;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

export const SonodsSaturatorPlugin: React.FC<SonodsSaturatorPluginProps> = ({
  node,
  width = 720,
  trackName = 'Track 1',
  onClose,
  onMinimize,
  onMaximize,
}) => {
  const [state, setState] = useState<SaturatorState>(node.getState());
  const [audioPeak, setAudioPeak] = useState<number>(0);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isBypassed, setIsBypassed] = useState<boolean>(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('tape-master-glue');

  // Subscribe to node state updates
  useEffect(() => {
    const unsub = node.subscribe((nextState) => {
      setState(nextState);
    });
    return unsub;
  }, [node]);

  // Real-time audio analyser polling loop for reactive face animations
  useEffect(() => {
    let animId: number;
    const dataArray = new Uint8Array(node.postAnalyser.frequencyBinCount);

    const poll = () => {
      node.postAnalyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setAudioPeak(rms * 2.5);

      animId = requestAnimationFrame(poll);
    };

    poll();
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [node]);

  const handleCharacterChange = (char: CharacterType) => {
    node.setCharacter(char);
  };

  const handleQualityChange = (quality: QualityType) => {
    node.setQuality(quality);
  };

  const handleAutoGainToggle = () => {
    node.setAutoGain(!state.autoGain);
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

  const handleReset = () => {
    node.setDrive(0.2);
    node.setTone(0.0);
    node.setCharacter('tape');
    node.setMix(1.0);
    node.setOutputGain(0.0);
    node.setAutoGain(true);
    node.setQuality('high');
    setIsBypassed(false);
  };

  const handleSelectPreset = (preset: SaturatorPreset) => {
    setSelectedPresetId(preset.id);
    node.setDrive(preset.drive);
    node.setCharacter(preset.character);
    node.setTone(preset.tone);
    node.setMix(preset.mix);
    node.setOutputGain(preset.outputGain);
    node.setAutoGain(preset.autoGain);
    node.setQuality(preset.quality);
    setIsBypassed(false);
  };

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

  const charAccent =
    state.character === 'tape'
      ? '#F59E0B'
      : state.character === 'tube'
      ? '#F43F5E'
      : '#06B6D4';

  const charName =
    state.character === 'tape'
      ? 'Warmth'
      : state.character === 'tube'
      ? 'Glow'
      : 'Iron';

  const charDescription =
    state.character === 'tape'
      ? 'Analog Tape Saturation'
      : state.character === 'tube'
      ? 'Valve Harmonic Drive'
      : 'Iron Core Punch';

  if (isMinimized) {
    return (
      <div
        className="sat-root"
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
          fontFamily: 'var(--sat-font-family, -apple-system, BlinkMacSystemFont, sans-serif)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#18181B', letterSpacing: '-0.2px' }}>
            SONODS SATURATOR
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              background: '#F4F4F5',
              padding: '2px 8px',
              borderRadius: '4px',
              color: '#52525B',
            }}
          >
            {charName.toUpperCase()} · {Math.round(state.drive * 100)}%
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
      className="sat-root"
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
        fontFamily: 'var(--sat-font-family, -apple-system, BlinkMacSystemFont, sans-serif)',
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
            SONODS SATURATOR
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

        {/* Top Right: Traffic Lights */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <TrafficLights
            onClose={handleCloseAction}
            onMinimize={handleMinimizeAction}
            onMaximize={handleMaximizeAction}
          />
        </div>
      </div>

      {/* --- Character Mode Switcher (Clean Segmented Studio Bar) --- */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAFAFA',
          padding: '8px 18px',
          borderBottom: '1.5px solid #E4E4E7',
        }}
      >
        <div
          style={{
            display: 'flex',
            background: '#E4E4E7',
            padding: '3px',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '540px',
            gap: '3px',
          }}
        >
          {(
            [
              { id: 'tape', title: 'WARMTH', desc: 'Tape Saturation' },
              { id: 'tube', title: 'GLOW', desc: 'Valve Harmonics' },
              { id: 'transformer', title: 'IRON', desc: 'Iron Core Punch' },
            ] as const
          ).map((m) => {
            const active = state.character === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleCharacterChange(m.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: active ? '#FFFFFF' : 'transparent',
                  color: active ? '#18181B' : '#71717A',
                  cursor: 'pointer',
                  boxShadow: active ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em' }}>
                  {m.title}
                </span>
                <span style={{ fontSize: '9px', fontWeight: 600, opacity: 0.75, marginTop: '1px' }}>
                  {m.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* --- Main Stage: Left Visualizer | Right Knobs --- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.15fr',
          background: '#FFFFFF',
          minHeight: '320px',
        }}
      >
        {/* Left Section: Expressive Reactive Stage */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FFFFFF',
            borderRight: '1.5px solid #E4E4E7',
            padding: '20px 16px',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#71717A',
              marginBottom: '12px',
            }}
          >
            {charDescription}
          </div>

          <SaturatorCharacterFace
            drive={state.drive}
            character={state.character}
            audioPeak={audioPeak}
          />
        </div>

        {/* Right Section: 4 Clean Studio Knobs in 2x2 Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '16px',
            padding: '24px 20px',
            alignItems: 'center',
            justifyItems: 'center',
            background: '#FAFAFA',
          }}
        >
          <RainbowKnob
            label="DRIVE"
            value={state.drive}
            min={0.0}
            max={1.0}
            step={0.01}
            unit="%"
            displayFormatter={(v: number) => `${Math.round(v * 100)}%`}
            onChange={(val) => node.setDrive(val)}
            accentColor={charAccent}
            size={72}
          />

          <RainbowKnob
            label="TONE"
            value={state.tone}
            min={-24.0}
            max={24.0}
            step={0.1}
            unit="dB"
            displayFormatter={(v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
            onChange={(val) => node.setTone(val)}
            accentColor="#EAB308"
            size={72}
          />

          <RainbowKnob
            label="MIX"
            value={state.mix}
            min={0.0}
            max={1.0}
            step={0.01}
            unit="%"
            displayFormatter={(v: number) => `${Math.round(v * 100)}%`}
            onChange={(val) => node.setMix(val)}
            accentColor="#84CC16"
            size={72}
          />

          <RainbowKnob
            label="OUTPUT"
            value={state.outputGain}
            min={-36.0}
            max={36.0}
            step={0.1}
            unit="dB"
            displayFormatter={(v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
            onChange={(val) => node.setOutputGain(val)}
            accentColor="#3B82F6"
            size={72}
          />
        </div>
      </div>

      {/* --- Bottom Footer Bar --- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 18px',
          background: '#FAFAFA',
          borderTop: '1.5px solid #E4E4E7',
        }}
      >
        {/* Preset Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#71717A' }}>PRESET:</span>
          <select
            value={selectedPresetId}
            onChange={(e) => {
              const preset = FACTORY_PRESETS.find((p) => p.id === e.target.value);
              if (preset) handleSelectPreset(preset);
            }}
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #D4D4D8',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              padding: '4px 8px',
              color: '#18181B',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {FACTORY_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Master Actions: Reset & Bypass */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              color: '#52525B',
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
              border: isBypassed ? '1.5px solid #EF4444' : '1.5px solid #D4D4D8',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              padding: '5px 12px',
              color: isBypassed ? '#FFFFFF' : '#52525B',
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
