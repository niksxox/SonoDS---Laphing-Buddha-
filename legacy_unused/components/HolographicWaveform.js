import React, { useEffect, useRef } from 'react';

export default function HolographicWaveform({ buffer, progress, onSeek, activeColor = '#a78bfa' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!buffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Retina Scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // --- PROCESS DATA (STATIC) ---
    // We only need to calculate this once per buffer change
    const rawData = buffer.getChannelData(0); 
    const samples = 140; // Number of bars to draw
    const blockSize = Math.floor(rawData.length / samples); 
    const filteredData = [];

    // Find peaks for normalization
    let maxPeak = 0;
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[i * blockSize + j]);
      }
      const avg = sum / blockSize;
      if (avg > maxPeak) maxPeak = avg;
      filteredData.push(avg);
    }

    // Multiplier to normalize height
    const multiplier = 1 / (maxPeak || 1); 

    // --- DRAW FRAME ---
    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);

      const barWidth = rect.width / samples;
      const gap = 2; 
      const activeBarWidth = Math.max(1, barWidth - gap);

      // Define colors
      // We use the prop 'activeColor' for the played section
      const passiveColor = 'rgba(148, 163, 184, 0.2)'; 

      for (let i = 0; i < samples; i++) {
        let val = filteredData[i] * multiplier;
        
        // Logarithmic curve to make quiet parts visible
        let barHeight = Math.pow(val, 0.5) * rect.height;
        // Ensure at least a tiny sliver is visible if sound exists
        if (val > 0.001) barHeight = Math.max(4, barHeight); 

        const x = i * barWidth;
        const y = (rect.height - barHeight) / 2; // Center vertically

        // Logic: Is this bar "played" yet?
        const isPlayed = (i / samples) < progress;

        ctx.fillStyle = isPlayed ? activeColor : passiveColor;
        
        // Draw Bar
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, activeBarWidth, barHeight, 4); 
        } else {
            ctx.rect(x, y, activeBarWidth, barHeight);
        }
        ctx.fill();
        
        // Draw the glowing "Playhead" tip
        if (isPlayed && (i / samples) > (progress - 0.02)) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = activeColor;
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.shadowBlur = 0; // Reset shadow for next frame
        }
      }
    };

    // Draw immediately
    requestAnimationFrame(draw);

  }, [buffer, progress, activeColor]); // Re-run if any of these change

  // --- SEEKING HANDLER ---
  const handleClick = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Calculate click percentage (0.0 to 1.0)
    const clickProgress = Math.max(0, Math.min(1, x / rect.width));
    onSeek(clickProgress);
  };

  return (
    <canvas 
      ref={canvasRef} 
      onClick={handleClick}
      style={{ width: '100%', height: '100%', cursor: 'pointer', display: 'block' }}
    />
  );
}