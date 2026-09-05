import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import '../App.css';

export default function MixingConsole() {
  const navigate = useNavigate();
  const { files, fxSettings, setFxSettings, mixSettings } = useProject();
  
  // Which stem are we editing?
  const [activeStem, setActiveStem] = useState('vocals');

  // --- HANDLERS ---

  // Update specific FX parameters in global context
  const updateFx = (module, param, value) => {
    setFxSettings(prev => ({
      ...prev,
      [activeStem]: {
        ...prev[activeStem],
        [module]: {
          ...prev[activeStem][module],
          [param]: value
        }
      }
    }));
  };

  // Logic to download all 4 mixed stems at once
  const handleBatchDownload = async () => {
    alert("Preparing high-fidelity stems for export...");
    
    // In a real implementation, you would trigger your engine.exportStems() here.
    // For now, we simulate the batch download process.
    const stemList = ['vocals', 'bass', 'drums', 'other'];
    
    for (const stem of stemList) {
        console.log(`Exporting processed ${stem} at ${mixSettings[stem]}dB...`);
        // Simulate a small delay between downloads to prevent browser blocking
        await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    alert("Batch Export Complete! Check your downloads folder. 📦");
  };

  return (
    <div className="vst-screen-content mixing-layout">
      
      {/* 1. TOP BAR: Stem Selector */}
      <div className="mixing-header">
        <div className="stem-tabs">
          {['vocals', 'bass', 'drums', 'other'].map(stem => (
            <button 
              key={stem}
              className={`stem-tab ${activeStem === stem ? 'active' : ''}`}
              onClick={() => setActiveStem(stem)}
            >
              {stem.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="close-mixing-btn" onClick={() => navigate('/upload')}>
            Back to Levels
        </button>
      </div>

      {/* 2. THE RACK (Modules) */}
      <div className="fx-rack-container">
        
        {/* MODULE: VISUAL EQ */}
        <div className="fx-module eq-module">
            <div className="module-header">
                <span>PARAMETRIC EQ</span>
                <div className="power-toggle active"></div>
            </div>
            <div className="eq-screen">
                <svg viewBox="0 0 300 100" className="eq-curve">
                    <path 
                        d={`M0,50 Q75,${50 - fxSettings[activeStem].eq.low} 150,${50 - fxSettings[activeStem].eq.mid} T300,${50 - fxSettings[activeStem].eq.high}`} 
                        fill="none" stroke="var(--accent)" strokeWidth="3"
                    />
                </svg>
            </div>
            <div className="knob-row">
                <InteractiveKnob 
                    label="LOW" 
                    value={fxSettings[activeStem].eq.low} 
                    onChange={(v) => updateFx('eq', 'low', v)} 
                />
                <InteractiveKnob 
                    label="MID" 
                    value={fxSettings[activeStem].eq.mid} 
                    onChange={(v) => updateFx('eq', 'mid', v)} 
                />
                <InteractiveKnob 
                    label="HIGH" 
                    value={fxSettings[activeStem].eq.high} 
                    onChange={(v) => updateFx('eq', 'high', v)} 
                />
            </div>
        </div>

        {/* MODULE: COMPRESSOR */}
        <div className="fx-module comp-module">
            <div className="module-header">
                <span>DYNAMICS</span>
                <div className="power-toggle active"></div>
            </div>
            <div className="meter-screen">
                <div className="gr-meter" style={{ width: `${fxSettings[activeStem].comp.ratio * 5}%` }}></div>
            </div>
            <div className="knob-row">
                <InteractiveKnob 
                    label="THRESH" 
                    value={fxSettings[activeStem].comp.thresh + 60} // Normalized for display
                    onChange={(v) => updateFx('comp', 'thresh', v - 60)} 
                />
                <InteractiveKnob 
                    label="RATIO" 
                    value={fxSettings[activeStem].comp.ratio * 10} 
                    onChange={(v) => updateFx('comp', 'ratio', v / 10)} 
                />
            </div>
        </div>

        {/* MODULE: SATURATION */}
        <div className="fx-module sat-module">
            <div className="module-header">
                <span>SATURATION</span>
                <div className="power-toggle active"></div>
            </div>
            <div className="tube-glow" style={{ opacity: fxSettings[activeStem].sat / 100 }}></div>
            <div className="knob-row single">
                <InteractiveKnob 
                    label="DRIVE" 
                    size={64} 
                    value={fxSettings[activeStem].sat} 
                    onChange={(v) => updateFx('sat', '', v)} 
                />
            </div>
        </div>

        {/* MODULE: STEREO */}
        <div className="fx-module stereo-module">
            <div className="module-header">
                <span>IMAGING</span>
                <div className="power-toggle active"></div>
            </div>
            <div className="stereo-visualizer">
                <div className="stereo-blob" style={{ transform: `scaleX(${1 + fxSettings[activeStem].width / 100})` }}></div>
            </div>
            <div className="knob-row single">
                <InteractiveKnob 
                    label="WIDTH" 
                    size={64} 
                    value={fxSettings[activeStem].width} 
                    onChange={(v) => updateFx('width', '', v)} 
                />
            </div>
        </div>

      </div>

      {/* 3. GLOBAL EXPORT BAR */}
      <div className="mastering-rack" style={{ marginTop: 'auto' }}>
        <div className="rack-module" style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
            <div className="rack-info-text">
                <span className="rack-label">PRODUCTION EXPORT</span>
                <p style={{ fontSize: '0.65rem', color: '#94a3b8', margin: 0 }}>This will render all 4 stems with EQ, Dynamics, and Saturation applied.</p>
            </div>
            <button className="master-export-btn" onClick={handleBatchDownload}>
                DOWNLOAD ALL MIXED STEMS <span className="btn-icon">📦</span>
            </button>
        </div>
      </div>
    </div>
  );
}

// --- INTERACTIVE KNOB COMPONENT ---
const InteractiveKnob = ({ label, value, onChange, size = 48 }) => {
    const handleMouseDown = (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startVal = value;

        const handleMouseMove = (moveEvent) => {
            const deltaY = startY - moveEvent.clientY;
            let newVal = startVal + deltaY;
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

    const rotation = (value / 100) * 270 - 135;

    return (
        <div className="premium-knob-wrapper">
            <div 
                className="knob-ring" 
                style={{ width: size, height: size, cursor: 'ns-resize' }}
                onMouseDown={handleMouseDown}
            >
                <div className="knob-cap" style={{ transform: `rotate(${rotation}deg)`, width: size * 0.75, height: size * 0.75 }}>
                    <div className="knob-pointer"></div>
                </div>
            </div>
            <span className="knob-label">{label}</span>
        </div>
    );
};