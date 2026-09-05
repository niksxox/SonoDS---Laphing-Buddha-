// GateLiveTimeline.tsx — Real-Time Scrolling Visualization & Overlaid Transfer Curve (Phase 3)
import React, { useEffect, useRef } from 'react';
import { SonodsGateNode, GateState, GateTelemetryFrame } from '@sonods/gate-engine';

export interface GateLiveTimelineProps {
  node: SonodsGateNode;
  state: GateState;
  gainReductionDb: number;
  height?: number;
}

const HISTORY_LENGTH = 300; // ~5 seconds of scrolling history at 60fps

export const GateLiveTimeline: React.FC<GateLiveTimelineProps> = ({
  node,
  state,
  gainReductionDb,
  height = 220,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Rolling history buffers for real DSP telemetry (4-signal model)
  const historyRef = useRef<{
    inputDb: number[];
    outputDb: number[];
    detectedDb: number[];
    grDb: number[];
    isHolding: boolean[];
    maxLen: number;
  }>({
    inputDb: new Array(HISTORY_LENGTH).fill(-60),
    outputDb: new Array(HISTORY_LENGTH).fill(-60),
    detectedDb: new Array(HISTORY_LENGTH).fill(-60),
    grDb: new Array(HISTORY_LENGTH).fill(0),
    isHolding: new Array(HISTORY_LENGTH).fill(false),
    maxLen: HISTORY_LENGTH,
  });

  const latestTelemetryRef = useRef<GateTelemetryFrame>({
    inputDb: -60,
    detectedDb: -60,
    outputDb: -60,
    grDb: gainReductionDb,
    state: 'closed',
  });

  const stateRef = useRef<GateState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Subscribe to real DSP telemetry from the worklet/engine
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
    const STEP_MS = 1000 / 60; // 60fps fixed scroll step

    const render = (now: number) => {
      const delta = Math.min(100, now - lastTime);
      lastTime = now;
      timeAccumulator += delta;

      const current = latestTelemetryRef.current;
      const h = historyRef.current;
      const currentState = stateRef.current;

      // Advance history by fixed time increments
      while (timeAccumulator >= STEP_MS) {
        h.inputDb.shift();
        h.inputDb.push(Math.max(-60, current.inputDb));

        h.outputDb.shift();
        h.outputDb.push(Math.max(-60, current.outputDb));

        h.detectedDb.shift();
        h.detectedDb.push(Math.max(-60, current.detectedDb));

        h.grDb.shift();
        h.grDb.push(current.grDb);

        h.isHolding.shift();
        h.isHolding.push(current.state === 'holding');

        timeAccumulator -= STEP_MS;
      }

      // High-DPI canvas handling
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
      // Lane A (Top 30%): Gain Reduction / Boost trace
      // Lane B (Bottom 70%): Audio Levels, Threshold, Knee, and Overlaid Transfer Curve
      const grLaneHeight = Math.floor(hCanvas * 0.30);
      const waveLaneTop = grLaneHeight + 3;
      const waveLaneHeight = hCanvas - waveLaneTop;
      const baselineY = waveLaneTop + waveLaneHeight;

      // =========================================================================
      // Lane A: Gain Reduction / Boost Trace (Top Strip)
      // =========================================================================
      // 1. Purple Reference Line (0 dB Ceiling / Baseline)
      const purpleLineY = 12;
      ctx.strokeStyle = '#9333EA';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, purpleLineY);
      ctx.lineTo(width, purpleLineY);
      ctx.stroke();

      // 2. Green Lane Divider Line
      const greenLineY = grLaneHeight;
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, greenLineY);
      ctx.lineTo(width, greenLineY);
      ctx.stroke();

      // 3. Lane A Gridlines (0, -12, -24, -48 dB)
      const grSteps = [12, 24, 48];
      const maxGrScale = 60.0;
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

      // 4. Plot Gain Reduction Trace with distinct HOLD-stage highlight (Task 3.3)
      const points = h.maxLen;
      for (let i = 1; i < points; i++) {
        const xPrev = ((i - 1) / (points - 1)) * width;
        const xCurr = (i / (points - 1)) * width;

        const grPrev = h.grDb[i - 1];
        const grCurr = h.grDb[i];

        const isHolding = h.isHolding[i];

        // Map grDb (-60 to 0) to Y
        const grNormPrev = Math.min(1, Math.max(0, -grPrev / maxGrScale));
        const grNormCurr = Math.min(1, Math.max(0, -grCurr / maxGrScale));

        const yPrev = purpleLineY + grNormPrev * (greenLineY - purpleLineY);
        const yCurr = purpleLineY + grNormCurr * (greenLineY - purpleLineY);

        ctx.strokeStyle = isHolding ? '#D97706' : (currentState.mode === 'upward' && grCurr > 0 ? '#059669' : '#DC2626');
        ctx.lineWidth = isHolding ? 2.5 : 2.0;

        ctx.beginPath();
        ctx.moveTo(xPrev, yPrev);
        ctx.lineTo(xCurr, yCurr);
        ctx.stroke();
      }

      // =========================================================================
      // Lane B: Audio Levels, Threshold, Knee & Overlaid Transfer Curve
      // =========================================================================
      // dB Gridlines (-6, -12, -18, -24, -36, -48 dB)
      const dbSteps = [-6, -12, -18, -24, -36, -48];
      dbSteps.forEach((db) => {
        const norm = (db - -60) / 60;
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

      // 1. Input Level (Layer 1: Faint violet ghost fill)
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

      // 2. Output Level (Layer 2: Cyan/teal filled waveform — ducks cleanly when gate closes)
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

      // 3. Detected Envelope Line (Layer 3: Rich teal line)
      ctx.strokeStyle = '#0891B2';
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

      // 4. Threshold Line & Soft Knee Shaded Band
      const threshNorm = Math.max(0, Math.min(1, (currentState.threshold - -60) / 60));
      const threshY = waveLaneTop + waveLaneHeight * (1 - threshNorm);

      if (currentState.knee > 0) {
        const halfKneeNorm = (currentState.knee * 0.5) / 60;
        const kneeTopY = waveLaneTop + waveLaneHeight * (1 - Math.min(1, threshNorm + halfKneeNorm));
        const kneeBottomY = waveLaneTop + waveLaneHeight * (1 - Math.max(0, threshNorm - halfKneeNorm));

        ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
        ctx.fillRect(0, kneeTopY, width, kneeBottomY - kneeTopY);
      }

      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, threshY);
      ctx.lineTo(width, threshY);
      ctx.stroke();

      // 5. Reactive Attack / Hold / Release ballistics slope tent shape (Task 3.4)
      const attSec = Math.max(0.0001, currentState.attack);
      const holdSec = Math.max(0.0, currentState.hold);
      const relSec = Math.max(0.001, currentState.release);

      const maxTimeRef = 0.5; // 500ms reference
      const attFraction = Math.min(1, Math.log(1 + attSec * 1000) / Math.log(1 + maxTimeRef * 1000));
      const holdFraction = Math.min(1, Math.log(1 + holdSec * 1000) / Math.log(1 + maxTimeRef * 1000));
      const relFraction = Math.min(1, Math.log(1 + relSec * 1000) / Math.log(1 + maxTimeRef * 1000));

      const slopeSpan = width * 0.35;
      const attWidth = Math.max(8, attFraction * slopeSpan * 0.3);
      const holdWidth = Math.max(4, holdFraction * slopeSpan * 0.3);
      const relWidth = Math.max(8, relFraction * slopeSpan * 0.4);

      const slopePeakY = threshY;
      const slopeBaseY = baselineY;

      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, slopeBaseY);
      ctx.lineTo(attWidth, slopePeakY);                     // Attack rise
      ctx.lineTo(attWidth + holdWidth, slopePeakY);         // Hold flat top
      ctx.lineTo(attWidth + holdWidth + relWidth, slopeBaseY); // Release fall
      ctx.stroke();
      ctx.restore();

      // 6. Overlaid Static Transfer Curve with Live Bouncing Marker Dot (Task 3.1)
      const curveWidth = 140;
      const curveHeight = 90;
      const curveLeft = width - curveWidth - 16;
      const curveTop = waveLaneTop + 10;

      // Transfer curve box background
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.strokeStyle = '#E4E4E7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(curveLeft, curveTop, curveWidth, curveHeight, 6);
      ctx.fill();
      ctx.stroke();

      // Grid diagonal reference (1:1 unity gain line)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(curveLeft, curveTop + curveHeight);
      ctx.lineTo(curveLeft + curveWidth, curveTop);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw mathematical transfer curve
      ctx.strokeStyle = '#0891B2';
      ctx.lineWidth = 2.0;
      ctx.beginPath();

      const numCurvePoints = 60;
      let liveMarkerX = curveLeft;
      let liveMarkerY = curveTop + curveHeight;

      for (let p = 0; p <= numCurvePoints; p++) {
        const inLvl = -60 + (p / numCurvePoints) * 60; // -60 to 0 dBFS
        const delta = inLvl - currentState.threshold;
        let gain = 0.0;

        if (currentState.mode === 'gate') {
          const knee = currentState.knee;
          if (knee < 1e-4) {
            gain = delta >= 0 ? 0 : delta * (1 - 1 / currentState.ratio);
          } else {
            if (2 * delta > knee) gain = 0;
            else if (2 * Math.abs(delta) <= knee) {
              const x = delta - knee / 2;
              gain = -(1 - 1 / currentState.ratio) * (x * x) / (2 * knee);
            } else {
              gain = delta * (1 - 1 / currentState.ratio);
            }
          }
          gain = Math.max(-Math.abs(currentState.range), gain);
        } else if (currentState.mode === 'upward') {
          const slope = currentState.ratio - 1;
          gain = delta <= 0 ? 0 : Math.min(Math.abs(currentState.range), delta * slope);
        }

        const outLvl = Math.max(-60, Math.min(0, inLvl + gain));

        const xPx = curveLeft + (p / numCurvePoints) * curveWidth;
        const yPx = curveTop + curveHeight * (1 - (outLvl - -60) / 60);

        if (p === 0) ctx.moveTo(xPx, yPx);
        else ctx.lineTo(xPx, yPx);

        // Position live marker dot
        if (Math.abs(inLvl - current.inputDb) < 1.0) {
          liveMarkerX = xPx;
          liveMarkerY = yPx;
        }
      }
      ctx.stroke();

      // Live bouncing marker dot
      ctx.fillStyle = '#DC2626';
      ctx.shadowColor = 'rgba(220, 38, 38, 0.4)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(liveMarkerX, liveMarkerY, 3.5, 0, Math.PI * 2);
      ctx.fill();

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
