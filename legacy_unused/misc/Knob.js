import React from 'react';

export default function Knob({ label, value, color = "#3b82f6" }) {
  // Map value to rotation (-135 to 135)
  const rotation = Math.min(135, Math.max(-135, value * 13.5));

  return (
    <div className="flex flex-col items-center gap-3">
      {/* The Knob Container */}
      <div className="relative w-20 h-20 rounded-full flex items-center justify-center">
        
        {/* SHADOW RING (The depth on the chassis) */}
        <div className="absolute inset-0 rounded-full bg-black opacity-50 blur-sm translate-y-1"></div>

        {/* THE KNOB BODY (Brushed Aluminum Look) */}
        <div 
          className="relative w-full h-full rounded-full transition-transform duration-500 cubic-bezier(0.2, 0.8, 0.2, 1)"
          style={{ 
            transform: `rotate(${rotation}deg)`,
            // This conic gradient simulates light hitting metal from different angles
            background: `conic-gradient(from 180deg, #2a2a2a 0%, #1a1a1a 45%, #444 50%, #1a1a1a 55%, #2a2a2a 100%)`,
            boxShadow: `
              inset 0 1px 1px rgba(255,255,255,0.1), 
              0 4px 10px rgba(0,0,0,0.5),
              0 0 0 1px #111
            ` 
          }}
        >
          {/* THE CAP (The top face) */}
          <div className="absolute inset-2 rounded-full bg-[#18181b] shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)] flex items-center justify-center">
             {/* The Indicator Light */}
             <div className="absolute top-1.5 w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]" style={{ backgroundColor: color }}></div>
             <div className="absolute top-1.5 w-0.5 h-3 bg-current opacity-50 blur-[1px]" style={{ backgroundColor: color }}></div>
          </div>
        </div>

      </div>

      {/* TEXT LABELS */}
      <div className="text-center space-y-1">
        <div className="text-[9px] font-bold text-[#666] uppercase tracking-[0.2em]">{label}</div>
        <div className="font-mono text-[10px] text-[#444]">{value > 0 ? '+' : ''}{value.toFixed(1)} dB</div>
      </div>
    </div>
  );
}