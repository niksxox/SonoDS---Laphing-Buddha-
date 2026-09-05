import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BandState, CutSlope, ParamId, Shape, SonodsEqNode } from '@sonods/eq-engine';
import { useSonodsEqStore } from '../../hooks/useSonodsEqStore.js';
import { SessionRegistry } from '../../sessionRegistry.js';
import {
  applyPresetWithAnimation,
  ExplainableAnnotation,
  INSTRUMENT_PRESETS,
} from '../../explainability.js';

import { StatusDots } from '../StatusDots/index.js';
import { Readout } from '../Readout/index.js';
import { CurveCanvas } from '../CurveCanvas/index.js';
import { BandStrip } from '../BandStrip/index.js';
import { AiAssist } from '../AiAssist/index.js';
import { ContextMenu } from '../ContextMenu/index.js';
import { Annotations } from '../Annotations/index.js';
import { BAND_COLORS } from '../../render/CurveRenderer.js';

import '../../theme/tokens.css';
import styles from './SonodsEq.module.css';

export interface SonodsEqProps {
  node: SonodsEqNode | null;
  trackName?: string;
  showDevOverlay?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

export const SonodsEq: React.FC<SonodsEqProps> = ({
  node,
  trackName = 'Track 1',
  showDevOverlay = false,
  onClose,
  onMinimize,
  onMaximize,
}) => {
  const state = useSonodsEqStore(node);
  const [selectedBandIndex, setSelectedBandIndex] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<ExplainableAnnotation[]>([]);
  const [isBypassed, setIsBypassed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [fps, setFps] = useState(60);
  const [frameDurationMs, setFrameDurationMs] = useState(0);

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

  // Context menu state
  const [menuState, setMenuState] = useState<{
    x: number;
    y: number;
    bandIndex: number;
  } | null>(null);

  // Cross-instance communication registry (Phase 6)
  const sessionRegistry = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new SessionRegistry(`eq-${Math.random().toString(36).substring(2, 7)}`, trackName);
  }, [trackName]);

  useEffect(() => {
    return () => {
      sessionRegistry?.destroy();
    };
  }, [sessionRegistry]);

  // Ensure initial band selection
  useEffect(() => {
    if (selectedBandIndex === null && state.bands.length > 0) {
      setSelectedBandIndex(state.bands[0].index);
    }
  }, [state.bands, selectedBandIndex]);

  const selectedBand = useMemo(() => {
    return state.bands.find((b: BandState) => b.index === selectedBandIndex) || null;
  }, [state.bands, selectedBandIndex]);

  const handleFrequencyChange = useCallback(
    (newFreq: number) => {
      if (selectedBandIndex !== null && node) {
        node.setBandParam(selectedBandIndex, ParamId.Freq, newFreq);
      }
    },
    [selectedBandIndex, node]
  );

  const handleSelectAiPreset = useCallback(
    (presetKey: 'vocal' | 'kick' | 'bass' | 'acoustic') => {
      if (node) {
        applyPresetWithAnimation(node, INSTRUMENT_PRESETS[presetKey]).then((notes) => {
          setAnnotations(notes);
        });
      }
    },
    [node]
  );

  const handleToggleBypass = useCallback(() => {
    if (!node) return;
    const nextBypass = !isBypassed;
    setIsBypassed(nextBypass);
    for (const b of node.getBands()) {
      node.setBandParam(b.index, ParamId.Enabled, nextBypass ? 0 : 1);
    }
  }, [node, isBypassed]);

  const handleResetFlat = useCallback(() => {
    if (!node) return;
    node.resetToDefault();
    setAnnotations([]);
    setIsBypassed(false);
    setSelectedBandIndex(0);
  }, [node]);

  const handleContextMenu = useCallback((x: number, y: number, bandIndex: number) => {
    setMenuState({ x, y, bandIndex });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!node || state.bands.length === 0) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        if (selectedBandIndex === null) {
          setSelectedBandIndex(state.bands[0].index);
        } else {
          const currIdx = state.bands.findIndex((b: BandState) => b.index === selectedBandIndex);
          const nextIdx = (currIdx + 1) % state.bands.length;
          setSelectedBandIndex(state.bands[nextIdx].index);
        }
      } else if (selectedBandIndex !== null && selectedBand) {
        const stepMult = e.shiftKey ? 4 : 1;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          node.setBandParam(
            selectedBandIndex,
            ParamId.Freq,
            selectedBand.freq * Math.pow(0.96, stepMult)
          );
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          node.setBandParam(
            selectedBandIndex,
            ParamId.Freq,
            selectedBand.freq * Math.pow(1.04, stepMult)
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          node.setBandParam(
            selectedBandIndex,
            ParamId.Gain,
            selectedBand.gain + 0.5 * stepMult
          );
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          node.setBandParam(
            selectedBandIndex,
            ParamId.Gain,
            selectedBand.gain - 0.5 * stepMult
          );
        }
      }
    },
    [node, state.bands, selectedBandIndex, selectedBand]
  );

  if (isMinimized) {
    return (
      <div
        className={styles.chassis}
        style={{
          padding: '12px 18px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#18181B', letterSpacing: '-0.2px' }}>
            SONODS EQ
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
            {state.bands.length} BANDS · {isBypassed ? 'BYPASSED' : 'ACTIVE'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={() => setIsMinimized(false)}
          >
            RESTORE
          </button>
          <StatusDots
            onClose={handleCloseAction}
            onMinimize={handleMinimizeAction}
            onMaximize={handleMaximizeAction}
            cpuWarning={frameDurationMs > 16.6}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.chassis}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={closeMenu}
    >
      {/* Top Header Bar */}
      <div className={styles.topBar}>
        <Readout
          selectedBand={selectedBand}
          onFrequencyChange={handleFrequencyChange}
        />
        <div className={styles.topRightGroup}>
          <AiAssist onSelectPreset={handleSelectAiPreset} />
          <StatusDots
            onClose={handleCloseAction}
            onMinimize={handleMinimizeAction}
            onMaximize={handleMaximizeAction}
            cpuWarning={frameDurationMs > 16.6}
          />
        </div>
      </div>

      {/* Main Screen: Curve Visualizer (Left) + 7-Band Strip Rack (Right) */}
      <div className={styles.mainStage}>
        {/* Left: Interactive Response Curve Canvas */}
        <div className={styles.canvasWrapper}>
          <CurveCanvas
            node={node}
            bands={state.bands}
            selectedBandIndex={selectedBandIndex}
            onSelectBand={setSelectedBandIndex}
            onContextMenu={handleContextMenu}
            onFrameTiming={(f, d) => {
              setFps(f);
              setFrameDurationMs(d);
            }}
            sessionRegistry={sessionRegistry}
          />
        </div>

        {/* Right: 7-Band Channel Strips matching FL Studio EQ 2 */}
        <div className={styles.rackPanel}>
          {state.bands.map((band: BandState, idx: number) => {
            const color = BAND_COLORS[idx % BAND_COLORS.length];
            return (
              <BandStrip
                key={band.index}
                band={band}
                bandNumber={idx + 1}
                color={color}
                isSelected={band.index === selectedBandIndex}
                onSelect={() => setSelectedBandIndex(band.index)}
                onGainChange={(g) => node?.setBandParam(band.index, ParamId.Gain, g)}
                onFreqChange={(f) => node?.setBandParam(band.index, ParamId.Freq, f)}
                onQChange={(q) => node?.setBandParam(band.index, ParamId.Q, q)}
                onShapeChange={(s) => node?.setBandParam(band.index, ParamId.Shape, s)}
              />
            );
          })}
        </div>
      </div>

      {/* AI Explainability Annotations Banner */}
      <Annotations
        annotations={annotations}
        onDismiss={(id) => setAnnotations((prev) => prev.filter((a) => a.id !== id))}
      />

      {/* Bottom Master Bar */}
      <div className={styles.bottomBar}>
        <div className={styles.masterControls}>
          <button
            className={`${styles.controlBtn} ${isBypassed ? styles.active : ''}`}
            onClick={handleToggleBypass}
          >
            {isBypassed ? 'Bypassed' : 'Bypass'}
          </button>
          <button className={styles.controlBtn} onClick={handleResetFlat}>
            Reset
          </button>
          {showDevOverlay && (
            <span className={styles.devOverlay}>
              FPS: {Math.round(fps)} | {frameDurationMs.toFixed(1)}ms
            </span>
          )}
        </div>

        {/* SonoDS Signature Branding */}
        <div className={styles.sonodsBrand}>SonoDS</div>
      </div>

      {/* Right-click Context Menu */}
      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          band={state.bands.find((b: BandState) => b.index === menuState.bandIndex)!}
          onSelectShape={(s: Shape) => {
            node?.setBandParam(menuState.bandIndex, ParamId.Shape, s);
            closeMenu();
          }}
          onSelectSlope={(slope: CutSlope) => {
            node?.setBandParam(menuState.bandIndex, ParamId.Slope, slope);
            closeMenu();
          }}
          onToggleDynamic={() => {
            const b = state.bands.find((x: BandState) => x.index === menuState.bandIndex);
            if (b && node) {
              node.setBandParam(
                menuState.bandIndex,
                ParamId.DynamicEnabled,
                b.dynamicEnabled ? 0 : 1
              );
              node.setBandParam(
                menuState.bandIndex,
                ParamId.DynamicRange,
                b.dynamicEnabled ? 0 : -6.0
              );
            }
            closeMenu();
          }}
          onToggleMode={() => {
            const b = state.bands.find((x: BandState) => x.index === menuState.bandIndex);
            if (b && node) {
              const nextMode = (b.mode + 1) % 3;
              node.setBandParam(menuState.bandIndex, ParamId.Mode, nextMode);
            }
            closeMenu();
          }}
          onDeleteBand={() => {
            node?.removeBand(menuState.bandIndex);
            setSelectedBandIndex(null);
            closeMenu();
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
};
