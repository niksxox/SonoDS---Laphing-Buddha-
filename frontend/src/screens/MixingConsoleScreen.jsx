import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { STEM_CONFIG, DEVIATION_THRESHOLD } from '../utils/stemConfig';
import useAudioEngine from '../hooks/useAudioEngine';
import useMixerStore from '../store/useMixerStore';
import ChannelStrip from '../components/mixer/ChannelStrip';
import EffectsPanel from '../components/mixer/EffectsPanel';
import PluginHost from '../components/mixer/PluginHost';

// ── Bus color palette for dynamic tracks ──
const BUS_ROLE_COLORS = {
  lead_vocal: '#a78bfa', backing_vocal: '#a78bfa',
  kick: '#f87171', snare: '#f87171', hihat: '#f87171', drums: '#f87171',
  bass: '#34d399', sub_bass: '#34d399',
  lead_synth: '#c084fc', pad: '#c084fc', piano: '#c084fc', keys: '#c084fc',
  guitar: '#60a5fa',
  strings: '#5eead4',
  brass: '#fbbf24',
  fx: '#fb923c',
  other: '#94a3b8',
};

/**
 * Convert /mix-v2 API response tracks into the STEM_CONFIG-compatible
 * shape that ChannelStrip, useAudioEngine, and useMixerStore expect.
 */
function apiTracksToStemConfig(mixResponse) {
  if (!mixResponse || !mixResponse.tracks || mixResponse.tracks.length === 0) {
    return null;
  }
  return mixResponse.tracks.map((track) => {
    const staticHost = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    return {
      id: track.id || track.filename,
      filename: track.filename,
      displayName: track.role_display || track.role || track.filename.replace(/\.[^/.]+$/, ''),
      bus: track.bus || 'Unclassified',
      role: track.role || 'other',
      audioUrl: `http://${staticHost}:3001/stems/${track.filename}`,
      initialDB: track.gain_db != null ? track.gain_db : 0,
      color: BUS_ROLE_COLORS[track.role] || '#94a3b8',
      safeRange: track.safe_range_db != null ? track.safe_range_db : DEVIATION_THRESHOLD,
      reasoning: track.reasoning || '',
      confidence: track.confidence || 0,
      alreadyGoodScore: track.already_good_score || 0,
      eq: track.eq || {},
      compressor: track.compressor || {},
      sends: track.sends || {},
    };
  });
}

// ─── Format seconds to MM:SS ───
const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// ─── Waveform Timeline Component (DAW-style scrubber) ───
const WaveformTimeline = ({ audioEngine, duration, mode }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const rafRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const waveform = audioEngine.getWaveform();

  useEffect(() => {
    const tick = () => {
      const t = audioEngine.getElapsed();
      setElapsed(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const progress = duration > 0 ? elapsed / duration : 0;

    ctx.clearRect(0, 0, w, h);

    const barWidth = w / waveform.length;
    const centerY = h / 2;

    waveform.forEach((peak, i) => {
      const x = i * barWidth;
      const barH = Math.max(1, peak * h * 0.85);
      const isPast = (i / waveform.length) < progress;

      ctx.fillStyle = isPast
        ? (mode === 'learn' ? '#2563EB' : 'rgba(167, 139, 250, 0.7)')
        : (mode === 'learn' ? 'rgba(30, 41, 59, 0.25)' : 'rgba(255, 255, 255, 0.15)');

      ctx.fillRect(x + 0.5, centerY - barH / 2, Math.max(1, barWidth - 1), barH);
    });

    const playheadX = progress * w;
    const accentColor = mode === 'learn' ? '#2563EB' : '#c4b5fd';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = mode === 'learn' ? 'transparent' : 'rgba(167, 139, 250, 0.6)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(playheadX, 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }, [elapsed, duration, waveform, mode]);

  const handleClick = (e) => {
    const container = containerRef.current;
    if (!container || duration <= 0) return;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    audioEngine.seekTo(ratio * duration);
  };

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
      <span style={{
        fontSize: '10px',
        fontFamily: "'JetBrains Mono', monospace",
        color: 'var(--mixer-subtext)',
        letterSpacing: '0.5px',
        flexShrink: 0,
        minWidth: '38px',
        textAlign: 'center',
      }}>
        {formatTime(elapsed)}
      </span>

      <div
        ref={containerRef}
        onClick={handleClick}
        style={{
          flex: 1,
          height: '36px',
          background: 'var(--mixer-waveform-bg)',
          borderRadius: '6px',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          border: '0.5px solid var(--mixer-waveform-border)',
          minWidth: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={36}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>

      <span style={{
        fontSize: '10px',
        fontFamily: "'JetBrains Mono', monospace",
        color: 'var(--mixer-subtext)',
        letterSpacing: '0.5px',
        flexShrink: 0,
        minWidth: '38px',
        textAlign: 'center',
      }}>
        {formatTime(duration)}
      </span>
    </div>
  );
};


// ─── Main Mixing Console Screen ───
const MixingConsoleScreen = ({ onCompare, mode }) => {
  const audioEngine = useAudioEngine();
  const {
    selectedStemId, mutedStems, soloedStemId, isPlaying, bypass, currentGains,
    selectStem, toggleMute, toggleSolo, setGain, setPlaying, toggleBypass,
    mixResponse,
  } = useMixerStore();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const initRef = useRef(false);
  const [bypassVersion, setBypassVersion] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  // Build the active stem config: use /mix-v2 API result if available, else demo
  const stemConfig = useMemo(() => {
    const fromApi = apiTracksToStemConfig(mixResponse);
    return fromApi || STEM_CONFIG;
  }, [mixResponse]);

  // Auto mode = faders locked
  const isLocked = mode === 'auto';
  const duration = audioEngine.getDuration();

  // Count how many stems are in danger zone (using per-track safe range if available)
  const dangerCount = stemConfig.filter((stem) => {
    const currentDB = currentGains[stem.id];
    if (currentDB === undefined || bypass) return false;
    const threshold = stem.safeRange != null ? stem.safeRange : DEVIATION_THRESHOLD;
    return Math.abs(currentDB - stem.initialDB) > threshold;
  }).length;

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) { clearInterval(interval); return 90; }
        return prev + Math.random() * 15;
      });
    }, 200);

    audioEngine.initialize(stemConfig)
      .then(() => {
        clearInterval(interval);
        setLoadingProgress(100);
        setTimeout(() => setLoaded(true), 300);
      })
      .catch((err) => {
        clearInterval(interval);
        console.error("Failed to initialize audio engine:", err);
        setError(err.message || "Failed to load audio stems. Please check if the backend server is running.");
      });

    stemConfig.forEach(stem => setGain(stem.id, stem.initialDB));

    return () => {
      clearInterval(interval);
      audioEngine.stop();
      setPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGainChange = useCallback((stemId, dB) => {
    setGain(stemId, dB);
    audioEngine.setChannelGain(stemId, dB);
  }, [audioEngine, setGain]);

  const handlePlay = useCallback(() => {
    audioEngine.play();
    setPlaying(true);
  }, [audioEngine, setPlaying]);

  const handleStop = useCallback(() => {
    audioEngine.stop();
    setPlaying(false);
  }, [audioEngine, setPlaying]);

  // Stop audio BEFORE navigating to Compare
  const handleCompare = useCallback(() => {
    audioEngine.stop();
    audioEngine.resetPlayhead();
    setPlaying(false);
    onCompare();
  }, [audioEngine, setPlaying, onCompare]);

  // Bypass toggle handler
  const handleBypass = useCallback(() => {
    toggleBypass(audioEngine, stemConfig);
    setBypassVersion(v => v + 1);
  }, [audioEngine, toggleBypass, stemConfig]);

  // Toast for locked fader attempt (auto mode)
  const showLockedToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast('Feature not available in free version. Switch to Learn mode for full control.');
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  return (
    <div style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      color: 'var(--mixer-page-color)',
      position: 'relative',
      zIndex: 1,
      overflow: 'hidden',
    }}>
      {/* Subheader */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 16px 10px 16px',
        borderBottom: '0.5px solid var(--mixer-transport-border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontSize: '11px',
            letterSpacing: '3px',
            color: 'var(--mixer-subtext)',
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
          }}>
            MIXING CONSOLE
          </span>
          <span style={{
            fontSize: '9px',
            letterSpacing: '1px',
            color: 'var(--accent)',
            fontFamily: "'JetBrains Mono', monospace",
            padding: '2px 8px',
            background: 'rgba(167,139,250,0.1)',
            borderRadius: '4px',
          }}>
          {isLocked ? 'AUTO-MODE' : 'LEARN-MODE'}
          </span>
          <span style={{
            fontSize: '9px',
            letterSpacing: '1px',
            color: 'var(--mixer-subtext)',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {stemConfig.length} CH
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Danger zone warning banner */}
          {dangerCount > 0 && (
            <div style={{
              fontSize: '8px',
              color: '#fca5a5',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.5px',
              padding: '3px 8px',
              background: 'rgba(239,68,68,0.1)',
              border: '0.5px solid rgba(239,68,68,0.25)',
              borderRadius: '4px',
              animation: 'dangerBlink 2s ease-in-out infinite',
            }}>
              ⚠ {dangerCount} STEM{dangerCount > 1 ? 'S' : ''} OUT OF AI RANGE
            </div>
          )}
          <div style={{
            fontSize: '9px',
            color: loaded ? '#22c55e' : 'var(--mixer-subtext)',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '1px',
          }}>
            {loaded ? '● READY' : `LOADING ${Math.round(loadingProgress)}%`}
          </div>
        </div>
      </div>

      {/* Loading state / Error State */}
      {!loaded && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          padding: '40px',
          textAlign: 'center',
        }}>
          {error ? (
            <>
              <div style={{ 
                fontSize: '40px', 
                marginBottom: '10px',
                animation: 'pulse 2s infinite' 
              }}>⚠️</div>
              <h3 style={{ 
                color: '#ef4444', 
                fontSize: '16px', 
                letterSpacing: '2px',
                margin: '0 0 10px 0'
              }}>INITIALIZATION FAILED</h3>
              <p style={{
                fontSize: '11px',
                color: 'var(--mixer-subtext)',
                fontFamily: "'JetBrains Mono', monospace",
                maxWidth: '400px',
                lineHeight: '1.6',
                marginBottom: '20px',
              }}>
                {error}
              </p>
              <button 
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 24px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '6px',
                  color: '#f87171',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                RETRY SYSTEM
              </button>
            </>
          ) : (
            <>
              <div style={{
                width: '200px',
                height: '3px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${loadingProgress}%`,
                  background: 'linear-gradient(90deg, #a78bfa, #c084fc)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease-out',
                }} />
              </div>
              <p style={{
                fontSize: '10px',
                letterSpacing: '2px',
                color: 'var(--mixer-subtext)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                LOADING STEM DATA...
              </p>
            </>
          )}
        </div>
      )}

      {/* Main mixer area */}
      {loaded && (
        <div style={{
          flex: 1,
          display: 'flex',
          gap: '12px',
          padding: '12px 16px',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          <div style={{
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            flex: 1,
            paddingBottom: '8px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.1) transparent',
            alignItems: 'stretch',
          }}>
            {stemConfig.map(stem => (
              <ChannelStrip
                key={stem.id}
                stem={stem}
                isSelected={selectedStemId === stem.id}
                isMuted={mutedStems.has(stem.id)}
                isSoloed={soloedStemId === stem.id}
                onSelect={() => selectStem(stem.id)}
                onMute={(id) => toggleMute(id, audioEngine)}
                onSolo={(id) => toggleSolo(id, audioEngine, stemConfig)}
                onGainChange={handleGainChange}
                getAnalyserData={audioEngine.getAnalyserData}
                isPlaying={isPlaying}
                bypass={bypass}
                bypassVersion={bypassVersion}
                currentDB={currentGains[stem.id]}
                locked={isLocked}
                onLockedAttempt={showLockedToast}
                mode={mode}
              />
            ))}
          </div>

          <EffectsPanel stems={stemConfig} audioEngine={audioEngine} />
        </div>
      )}

      {/* Floating FL Studio Plugin Host Window */}
      <PluginHost
        updateTrackFx={audioEngine?.updateTrackFx}
        getAnalyserData={audioEngine?.getAnalyserData}
        checkIsPlaying={audioEngine?.checkIsPlaying}
        tracks={stemConfig}
      />

      {/* Transport bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        borderTop: '0.5px solid var(--mixer-transport-border)',
        background: 'var(--mixer-transport-bg)',
        flexShrink: 0,
      }}>
        {loaded && (
          <>
            {/* Play/Stop */}
            <button
              onClick={isPlaying ? handleStop : handlePlay}
              style={{
                padding: '8px 20px',
                background: isPlaying 
                  ? (mode === 'learn' ? 'var(--danger-color-15)' : 'rgba(239,68,68,0.15)')
                  : (mode === 'learn' ? 'var(--btn-bg)' : 'rgba(167,139,250,0.15)'),
                border: `0.5px solid ${isPlaying ? (mode === 'learn' ? 'var(--danger-color-30)' : 'rgba(239,68,68,0.3)') : (mode === 'learn' ? 'var(--btn-border)' : 'rgba(167,139,250,0.3)')}`,
                borderRadius: '8px',
                color: isPlaying ? (mode === 'learn' ? 'var(--danger-color)' : '#ef4444') : 'var(--accent)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
            >
              {isPlaying ? '■ STOP' : '▶ PLAY'}
            </button>

            {/* ★ BYPASS BUTTON (Learn mode only — no point in auto) */}
            {!isLocked && (
              <button
                onClick={handleBypass}
                style={{
                  padding: '8px 14px',
                  background: bypass
                    ? (mode === 'learn' ? 'var(--danger-color-20)' : 'rgba(251,191,36,0.2)')
                    : 'var(--btn-bg)',
                  border: `0.5px solid ${bypass ? (mode === 'learn' ? 'var(--danger-color)' : 'rgba(251,191,36,0.4)') : 'var(--mixer-transport-border)'}`,
                  borderRadius: '8px',
                  color: bypass ? (mode === 'learn' ? 'var(--danger-color)' : '#fbbf24') : 'var(--mixer-subtext)',
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  position: 'relative',
                }}
                onMouseOver={(e) => {
                  if (!bypass) {
                    e.target.style.borderColor = mode === 'learn' ? 'var(--danger-color)' : 'rgba(251,191,36,0.3)';
                    e.target.style.color = mode === 'learn' ? 'var(--danger-color)' : '#fbbf24';
                  }
                }}
                onMouseOut={(e) => {
                  if (!bypass) {
                    e.target.style.borderColor = 'var(--mixer-transport-border)';
                    e.target.style.color = 'var(--mixer-subtext)';
                  }
                }}
              >
                {bypass ? '⊘ BYPASS ON' : '⊘ BYPASS'}
              </button>
            )}

            {/* Waveform timeline */}
            <WaveformTimeline 
              audioEngine={audioEngine} 
              duration={duration} 
              mode={mode} 
            />

            {/* Compare */}
            <button
              onClick={handleCompare}
              style={{
                padding: '8px 20px',
                background: mode === 'learn' ? 'var(--btn-bg)' : 'rgba(74,222,128,0.15)',
                border: `0.5px solid ${mode === 'learn' ? 'var(--btn-border)' : 'rgba(74,222,128,0.3)'}`,
                borderRadius: '8px',
                color: mode === 'learn' ? 'var(--accent)' : '#4ade80',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
              onMouseOver={(e) => {
                e.target.style.background = 'rgba(74,222,128,0.2)';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'rgba(74,222,128,0.1)';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              COMPARE →
            </button>
          </>
        )}
      </div>

      {/* ★ TOAST notification (auto mode locked fader attempt) */}
      {toast && (
        <div style={{
          position: 'absolute',
          bottom: '70px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 20px',
          background: 'rgba(15,15,20,0.92)',
          border: '0.5px solid rgba(167,139,250,0.3)',
          borderRadius: '10px',
          color: '#c4b5fd',
          fontSize: '11px',
          fontFamily: "'Inter', sans-serif",
          fontWeight: 500,
          letterSpacing: '0.3px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(167,139,250,0.1)',
          zIndex: 100,
          animation: 'toastIn 0.3s ease-out',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '14px' }}>🔒</span>
          {toast}
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes eqBar {
          from { height: 4px; }
          to { height: 16px; }
        }
        @keyframes dangerBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        ::-webkit-scrollbar { height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
};

export default MixingConsoleScreen;
