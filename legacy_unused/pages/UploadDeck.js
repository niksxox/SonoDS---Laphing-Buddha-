import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../context/ProjectContext";
import { useChat } from "../context/ChatContext"; 
import MixComparator from "../components/MixComparator"; 
import { AudioEngine } from "../utils/AudioEngine"; 
import SmartFader from "../components/SmartFader"; 
import LunaResultsChat from "../components/LunaResultsChat";

export default function UploadDeck() {
  const navigate = useNavigate();
  const scrollContainerRef = useRef(null);

  const { 
    files, setFiles, 
    aiResults, setAiResults, 
    mixSettings, setMixSettings, 
    resetSession 
  } = useProject();

  const [engine] = useState(() => new AudioEngine());
  const [status, setStatus] = useState("idle"); 
  
  // --- NEW: Track which deck is playing ---
  const [activeDeck, setActiveDeck] = useState(null); // 'raw' | 'mixed' | null

  // Animation State
  const [progress, setProgress] = useState(0);
  const [scanText, setScanText] = useState("INITIALIZING CORE...");

  // Cleanup
  useEffect(() => { return () => engine.dispose(); }, [engine]);

  // Scroll Reset
  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    const bed = document.querySelector('.interface-bed');
    if (bed) bed.scrollTop = 0;
  }, [status]);

  // Restore Audio
  useEffect(() => {
    if (status === 'idle' && files.vocals && !engine.buffers.vocals) {
        engine.loadStems(files);
    }
  }, [files, engine, status]);

  const safetyWarnings = useMemo(() => {
    if (!aiResults) return [];
    const warnings = [];
    ["vocals", "bass", "drums", "other"].forEach(stem => {
        const userVal = mixSettings[stem];
        const aiVal = aiResults[`${stem}_gain`];
        if (userVal === -Infinity) return;
        const diff = userVal - aiVal;
        if (Math.abs(diff) > 3.5) {
            warnings.push(`${stem.toUpperCase()} is ${diff > 0 ? 'loud' : 'quiet'} (${diff > 0 ? '+' : ''}${diff.toFixed(1)}dB).`);
        }
    });
    return warnings;
  }, [mixSettings, aiResults]);

  const handleUpload = (e, type) => {
    const file = e.target.files[0];
    if (file) setFiles(prev => ({ ...prev, [type]: file }));
  };

  // --- THE FIX: ISOLATED FADER CONTROL ---
  const handleMixChange = (stem, newDb) => {
    // 1. Always update the React State (Visuals)
    const newMix = { ...mixSettings, [stem]: newDb };
    setMixSettings(newMix);

    // 2. ONLY update the Audio Engine if we are NOT in Raw Mode
    if (activeDeck !== 'raw') {
        engine.applyInternalMix(newMix);
    }
  };

  const startAnalysis = async () => {
    if (!Object.values(files).every(f => f)) return alert("Please upload all 4 stems.");
    setStatus("scanning");
    setProgress(0);
    setScanText("LOADING AUDIO ENGINE...");
    
    engine.cleanup(); // Nuke old audio

    const loaded = await engine.loadStems(files);
    if(!loaded) {
        setStatus("idle");
        alert("Audio failed to load. Try refreshing.");
        return;
    }

    const stages = [
        { pct: 20, text: "ANALYZING FREQUENCY SPECTRUM..." },
        { pct: 45, text: "DETECTING TRANSIENTS..." },
        { pct: 70, text: "CALCULATING GAIN STAGING..." },
        { pct: 90, text: "OPTIMIZING HEADROOM..." },
        { pct: 100, text: "FINALIZING MIX..." }
    ];

    let currentStage = 0;
    const interval = setInterval(() => {
        if (currentStage >= stages.length) {
            clearInterval(interval);
            finishAnalysis();
        } else {
            const stage = stages[currentStage];
            setProgress(stage.pct);
            setScanText(stage.text);
            currentStage++;
        }
    }, 600);
  };

  const finishAnalysis = () => {
    // UPDATED: More drastic values so you can HEAR the difference
    const mockData = { 
        vocals_gain: -2.5, 
        bass_gain: -6.0, 
        drums_gain: -5.5, 
        other_gain: -4.0 
    };
    
    setAiResults(mockData);
    
    const initialMix = { 
        vocals: -2.5, 
        bass: -6.0, 
        drums: -5.5, 
        other: -4.0 
    };
    
    setMixSettings(initialMix);
    
    // Note: We don't need to setMix here because the player will set mode on click
    setStatus("complete");
  };

  if (status === "scanning") return (
    <div className="vst-screen-content center-flex" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="scan-container">
            <div className="scan-visual">
                <div className="ai-core-pulse"></div>
                <div className="ai-core-inner"></div>
            </div>
            <div className="progress-section">
                <div className="progress-bar-track"><div className="progress-bar-fill" style={{width: `${progress}%`}}></div></div>
                <div className="scan-readout"><span className="scan-text">{scanText}</span><span className="scan-pct">{progress}%</span></div>
            </div>
        </div>
    </div>
  );

  if (status === "complete" || aiResults) {
    return (
      <div className="vst-screen-content results-layout">
        <div className="results-scroll-container" ref={scrollContainerRef}>
          <div className="results-inner-wrapper" style={{gap: '15px'}}>
            
            {/* PASS ACTIVE STATE DOWN */}
            <MixComparator 
                engine={engine} 
                files={files} 
                mixSettings={mixSettings} 
                activeDeck={activeDeck}
                setActiveDeck={setActiveDeck}
            />

            <div className="clean-fader-rack">
              {["vocals", "bass", "drums", "other"].map((stem) => (
                <SmartFader 
                    key={stem} stem={stem} 
                    gain={mixSettings[stem]} 
                    aiSuggestion={aiResults[`${stem}_gain`]} 
                    onChange={handleMixChange} 
                />
              ))}
            </div>

            {safetyWarnings.length > 0 && (
                <div className="mix-safety-alert">
                    <div className="alert-icon">⚠️</div>
                    <div className="alert-content">
                        <strong>MIX BALANCE WARNING</strong>
                        <ul>{safetyWarnings.slice(0,1).map((w, i) => <li key={i}>{w}</li>)}</ul>
                    </div>
                </div>
            )}

            <div className="mixing-nav-zone">
                <button className="move-to-mixing-btn" onClick={() => navigate('/mixing')}>
                    <span className="btn-icon">🎛️</span>
                    <div className="btn-text">
                        <span className="btn-title">Advanced Mixing Tools</span>
                        <span className="btn-sub">EQ • Comp • Saturation • Stereo</span>
                    </div>
                    <span className="btn-arrow">→</span>
                </button>
            </div>

            <LunaResultsChat aiResults={aiResults} currentMix={mixSettings} safetyWarnings={safetyWarnings} />

            <div className="result-actions-bar" style={{paddingBottom: '40px'}}>
                <button className="text-btn" onClick={() => { engine.cleanup(); resetSession(); setStatus("idle"); }}>← New Session</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vst-screen-content upload-layout">
      <div id="force-dark-upload" style={{width:'100%', display:'flex', flexDirection:'column', alignItems:'center'}}>
        <div className="deck-header">
            <h2 className="deck-title" style={{color: '#94a3b8'}}>STEM INJECTION // <span className="blue-txt">AUTO-MODE</span></h2>
            <div className="status-readout">SYSTEM STATUS: <span className={Object.values(files).every(x => x) ? "status-ready" : "status-wait"}>{Object.values(files).every(x => x) ? "READY" : "WAITING"}</span></div>
        </div>
        <div className="bays-grid">
            {["vocals", "bass", "drums", "other"].map((stem) => (
            <div key={stem} className={`bay-module ${files[stem] ? "bay-active" : ""}`}>
                <div className="bay-header">
                <span className="bay-label">{stem.toUpperCase()} BUS</span>
                <div className={`signal-led ${files[stem] ? "led-green" : "led-red"}`}></div>
                </div>
                <div className="bay-body">
                <input type="file" id={`file-${stem}`} className="hidden-input" onChange={(e) => handleUpload(e, stem)} />
                <label htmlFor={`file-${stem}`} className="bay-trigger">
                    {files[stem] ? (
                    <div className="file-loaded-ui"><span className="file-name">{files[stem].name}</span><span className="tech-readout">LOADED</span></div>
                    ) : (
                    <div className="empty-slot-ui"><span className="plus-icon">+</span><span className="insert-text">INSERT</span></div>
                    )}
                </label>
                </div>
            </div>
            ))}
        </div>
        <button className="initialize-core-btn" onClick={startAnalysis}>INITIATE ANALYSIS</button>
      </div>
    </div>
  );
}