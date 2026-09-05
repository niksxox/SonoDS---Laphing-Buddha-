import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Gateway({ onSwitch, appMode }) {
  const navigate = useNavigate();

  // 1. Initialize local visual state based on the GLOBAL appMode
  const [visualMode, setVisualMode] = useState(appMode);

  // 2. Keep them in sync if parent changes
  useEffect(() => {
    setVisualMode(appMode);
  }, [appMode]);

  const toggleMode = () => {
    const targetMode = visualMode === 'auto' ? 'learn' : 'auto';
    setVisualMode(targetMode);
    onSwitch(targetMode);
  };

  const handleContinue = () => {
    if (visualMode === 'learn') {
      navigate("/learning-hub");
    } else {
      navigate("/upload");
    }
  };

  return (
    <div className="vst-screen-content gateway-flex">
      <div className="hero-text">
        <h1 className="main-logo">SONO<span className="blue-txt">DS</span></h1>
        <p className="subtitle">SELECT OPERATING PROTOCOL</p>
      </div>

      <div className="mode-selector-container">
        <div 
          className={`switch-track ${visualMode === 'learn' ? 'bg-gold' : 'bg-blue'}`}
          onClick={toggleMode}
        >
          <div 
            className={`switch-thumb ${visualMode === 'learn' ? 'slide-right' : 'slide-left'}`}
          ></div>
          <span className="label-left">AUTO</span>
          <span className="label-right">LEARN</span>
        </div>
      </div>

      <div className="mode-description-box">
        {visualMode === 'learn' ? (
          <p className="fade-in">"MASTER THE MIX" // Unlock educational insights and manual tools.</p>
        ) : (
          <p className="fade-in">"ONE-CLICK PERFECTION" // AI-driven spectral balancing.</p>
        )}
      </div>

      <button className="initialize-core-btn start-btn" onClick={handleContinue}>
        INITIALIZE SYSTEM
      </button>
    </div>
  );
}