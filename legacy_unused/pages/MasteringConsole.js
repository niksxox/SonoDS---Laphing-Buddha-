import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

export default function MasteringConsole() {
  const navigate = useNavigate();
  
  // 1. STATE FOR TARGETS
  const [activeTarget, setActiveTarget] = useState('spotify'); // 'spotify', 'apple', 'cd'
  
  // 2. STATE FOR PARAMETERS
  const [loudness, setLoudness] = useState(50); 
  const [eqLow, setEqLow] = useState(30);
  const [eqHigh, setEqHigh] = useState(60);
  const [glue, setGlue] = useState(40);
  const [punch, setPunch] = useState(50);
  const [width, setWidth] = useState(45);
  const [monoBass, setMonoBass] = useState(true);

  return (
    <div className="vst-screen-content mastering-layout">
      
      {/* HEADER: Functional Target Selection */}
      <div className="mastering-header">
        <div className="target-pill-group">
            <span className="target-label">TARGET:</span>
            
            <button 
                className={`target-btn ${activeTarget === 'spotify' ? 'active' : ''}`}
                onClick={() => { setActiveTarget('spotify'); setLoudness(60); }} // Auto-set loudness example
            >
                SPOTIFY (-14 LUFS)
            </button>
            
            <button 
                className={`target-btn ${activeTarget === 'apple' ? 'active' : ''}`}
                onClick={() => { setActiveTarget('apple'); setLoudness(55); }}
            >
                APPLE (-16 LUFS)
            </button>
            
            <button 
                className={`target-btn ${activeTarget === 'cd' ? 'active' : ''}`}
                onClick={() => { setActiveTarget('cd'); setLoudness(85); }}
            >
                CD (-9 LUFS)
            </button>
        </div>
        <button className="close-mixing-btn" onClick={() => navigate('/learning-hub')}>
            EXIT
        </button>
      </div>

      {/* MAIN STAGE */}
      <div className="mastering-stage">
        
        {/* LEFT: SPECTRUM */}
        <div className="analyzer-panel glass-panel">
            <div className="panel-header">
                <span>SPECTRUM // LUFS</span>
                <div className="live-dot"></div>
            </div>
            
            <div className="spectrum-display">
                <svg viewBox="0 0 400 150" className="spectrum-svg" preserveAspectRatio="none">
                    <path d="M0,150 L0,120 Q50,100 100,130 T200,80 T300,100 T400,60 V150 Z" 
                          fill="url(#specGradient)" opacity="0.6" />
                    <defs>
                        <linearGradient id="specGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fbbf24"/>
                            <stop offset="100%" stopColor="transparent"/>
                        </linearGradient>
                    </defs>
                </svg>
                
                <div className="lufs-readout">
                    {/* Dynamic LUFS based on Knob */}
                    <span className="lufs-val">-{ (18 - (loudness * 0.1)).toFixed(1) }</span>
                    <span className="lufs-unit">LUFS</span>
                </div>
            </div>
        </div>

        {/* RIGHT: THE HERO KNOB (Now Interactive) */}
        <div className="maximizer-panel glass-panel">
            <div className="panel-header">
                <span>MAXIMIZER INTENSITY</span>
            </div>
            
            <InteractiveKnob 
                size={200} 
                value={loudness} 
                onChange={setLoudness} 
                color="#f59e0b"
                isHero={true}
            />
        </div>
      </div>

      {/* BOTTOM RACK */}
      <div className="mastering-rack">
        
        {/* EQ MODULE */}
        <div className="rack-module">
            <span className="rack-label">TONAL BALANCE</span>
            <div className="rack-controls">
                <InteractiveKnob size={50} value={eqLow} onChange={setEqLow} label="WARMTH" color="#f59e0b" />
                <InteractiveKnob size={50} value={eqHigh} onChange={setEqHigh} label="AIR" color="#f59e0b" />
            </div>
        </div>

        <div className="rack-separator"></div>

        {/* DYNAMICS MODULE */}
        <div className="rack-module">
            <span className="rack-label">DYNAMICS</span>
            <div className="rack-controls">
                <InteractiveKnob size={50} value={glue} onChange={setGlue} label="GLUE" color="#f59e0b" />
                <InteractiveKnob size={50} value={punch} onChange={setPunch} label="PUNCH" color="#f59e0b" />
            </div>
        </div>

        <div className="rack-separator"></div>

        {/* STEREO MODULE */}
        <div className="rack-module">
            <span className="rack-label">STEREO FIELD</span>
            <div className="rack-controls">
                <InteractiveKnob size={50} value={width} onChange={setWidth} label="WIDTH" color="#f59e0b" />
                <div className="mono-check" onClick={() => setMonoBass(!monoBass)}>
                    <div className={`check-box ${monoBass ? 'active' : ''}`}></div>
                    <span>MONO BASS</span>
                </div>
            </div>
        </div>

        <div className="master-export-zone">
            <button className="master-export-btn">
                EXPORT MASTER <span className="btn-icon">💿</span>
            </button>
        </div>

      </div>
    </div>
  );
}

// --- REUSABLE INTERACTIVE KNOB ---
// This handles the "Click & Drag" logic smoothly
const InteractiveKnob = ({ size, value, onChange, color, label, isHero = false }) => {
    const knobRef = useRef(null);

    const handleMouseDown = (e) => {
        e.preventDefault(); // Stop text selection
        const startY = e.clientY;
        const startVal = value;

        const handleMouseMove = (moveEvent) => {
            const deltaY = startY - moveEvent.clientY; // Drag UP to increase
            const sensitivity = isHero ? 0.5 : 1.5; // Bigger knob = finer control
            let newVal = startVal + (deltaY * sensitivity);
            
            // Clamp between 0 and 100
            newVal = Math.max(0, Math.min(100, newVal));
            onChange(newVal);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Calculate rotation: 0% = -135deg, 100% = +135deg
    const rotation = (value / 100) * 270 - 135;

    return (
        <div className="knob-container-wrapper" style={{ width: size, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div 
                className={`interactive-knob ${isHero ? 'hero-knob' : 'rack-knob'}`}
                style={{ width: size, height: size, cursor: 'ns-resize' }}
                onMouseDown={handleMouseDown}
                ref={knobRef}
            >
                {/* The Colored Ring (Conic Gradient) */}
                <div 
                    className="knob-ring-fill"
                    style={{
                        background: `conic-gradient(
                            from 225deg, 
                            ${color} 0%, 
                            ${color} ${value * 0.75}%, 
                            #e2e8f0 ${value * 0.75}%, 
                            #e2e8f0 75%, 
                            transparent 75%
                        )`
                    }}
                />
                
                {/* The Inner Cap (Rotates) */}
                <div className="knob-cap-rotator" style={{ transform: `rotate(${rotation}deg)` }}>
                    <div className="knob-pointer" style={{ backgroundColor: color }}></div>
                </div>

                {/* Hero Value Display */}
                {isHero && (
                    <div className="hero-value-display">
                        {Math.round(value)}%
                    </div>
                )}
            </div>
            {label && <span className="rack-knob-label">{label}</span>}
        </div>
    );
};