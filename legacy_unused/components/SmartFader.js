import React, { useState, useEffect, useRef } from "react";
import "../App.css";

export default function SmartFader({ stem, gain, aiSuggestion, onChange }) {
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  // --- 1. CONFIGURATION ---
  const MAX_DB = 6;
  const MIX_FLOOR_DB = -12; 
  const MIN_DB = -60;       
  const BREAKPOINT_PCT = 30; 

  // --- 2. SANITIZATION ---
  // If we receive -Infinity, treat it as below the floor for calculations
  const safeGain = (gain === -Infinity || gain <= MIN_DB) ? MIN_DB : gain;
  const safeAI = isNaN(aiSuggestion) ? 0 : aiSuggestion;

  // --- 3. DUAL-SLOPE MATH ---
  const dbToPercent = (db) => {
    if (db === -Infinity) return 0;
    
    if (db >= MIX_FLOOR_DB) {
      const range = MAX_DB - MIX_FLOOR_DB;
      const progress = (db - MIX_FLOOR_DB) / range; 
      return BREAKPOINT_PCT + (progress * (100 - BREAKPOINT_PCT));
    } else {
      const range = MIX_FLOOR_DB - MIN_DB;
      const progress = (db - MIN_DB) / range;
      return progress * BREAKPOINT_PCT;
    }
  };

  const percentToDb = (pct) => {
    if (pct >= BREAKPOINT_PCT) {
      const progress = (pct - BREAKPOINT_PCT) / (100 - BREAKPOINT_PCT);
      const range = MAX_DB - MIX_FLOOR_DB;
      return MIX_FLOOR_DB + (progress * range);
    } else {
      const progress = pct / BREAKPOINT_PCT;
      const range = MIX_FLOOR_DB - MIN_DB;
      return MIN_DB + (progress * range);
    }
  };

  // --- 4. INTERACTION ---
  const handleMove = (e) => {
    if (!isDragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const height = rect.bottom - clientY;
    const pct = Math.max(0, Math.min(100, (height / rect.height) * 100));
    
    // FL STUDIO LOGIC:
    // Bottom 5% is a "Kill Switch" zone.
    let newDb;
    if (pct < 5) {
        newDb = -Infinity; 
    } else {
        newDb = percentToDb(pct);
    }
    
    onChange(stem, newDb);
  };

  // ... (Rest of component remains the same)
  const handleStart = () => {
    setIsDragging(true);
    document.body.style.cursor = "grabbing";
  };

  const handleEnd = () => {
    setIsDragging(false);
    document.body.style.cursor = "default";
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleMove);
      window.addEventListener("touchend", handleEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging]);

  const currentHeight = dbToPercent(safeGain);
  // Safe zone calculation remains same...
  const safeZoneTop = dbToPercent(safeAI + 2);
  const safeZoneBottom = dbToPercent(safeAI - 2);
  const safeZoneHeight = Math.max(2, safeZoneTop - safeZoneBottom);
  const isSafe = safeGain <= safeAI + 2 && safeGain >= safeAI - 2;

  return (
    <div className="smart-fader-wrapper">
      <div 
        className="fader-track-container" 
        ref={trackRef}
        onMouseDown={(e) => { handleStart(); handleMove(e); }}
        onTouchStart={(e) => { handleStart(); handleMove(e); }}
      >
        <div className="fader-rail"></div>

        <div 
          className="ai-ghost-zone"
          style={{ bottom: `${safeZoneBottom}%`, height: `${safeZoneHeight}%` }}
        ></div>

        <div 
          className={`fader-fill ${isSafe ? 'fill-safe' : 'fill-warn'}`}
          style={{ height: `${currentHeight}%` }}
        ></div>

        <div 
          className="fader-thumb"
          style={{ bottom: `${currentHeight}%` }}
        >
          <div className="thumb-grip"></div>
        </div>
      </div>

      <div className="fader-info">
        <span className="fader-stem-name">{stem}</span>
        <span className={`fader-db-val ${!isSafe && 'val-warn'}`}>
          {gain === -Infinity ? '-INF' : (safeGain > 0 ? '+' : '') + safeGain.toFixed(1)} dB
        </span>
      </div>
    </div>
  );
}