import React, { useRef, useEffect, useState, useCallback } from 'react';
import { BandState, ParamId, Shape, SonodsEqNode } from '@sonods/eq-engine';
import { CurveRenderer } from '../../render/CurveRenderer.js';
import { AnalyserRenderer } from '../../render/AnalyserRenderer.js';
import { frequencyToX, gainToY, xToFrequency, yToGain } from '../../coords.js';
import { SessionRegistry } from '../../sessionRegistry.js';
import { detectCollisions, renderCollisionZones } from '../../collision.js';
import styles from './CurveCanvas.module.css';

export interface CurveCanvasProps {
  node: SonodsEqNode | null;
  bands: BandState[];
  selectedBandIndex: number | null;
  onSelectBand: (bandIndex: number | null) => void;
  onContextMenu: (x: number, y: number, bandIndex: number) => void;
  onFrameTiming?: (fps: number, durationMs: number) => void;
  sessionRegistry?: SessionRegistry | null;
}

export const CurveCanvas: React.FC<CurveCanvasProps> = ({
  node,
  bands,
  selectedBandIndex,
  onSelectBand,
  onContextMenu,
  onFrameTiming,
  sessionRegistry,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredBandIndex, setHoveredBandIndex] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragBandIndexRef = useRef<number | null>(null);

  const hitTest = useCallback(
    (x: number, y: number, width: number, height: number): number | null => {
      const hitRadius = 14;
      for (const band of bands) {
        if (!band.enabled) continue;
        const bx = frequencyToX(band.freq, width);
        const by = gainToY(band.gain, height);
        const dx = x - bx;
        const dy = y - by;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          return band.index;
        }
      }
      return null;
    },
    [bands]
  );

  // Animation and Render Loop (Rule 3: uses framework-agnostic renderers in useEffect)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const curveRenderer = new CurveRenderer(ctx);
    const analyserRenderer = new AnalyserRenderer(ctx);

    let animationId: number;
    let lastTime = performance.now();

    const renderLoop = () => {
      const frameStart = performance.now();
      const delta = frameStart - lastTime;
      lastTime = frameStart;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (width > 0 && height > 0) {
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }

        // 0. Background + Grid (drawn first, under everything)
        curveRenderer.renderBackground(width, height, dpr);

        // 1. Spectrum Analyzer render pass (on top of grid, under curve)
        let preData: Float32Array | null = null;
        let postData: Float32Array | null = null;
        if (node) {
          preData = node.getPreAnalyserData();
          postData = node.getPostAnalyserData();
        }

        analyserRenderer.render({
          width,
          height,
          dpr,
          preData,
          postData,
          sampleRate: node?.audioContext.sampleRate || 48000,
          showPre: true,
          showPost: true,
        });

        // 2. Cross-Track Collision detection & overlay (Phase 6)
        if (sessionRegistry && postData) {
          const remotes = sessionRegistry.getRemoteSnapshots();
          if (remotes.length > 0) {
            const collisions = detectCollisions(
              postData,
              remotes,
              node?.audioContext.sampleRate || 48000
            );
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            renderCollisionZones(ctx, collisions, width, height);
            ctx.restore();
          }

          if (Math.random() < 0.05 && node) {
            sessionRegistry.publishSnapshot(
              node.getBands().map((b) => ({ freq: b.freq, gainDb: b.gain, q: b.q })),
              postData
            );
          }
        }

        // 3. Response Curve and Handles render pass
        const curvePoints = node ? node.getResponseCurve(512) : [];
        const currentBands = node ? node.getBands() : [];

        const ghostCurves =
          selectedBandIndex !== null && node
            ? [
                {
                  bandIndex: selectedBandIndex,
                  points: node.getBandResponseCurve(selectedBandIndex, 256),
                },
              ]
            : [];

        curveRenderer.render({
          width,
          height,
          dpr,
          curvePoints,
          bands: currentBands,
          selectedBandIndex,
          hoveredBandIndex,
          ghostCurves,
        });
      }

      const frameDuration = performance.now() - frameStart;
      if (onFrameTiming) {
        onFrameTiming(1000 / Math.max(1, delta), frameDuration);
      }

      animationId = requestAnimationFrame(renderLoop);
    };

    animationId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [node, selectedBandIndex, hoveredBandIndex, sessionRegistry, onFrameTiming]);

  // Pointer Interaction Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = hitTest(x, y, rect.width, rect.height);
    if (hit !== null) {
      onSelectBand(hit);
      dragBandIndexRef.current = hit;
      isDraggingRef.current = true;
      canvasRef.current.setPointerCapture(e.pointerId);
    } else if (node) {
      const currentBands = node.getBands();
      const freq = xToFrequency(x, rect.width);
      const gain = yToGain(y, rect.height);

      if (currentBands.length >= 5) {
        // Select closest band in frequency and drag it
        let closestIndex = currentBands[0].index;
        let minDiff = Infinity;
        for (const b of currentBands) {
          const diff = Math.abs(Math.log10(b.freq) - Math.log10(freq));
          if (diff < minDiff) {
            minDiff = diff;
            closestIndex = b.index;
          }
        }
        onSelectBand(closestIndex);
        dragBandIndexRef.current = closestIndex;
        isDraggingRef.current = true;
        node.setBandParam(closestIndex, ParamId.Gain, gain);
        canvasRef.current.setPointerCapture(e.pointerId);
      } else {
        const newBand = node.addBand(Shape.Bell, freq, gain, 1.4);
        if (newBand) {
          onSelectBand(newBand.index);
          dragBandIndexRef.current = newBand.index;
          isDraggingRef.current = true;
          canvasRef.current.setPointerCapture(e.pointerId);
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDraggingRef.current && dragBandIndexRef.current !== null && node) {
      let freq = xToFrequency(x, rect.width);
      let gain = yToGain(y, rect.height);

      // Shift + drag constraint: lock to vertical / gain-only movement
      if (e.shiftKey) {
        const band = node.getBands().find((b: BandState) => b.index === dragBandIndexRef.current);
        if (band) freq = band.freq;
      }

      node.setBandParam(dragBandIndexRef.current, ParamId.Freq, freq);
      node.setBandParam(dragBandIndexRef.current, ParamId.Gain, gain);
    } else {
      const hit = hitTest(x, y, rect.width, rect.height);
      setHoveredBandIndex(hit);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      dragBandIndexRef.current = null;
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (selectedBandIndex === null || !node) return;

    const band = node.getBands().find((b: BandState) => b.index === selectedBandIndex);
    if (!band) return;

    const delta = -e.deltaY * 0.005;
    const newQ = Math.max(0.1, Math.min(band.q * Math.exp(delta), 40.0));
    node.setBandParam(selectedBandIndex, ParamId.Q, newQ);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !node) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTest(x, y, rect.width, rect.height);

    if (hit !== null) {
      // Reset band to neutral default (Task 4.3)
      node.setBandParam(hit, ParamId.Gain, 0.0);
      node.setBandParam(hit, ParamId.Q, 1.0);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTest(x, y, rect.width, rect.height);

    if (hit !== null) {
      onSelectBand(hit);
      onContextMenu(x, y, hit);
    }
  };

  return (
    <div className={styles.canvasContainer}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
};
