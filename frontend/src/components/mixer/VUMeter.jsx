import React, { useRef, useEffect } from 'react';

const VUMeter = ({ getAnalyserData, isPlaying }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      // Clear canvas to empty/dark when stopped
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 8, 200);
      }
      return;
    }

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const data = getAnalyserData();
      if (!data) { rafRef.current = requestAnimationFrame(draw); return; }

      // RMS level calculation
      const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
      const level = Math.min(1, rms * 8); // scale to 0–1

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const h = canvas.height;
      const filled = level * h;

      // Draw segments — green bottom, yellow middle, red top
      for (let y = h; y > h - filled; y -= 4) {
        const pct = 1 - (y / h);
        ctx.fillStyle = pct > 0.85 ? '#ef4444' : pct > 0.65 ? '#fbbf24' : '#4ade80';
        ctx.fillRect(0, y - 3, canvas.width, 3);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, getAnalyserData]);

  return (
    <canvas
      ref={canvasRef}
      width={8}
      height={200}
      style={{ borderRadius: '2px', background: 'var(--mixer-waveform-bg)' }}
    />
  );
};

export default VUMeter;
