import React, { useEffect, useRef } from 'react';
import { PressRenderer } from '../render/PressRenderer.js';
import { GainReductionMeterState, pressCompressionAmount } from '../render/GainReductionMeterState.js';

interface PressIllustrationProps {
  gainReductionDb: number; // Real-time gain reduction stream from DSP
  width?: number;
  height?: number;
}

/**
 * PressIllustration Component per Task 4.2.
 *
 * Renders the hydraulic press animation directly driven by real-time gain-reduction
 * telemetry, NOT by knob position. The plates converge and squeeze the burger stack
 * with smooth ballistics during audio compression.
 */
export const PressIllustration: React.FC<PressIllustrationProps> = ({
  gainReductionDb,
  width = 240,
  height = 240,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PressRenderer | null>(null);
  const meterStateRef = useRef<GainReductionMeterState>(new GainReductionMeterState());
  const grRef = useRef(gainReductionDb);
  grRef.current = gainReductionDb;

  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new PressRenderer(canvasRef.current, {
      width,
      height,
      strokeColor: '#18181B',
    });
    rendererRef.current = renderer;

    let animId: number;

    const renderLoop = (time: number) => {
      const { currentGr } = meterStateRef.current.update(grRef.current, time);
      const squish = pressCompressionAmount(currentGr);
      renderer.render(squish);
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [width, height]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${width}px`,
        height: `${height}px`,
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
};
