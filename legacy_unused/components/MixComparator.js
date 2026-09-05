import React, { useEffect, useState, useRef } from 'react';
import HolographicWaveform from './HolographicWaveform'; 
import '../App.css'; 

export default function MixComparator({ engine, files, mixSettings, activeDeck, setActiveDeck }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [progress, setProgress] = useState(0); 
  const [activeBuffer, setActiveBuffer] = useState(null);
  
  const rafRef = useRef();

  // Load Audio Buffer for Visualizer
  useEffect(() => {
    if (!files.vocals) return;
    const checkBuffer = setInterval(() => {
        if (engine && engine.buffers && engine.buffers.vocals && engine.buffers.vocals.loaded) {
            const buf = engine.getBuffer('vocals'); 
            if (buf) {
                setActiveBuffer(buf);
                setTotalTime(buf.duration);
                clearInterval(checkBuffer);
            }
        }
    }, 100);
    return () => clearInterval(checkBuffer);
  }, [files, engine]);

  // Sync Loop
  useEffect(() => {
    const loop = () => {
      if (engine.duration > 0) {
        const curr = engine.currentTime; 
        if (engine.isPlaying) {
            setCurrentTime(curr);
            setProgress(curr / engine.duration);
            setIsPlaying(true);
            
            if (curr >= engine.duration) {
                engine.stop();
                setIsPlaying(false);
                setActiveDeck(null);
                setProgress(1); // Reset to end or start
            }
        } else {
            setIsPlaying(false);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [engine, setActiveDeck]);

  const handlePlay = (deckType) => {
    // 1. If clicking the active deck, just Pause.
    if (activeDeck === deckType && isPlaying) {
        engine.stop();
        // Don't set activeDeck to null so we keep the "Active" styling, just stop audio.
        return;
    }

    // 2. Switch Modes
    if (deckType === 'raw') {
        engine.setRawMode(); 
    } else {
        engine.setMixedMode(mixSettings); 
    }

    // 3. Play
    if (!isPlaying) {
        if (progress >= 0.99) engine.play(0);
        else engine.play();
    }
    
    setActiveDeck(deckType);
  };

  const handleSeek = (newProgress) => {
    if (!activeBuffer) return;
    const newTime = newProgress * totalTime;
    setProgress(newProgress);
    setCurrentTime(newTime);
    engine.seek(newTime);
  };

  const formatTime = (time) => {
    if (!time) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="dual-player-container">
        
        {/* RAW DECK */}
        <SingleDeck 
            type="raw" label="RAW INPUT"
            isActive={activeDeck === 'raw'}
            isPlaying={isPlaying && activeDeck === 'raw'}
            onPlay={() => handlePlay('raw')}
            buffer={activeBuffer} 
            // VISUAL FIX: Only pass real progress if this deck is active
            progress={activeDeck === 'raw' ? progress : (activeDeck === null ? progress : 0)} 
            onSeek={handleSeek}
            currentTime={activeDeck === 'raw' ? currentTime : 0} 
            totalTime={totalTime} formatTime={formatTime}
            color="#94a3b8"
        />

        {/* MIXED DECK */}
        <SingleDeck 
            type="mixed" label="AI MIXED"
            isActive={activeDeck === 'mixed'}
            isPlaying={isPlaying && activeDeck === 'mixed'}
            onPlay={() => handlePlay('mixed')}
            buffer={activeBuffer} 
            // VISUAL FIX: Only pass real progress if this deck is active
            progress={activeDeck === 'mixed' ? progress : (activeDeck === null ? progress : 0)} 
            onSeek={handleSeek}
            currentTime={activeDeck === 'mixed' ? currentTime : 0} 
            totalTime={totalTime} formatTime={formatTime}
            color="#a78bfa"
        />
    </div>
  );
}

const SingleDeck = ({ type, label, isActive, isPlaying, onPlay, buffer, progress, onSeek, currentTime, totalTime, formatTime, color }) => {
    return (
        <div className={`player-strip ${isActive ? 'active-deck' : 'dimmed-deck'}`} style={{ marginBottom: '15px' }}>
            <button 
                className={`play-circle ${isActive ? 'active' : ''}`} 
                onClick={onPlay}
                style={isActive ? {background: color, color: 'white', boxShadow: `0 5px 15px ${color}66`} : {}}
            >
                {isPlaying ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginLeft:'2px'}}><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <div className="track-display">
                <div className="track-info-row">
                    <span className="track-title" style={isActive ? {color: color} : {}}>{label} {type === 'mixed' && <span className="highlight-tag">PROCESSED</span>}</span>
                    <div className="time-pill">{formatTime(currentTime)} / {formatTime(totalTime)}</div>
                </div>
                <div className="waveform-box">
                    {/* Pass isActive to the visualizer to handle dimming internally if needed */}
                    {buffer ? <HolographicWaveform buffer={buffer} progress={progress} onSeek={onSeek} activeColor={color} /> : <div className="loading-wave">LOADING...</div>}
                </div>
            </div>
        </div>
    );
};