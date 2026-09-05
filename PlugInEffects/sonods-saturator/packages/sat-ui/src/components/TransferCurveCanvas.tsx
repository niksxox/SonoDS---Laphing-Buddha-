import React, { useEffect, useRef } from 'react';
import { SonodsSaturatorNode } from '@sonods/sat-engine';

interface TransferCurveCanvasProps {
  node: SonodsSaturatorNode;
  width?: number;
  height?: number;
  accentColor?: string;
  audioPeak?: number; // Live audio amplitude
}

export const TransferCurveCanvas: React.FC<TransferCurveCanvasProps> = ({
  node,
  width = 280,
  height = 180,
  accentColor = '#38bdf8',
  audioPeak = 0.0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number>(0);
  const smoothPeak = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Subtle Grid
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;

      // Axis lines
      const midX = width / 2;
      const midY = height / 2;

      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, height);
      ctx.stroke();

      // Grid bounding box
      ctx.strokeRect(10, 10, width - 20, height - 20);

      // Linear identity reference line (y = x)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(10, height - 10);
      ctx.lineTo(width - 10, 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Fetch and Draw Non-Linear Transfer Curve
      const points = node.getTransferCurve(128);
      if (points.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const px = midX + pt.x * (midX - 10);
          const py = midY - pt.y * (midY - 10);

          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }

        // Curve styling with glowing gradient
        const grad = ctx.createLinearGradient(10, 0, width - 10, 0);
        grad.addColorStop(0, '#8b5cf6');
        grad.addColorStop(0.3, '#06b6d4');
        grad.addColorStop(0.5, '#eab308');
        grad.addColorStop(0.7, '#f97316');
        grad.addColorStop(1, '#ef4444');

        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // 3. Live Audio Tracking Ball on Curve
      smoothPeak.current = smoothPeak.current * 0.8 + audioPeak * 0.2;
      const curX = Math.max(-1.0, Math.min(1.0, smoothPeak.current));

      // Interpolate Y from transfer curve
      let curY = curX;
      if (points.length > 0) {
        const normIdx = ((curX + 1.0) / 2.0) * (points.length - 1);
        const idx = Math.min(points.length - 1, Math.max(0, Math.round(normIdx)));
        curY = points[idx].y;
      }

      const ballPx = midX + curX * (midX - 10);
      const ballPy = midY - curY * (midY - 10);

      // Glowing Ball
      ctx.beginPath();
      ctx.arc(ballPx, ballPy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      animFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animFrameId.current);
    };
  }, [accentColor, audioPeak, height, node, width]);

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--sat-radius-md)',
        background: 'var(--sat-bg-input)',
        border: '1px solid var(--sat-border-subtle)',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.08)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width,
          height,
          display: 'block',
        }}
      />
      {/* Visualizer header badge */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '12px',
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--sat-text-muted)',
        }}
      >
        Transfer Function [y = f(x)]
      </div>
    </div>
  );
};
