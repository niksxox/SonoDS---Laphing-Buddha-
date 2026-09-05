import React, { useEffect, useRef } from 'react';
import { SonodsCompressorNode, CompressorState, CompressorTelemetryFrame } from '@sonods/comp-engine';

export interface CompressorLiveTimelineProps {
  node: SonodsCompressorNode;
  state: CompressorState;
  gainReductionDb: number;
  height?: number;
}

const HISTORY_LENGTH = 300; // ~5 seconds of scrolling history at 60fps

export const CompressorLiveTimeline: React.FC<CompressorLiveTimelineProps> = ({
  node,
  state,
  gainReductionDb,
  height = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Rolling history buffers for real DSP telemetry (from Section 1 & 2)
  const historyRef = useRef<{
    inputDb: number[];
    outputDb: number[];
    detectedDb: number[];
    grDb: number[];
    maxLen: number;
  }>({
    inputDb: new Array(HISTORY_LENGTH).fill(-60),
    outputDb: new Array(HISTORY_LENGTH).fill(-60),
    detectedDb: new Array(HISTORY_LENGTH).fill(-60),
    grDb: new Array(HISTORY_LENGTH).fill(0),
    maxLen: HISTORY_LENGTH,
  });

  const latestTelemetryRef = useRef<CompressorTelemetryFrame>({
    inputDb: -60,
    detectedDb: -60,
    outputDb: -60,
    grDb: gainReductionDb,
  });

  const stateRef = useRef<CompressorState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Subscribe to real DSP telemetry from the worklet/engine (Section 2)
  useEffect(() => {
    const unsub = node.subscribeTelemetry((frame) => {
      latestTelemetryRef.current = frame;
    });
    return unsub;
  }, [node]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let cachedWaveGradient: CanvasGradient | null = null;
    let cachedGhostGradient: CanvasGradient | null = null;
    let lastCachedHeight = 0;
    let lastTime = performance.now();
    let timeAccumulator = 0;
    const STEP_MS = 1000 / 60; // Locked to 60fps constant scroll rate

    const render = (now: number) => {
      const delta = Math.min(100, now - lastTime);
      lastTime = now;
      timeAccumulator += delta;

      const current = latestTelemetryRef.current;
      const h = historyRef.current;
      const currentState = stateRef.current;

      // Advance history by fixed time increments (no speedup during knob turns)
      while (timeAccumulator >= STEP_MS) {
        h.inputDb.shift();
        h.inputDb.push(Math.max(-60, current.inputDb));

        h.outputDb.shift();
        h.outputDb.push(Math.max(-60, current.outputDb));

        h.detectedDb.shift();
        h.detectedDb.push(Math.max(-60, current.detectedDb));

        h.grDb.shift();
        h.grDb.push(Math.max(0, current.grDb));

        timeAccumulator -= STEP_MS;
      }

      // High-DPI canvas resolution handling
      const width = canvas.clientWidth;
      const hCanvas = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== width * dpr || canvas.height !== hCanvas * dpr) {
        canvas.width = width * dpr;
        canvas.height = hCanvas * dpr;
        cachedWaveGradient = null;
        cachedGhostGradient = null;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // --- Light Studio Background ---
      ctx.fillStyle = '#FAFAFA';
      ctx.fillRect(0, 0, width, hCanvas);

      // Two-Lane Layout:
      // Lane A: Top 32% for Gain Reduction trace
      // Lane B: Bottom 68% for Audio Levels (Input, Output, Detected, Threshold)
      const grLaneHeight = Math.floor(hCanvas * 0.32);
      const waveLaneTop = grLaneHeight + 3;
      const waveLaneHeight = hCanvas - waveLaneTop;
      const baselineY = waveLaneTop + waveLaneHeight;

      // =========================================================================
      // Lane A: Gain Reduction Trace (Top Strip)
      // =========================================================================
      // 1. Purple Reference Line (0 dB Ceiling / Baseline) at the very top
      const purpleLineY = 12;
      ctx.strokeStyle = '#9333ea';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, purpleLineY);
      ctx.lineTo(width, purpleLineY);
      ctx.stroke();

      // 2. Green Reference Line (Lane A bottom / separator)
      const greenLineY = grLaneHeight;
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, greenLineY);
      ctx.lineTo(width, greenLineY);
      ctx.stroke();

      // 3. Gain Reduction Gridlines (0, -6, -12, -18 dB)
      const grSteps = [6, 12, 18];
      const maxGrScale = 20.0;
      grSteps.forEach((grVal) => {
        const yNorm = grVal / maxGrScale;
        const y = purpleLineY + yNorm * (greenLineY - purpleLineY);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      });

      // 4. Plot smoothedGrDb from history as a crisp crimson/red line dropping down
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      const points = h.maxLen;
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const gr = h.grDb[i]; // in positive dB
        const grNorm = Math.min(1, gr / maxGrScale);
        const y = purpleLineY + grNorm * (greenLineY - purpleLineY);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // =========================================================================
      // Lane B: Audio Levels & Detected Envelope (Bottom Strip)
      // =========================================================================
      // Lane B dB Gridlines (-6, -12, -18, -24, -36, -48 dB)
      const dbSteps = [-6, -12, -18, -24, -36, -48];
      dbSteps.forEach((db) => {
        const norm = (db - -60) / 60; // 0 at -60dB, 1 at 0dB
        const y = waveLaneTop + waveLaneHeight * (1 - norm);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`${db}`, 6, y - 2);
      });

      // 1. Input Level (Layer 1: Thin ghost outline & faint violet fill - "here's what came in")
      if (!cachedGhostGradient || lastCachedHeight !== hCanvas) {
        cachedGhostGradient = ctx.createLinearGradient(0, waveLaneTop, 0, baselineY);
        cachedGhostGradient.addColorStop(0, 'rgba(168, 85, 247, 0.25)');
        cachedGhostGradient.addColorStop(0.6, 'rgba(147, 51, 234, 0.10)');
        cachedGhostGradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
      }

      ctx.fillStyle = cachedGhostGradient!;
      ctx.beginPath();
      ctx.moveTo(0, baselineY);
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const inDb = h.inputDb[i];
        const norm = Math.max(0, Math.min(1, (inDb - -60) / 60));
        const y = waveLaneTop + waveLaneHeight * (1 - norm);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, baselineY);
      ctx.closePath();
      ctx.fill();

      // Ghost outline
      ctx.strokeStyle = 'rgba(147, 51, 234, 0.45)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const inDb = h.inputDb[i];
        const norm = Math.max(0, Math.min(1, (inDb - -60) / 60));
        const y = waveLaneTop + waveLaneHeight * (1 - norm);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 2. Output Level (Layer 2: Main, fully-opaque filled waveform shape - visibly ducks as grDb increases!)
      if (!cachedWaveGradient || lastCachedHeight !== hCanvas) {
        cachedWaveGradient = ctx.createLinearGradient(0, waveLaneTop, 0, baselineY);
        cachedWaveGradient.addColorStop(0, 'rgba(6, 182, 212, 0.42)');
        cachedWaveGradient.addColorStop(0.5, 'rgba(8, 145, 178, 0.22)');
        cachedWaveGradient.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
        lastCachedHeight = hCanvas;
      }

      ctx.fillStyle = cachedWaveGradient!;
      ctx.beginPath();
      ctx.moveTo(0, baselineY);
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const outDb = h.outputDb[i];
        const norm = Math.max(0, Math.min(1, (outDb - -60) / 60));
        const y = waveLaneTop + waveLaneHeight * (1 - norm);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, baselineY);
      ctx.closePath();
      ctx.fill();

      // Output waveform top boundary
      ctx.strokeStyle = 'rgba(8, 145, 178, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const outDb = h.outputDb[i];
        const norm = Math.max(0, Math.min(1, (outDb - -60) / 60));
        const y = waveLaneTop + waveLaneHeight * (1 - norm);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 3. Detected Envelope (Layer 3: Cyan line tracing compressor's actual detector, crossing threshold)
      ctx.strokeStyle = '#0891b2';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const detDb = h.detectedDb[i];
        const norm = Math.max(0, Math.min(1, (detDb - -60) / 60));
        const y = waveLaneTop + waveLaneHeight * (1 - norm);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 4. Threshold Horizontal Line & Soft Knee Shaded Band (Layer 4 & 5)
      const threshNorm = Math.max(0, Math.min(1, (currentState.threshold - -60) / 60));
      const threshY = waveLaneTop + waveLaneHeight * (1 - threshNorm);

      if (currentState.knee > 0) {
        const halfKneeNorm = (currentState.knee * 0.5) / 60;
        const kneeTopY = waveLaneTop + waveLaneHeight * (1 - Math.min(1, threshNorm + halfKneeNorm));
        const kneeBottomY = waveLaneTop + waveLaneHeight * (1 - Math.max(0, threshNorm - halfKneeNorm));

        ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
        ctx.fillRect(0, kneeTopY, width, kneeBottomY - kneeTopY);
      }

      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, threshY);
      ctx.lineTo(width, threshY);
      ctx.stroke();

      // 5. Attack/Release slope indicator — simple straight-line tent shape
      // Steeper attack = steeper rise line, steeper release = steeper fall line
      const attSec = Math.max(0.0001, currentState.attack);
      const relSec = Math.max(0.001, currentState.release);

      // Map time constants to horizontal width: faster = narrower (steeper line)
      // Use log scale so the visual difference between 1ms and 10ms is readable
      const maxTimeRef = 0.5; // 500ms reference for widest slope
      const attFraction = Math.min(1, Math.log(1 + attSec * 1000) / Math.log(1 + maxTimeRef * 1000));
      const relFraction = Math.min(1, Math.log(1 + relSec * 1000) / Math.log(1 + maxTimeRef * 1000));

      const slopeSpan = width * 0.35; // total width budget for the tent
      const attWidth = Math.max(8, attFraction * slopeSpan * 0.4);
      const relWidth = Math.max(8, relFraction * slopeSpan * 0.6);

      // Peak sits at threshold level on Lane B's dB axis
      const slopePeakY = threshY;
      const slopeBaseY = baselineY; // bottom of Lane B (-60dB)

      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, slopeBaseY);                          // start at bottom-left
      ctx.lineTo(attWidth, slopePeakY);                   // attack: straight line up
      ctx.lineTo(attWidth + relWidth, slopeBaseY);        // release: straight line down
      ctx.stroke();
      ctx.restore();

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [node]);

  return (
    <div
      style={{
        width: '100%',
        height,
        position: 'relative',
        background: '#FAFAFA',
        borderBottom: '1.5px solid #E4E4E7',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
};
