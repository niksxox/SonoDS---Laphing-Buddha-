import React, { useState, useRef, useEffect, useCallback } from 'react';
import useMixerStore from '../store/useMixerStore';
import { STEM_CONFIG, dBToGain } from '../utils/stemConfig';
import { DSP } from '../utils/DSP';

// ─── Format seconds to MM:SS ───
const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// ─── Render multitrack session offline into Before (Raw Sum) & After (Current Mix) AudioBuffers ───
const renderSessionMixesOffline = async (stems, gains, fxSettings, mutedStems, soloedStemId) => {
  // 1. Fetch & decode audio buffers for all active stems
  const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
  const loadedStems = await Promise.all(
    stems.map(async (stem) => {
      const urlSegs = stem.audioUrl.split('/');
      const fileName = urlSegs.pop();
      const baseUrl = urlSegs.join('/');
      const finalUrl = `${baseUrl}/${encodeURIComponent(fileName)}`;

      const res = await fetch(finalUrl);
      const arrayBuf = await res.arrayBuffer();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuf);
      return { stem, audioBuffer };
    })
  );
  tempCtx.close();

  // Determine session duration & sample rate
  let maxDuration = 0;
  loadedStems.forEach(({ audioBuffer }) => {
    if (audioBuffer.duration > maxDuration) maxDuration = audioBuffer.duration;
  });
  const sampleRate = loadedStems[0]?.audioBuffer.sampleRate || 44100;
  const lengthSamples = Math.floor(sampleRate * maxDuration);

  // ───────────────────────────────────────────────────────────
  // A. RENDER BEFORE (Raw sum of stems at 0dB, centered, no FX)
  // ───────────────────────────────────────────────────────────
  const offlineBefore = new OfflineAudioContext(2, lengthSamples, sampleRate);
  loadedStems.forEach(({ audioBuffer }) => {
    const src = offlineBefore.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(offlineBefore.destination);
    src.start(0);
  });
  const beforeAudioBuffer = await offlineBefore.startRendering();

  // ───────────────────────────────────────────────────────────
  // B. RENDER AFTER (Current session state with volume, mute/solo & FX)
  // ───────────────────────────────────────────────────────────
  const offlineAfter = new OfflineAudioContext(2, lengthSamples, sampleRate);

  // Shared Reverb & Delay return buses on offline context
  const convolver = offlineAfter.createConvolver();
  convolver.buffer = DSP.createImpulse(2.0, 2.5, offlineAfter);
  const reverbBusGain = offlineAfter.createGain();
  reverbBusGain.gain.value = 0.8;
  convolver.connect(reverbBusGain);
  reverbBusGain.connect(offlineAfter.destination);

  const delay = offlineAfter.createDelay();
  delay.delayTime.value = 0.25;
  const delayFeedback = offlineAfter.createGain();
  delayFeedback.gain.value = 0.3;
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);

  const delayBusGain = offlineAfter.createGain();
  delayBusGain.gain.value = 0.7;
  delay.connect(delayBusGain);
  delayBusGain.connect(offlineAfter.destination);

  loadedStems.forEach(({ stem, audioBuffer }) => {
    // Check Mute / Solo logic
    let targetGainDB = gains[stem.id] ?? stem.initialDB ?? 0;
    if (soloedStemId) {
      if (stem.id !== soloedStemId) targetGainDB = -Infinity;
    } else if (mutedStems.has(stem.id)) {
      targetGainDB = -Infinity;
    }

    const src = offlineAfter.createBufferSource();
    src.buffer = audioBuffer;

    const stemFx = fxSettings[stem.id] || {
      eq: { low: 0, mid: 0, high: 0 },
      comp: { thresh: -16, ratio: 3, makeup: 0 },
      sat: 0,
      sends: { reverb: 0.1, delay: 0.05 },
    };

    // 3-Band Parametric EQ
    const eqLow = offlineAfter.createBiquadFilter();
    eqLow.type = 'peaking';
    eqLow.frequency.value = 120;
    eqLow.gain.value = stemFx.eq?.low || 0;

    const eqMid = offlineAfter.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1500;
    eqMid.gain.value = stemFx.eq?.mid || 0;

    const eqHigh = offlineAfter.createBiquadFilter();
    eqHigh.type = 'peaking';
    eqHigh.frequency.value = 8000;
    eqHigh.gain.value = stemFx.eq?.high || 0;

    // Dynamics Compressor
    const comp = offlineAfter.createDynamicsCompressor();
    comp.threshold.value = stemFx.comp?.thresh ?? -16;
    comp.ratio.value = stemFx.comp?.ratio ?? 3;

    const compMakeup = offlineAfter.createGain();
    compMakeup.gain.value = dBToGain(stemFx.comp?.makeup ?? 0);

    // Saturation
    const saturation = offlineAfter.createWaveShaper();
    saturation.curve = DSP.makeDistortionCurve(stemFx.sat ?? 0, 'tape');

    // Track Volume Gain
    const gainNode = offlineAfter.createGain();
    gainNode.gain.value = dBToGain(targetGainDB);

    // Sends Gains
    const reverbSend = offlineAfter.createGain();
    reverbSend.gain.value = stemFx.sends?.reverb ?? 0;

    const delaySend = offlineAfter.createGain();
    delaySend.gain.value = stemFx.sends?.delay ?? 0;

    // Chain: src -> eqLow -> eqMid -> eqHigh -> comp -> compMakeup -> saturation -> gainNode -> destination
    src.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(comp);
    comp.connect(compMakeup);
    compMakeup.connect(saturation);
    saturation.connect(gainNode);
    gainNode.connect(offlineAfter.destination);

    // Connect Sends
    gainNode.connect(reverbSend);
    reverbSend.connect(convolver);

    gainNode.connect(delaySend);
    delaySend.connect(delay);

    src.start(0);
  });

  const afterAudioBuffer = await offlineAfter.startRendering();

  return { beforeAudioBuffer, afterAudioBuffer, duration: maxDuration };
};

const CompareScreen = ({ onBack, mode }) => {
  const activeStemConfig = useMixerStore((state) => state.activeStemConfig);
  const currentGains = useMixerStore((state) => state.currentGains);
  const fxSettings = useMixerStore((state) => state.fxSettings);
  const mutedStems = useMixerStore((state) => state.mutedStems);
  const soloedStemId = useMixerStore((state) => state.soloedStemId);

  const stemsToUse = activeStemConfig || STEM_CONFIG;

  const [activeChannel, setActiveChannel] = useState('AFTER'); // 'BEFORE' or 'AFTER'
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState([]);

  // Web Audio Context & Node Refs for playback
  const audioCtxRef = useRef(null);
  const beforeGainRef = useRef(null);
  const afterGainRef = useRef(null);
  const beforeSourceRef = useRef(null);
  const afterSourceRef = useRef(null);
  const beforeBufferRef = useRef(null);
  const afterBufferRef = useRef(null);

  const startCtxTimeRef = useRef(0);
  const seekOffsetRef = useRef(0);
  const rafRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // 1. Render both Before and After mixes offline on mount
  useEffect(() => {
    let isCancelled = false;
    setIsRendering(true);
    setRenderError(null);

    renderSessionMixesOffline(stemsToUse, currentGains, fxSettings, mutedStems, soloedStemId)
      .then(({ beforeAudioBuffer, afterAudioBuffer, duration: dur }) => {
        if (isCancelled) return;
        beforeBufferRef.current = beforeAudioBuffer;
        afterBufferRef.current = afterAudioBuffer;
        setDuration(dur);

        // Pre-compute waveform peaks from After buffer
        const channelData = afterAudioBuffer.getChannelData(0);
        const numPeaks = 200;
        const samplesPerPeak = Math.floor(channelData.length / numPeaks);
        const peaks = [];
        for (let i = 0; i < numPeaks; i++) {
          let max = 0;
          const start = i * samplesPerPeak;
          for (let j = start; j < start + samplesPerPeak && j < channelData.length; j++) {
            const abs = Math.abs(channelData[j]);
            if (abs > max) max = abs;
          }
          peaks.push(max);
        }
        setWaveformPeaks(peaks);

        // Initialize Live AudioContext
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;

        const beforeGain = ctx.createGain();
        const afterGain = ctx.createGain();

        // Initial A/B balance
        beforeGain.gain.value = 0.0;
        afterGain.gain.value = 1.0;

        beforeGain.connect(ctx.destination);
        afterGain.connect(ctx.destination);

        beforeGainRef.current = beforeGain;
        afterGainRef.current = afterGain;

        setIsRendering(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error("Error rendering offline compare mixes:", err);
        setRenderError(err.message || "Failed to render offline audio");
        setIsRendering(false);
      });

    return () => {
      isCancelled = true;
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []); // Run once on mount

  // 2. Crossfade A/B channel selection
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !beforeGainRef.current || !afterGainRef.current) return;
    const now = ctx.currentTime;
    if (activeChannel === 'BEFORE') {
      beforeGainRef.current.gain.setTargetAtTime(1.0, now, 0.015);
      afterGainRef.current.gain.setTargetAtTime(0.0, now, 0.015);
    } else {
      beforeGainRef.current.gain.setTargetAtTime(0.0, now, 0.015);
      afterGainRef.current.gain.setTargetAtTime(1.0, now, 0.015);
    }
  }, [activeChannel]);

  // 3. Play / Stop synchronous transport
  const play = useCallback((offset = null) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !beforeBufferRef.current || !afterBufferRef.current) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Stop existing sources
    if (beforeSourceRef.current) {
      try { beforeSourceRef.current.stop(); } catch (e) {}
    }
    if (afterSourceRef.current) {
      try { afterSourceRef.current.stop(); } catch (e) {}
    }

    const startOffset = offset !== null ? offset : seekOffsetRef.current;
    seekOffsetRef.current = startOffset;
    startCtxTimeRef.current = ctx.currentTime;

    const beforeSrc = ctx.createBufferSource();
    beforeSrc.buffer = beforeBufferRef.current;
    beforeSrc.connect(beforeGainRef.current);
    beforeSrc.start(0, startOffset);
    beforeSourceRef.current = beforeSrc;

    const afterSrc = ctx.createBufferSource();
    afterSrc.buffer = afterBufferRef.current;
    afterSrc.connect(afterGainRef.current);
    afterSrc.start(0, startOffset);
    afterSourceRef.current = afterSrc;

    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    if (isPlaying && audioCtxRef.current) {
      const elapsedSec = seekOffsetRef.current + (audioCtxRef.current.currentTime - startCtxTimeRef.current);
      seekOffsetRef.current = elapsedSec > duration ? 0 : elapsedSec;
    }

    if (beforeSourceRef.current) {
      try { beforeSourceRef.current.stop(); } catch (e) {}
      beforeSourceRef.current = null;
    }
    if (afterSourceRef.current) {
      try { afterSourceRef.current.stop(); } catch (e) {}
      afterSourceRef.current = null;
    }

    setIsPlaying(false);
  }, [isPlaying, duration]);

  const togglePlay = () => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  };

  // 4. Seek Handler
  const handleSeek = (e) => {
    const container = containerRef.current;
    if (!container || duration <= 0) return;
    const rect = container.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const targetSeconds = ratio * duration;

    const wasPlaying = isPlaying;
    stop();
    seekOffsetRef.current = targetSeconds;
    setElapsed(targetSeconds);

    if (wasPlaying) {
      play(targetSeconds);
    }
  };

  // 5. RAF progress tracker & Waveform Canvas renderer
  useEffect(() => {
    const updateProgress = () => {
      if (isPlaying && audioCtxRef.current) {
        const cur = seekOffsetRef.current + (audioCtxRef.current.currentTime - startCtxTimeRef.current);
        if (cur >= duration) {
          setIsPlaying(false);
          seekOffsetRef.current = 0;
          setElapsed(0);
        } else {
          setElapsed(cur);
        }
      }
      rafRef.current = requestAnimationFrame(updateProgress);
    };
    rafRef.current = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformPeaks.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const progress = duration > 0 ? elapsed / duration : 0;

    ctx.clearRect(0, 0, w, h);

    const barWidth = w / waveformPeaks.length;
    const centerY = h / 2;
    const currentColor = activeChannel === 'BEFORE' ? '#f87171' : 'var(--accent)';

    waveformPeaks.forEach((peak, i) => {
      const x = i * barWidth;
      const barH = Math.max(1, peak * h * 0.85);
      const isPast = (i / waveformPeaks.length) < progress;

      ctx.fillStyle = isPast ? currentColor : `${currentColor}35`;
      ctx.fillRect(x + 0.5, centerY - barH / 2, Math.max(1, barWidth - 1), barH);
    });

    // Playhead line
    if (isPlaying || elapsed > 0) {
      const playheadX = progress * w;
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = `${currentColor}80`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }, [elapsed, duration, waveformPeaks, activeChannel, isPlaying]);

  return (
    <div style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-main)',
      position: 'relative',
      zIndex: 1,
      padding: '24px',
      boxSizing: 'border-box',
    }}>
      {/* Back button */}
      <button
        onClick={() => {
          stop();
          onBack();
        }}
        style={{
          position: 'absolute',
          top: '16px',
          left: '20px',
          padding: '8px 16px',
          background: 'var(--card-bg)',
          border: '0.5px solid var(--card-border)',
          borderRadius: '8px',
          color: 'var(--text-dim)',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '1px',
          cursor: 'pointer',
          fontFamily: "'Inter', sans-serif",
          transition: 'all 0.2s ease',
        }}
        onMouseOver={(e) => {
          e.target.style.color = 'var(--accent)';
          e.target.style.borderColor = 'var(--accent)';
        }}
        onMouseOut={(e) => {
          e.target.style.color = 'var(--text-dim)';
          e.target.style.borderColor = 'var(--card-border)';
        }}
      >
        ← BACK TO MIXING CONSOLE
      </button>

      {/* Title */}
      <h2 style={{
        letterSpacing: '6px',
        color: 'var(--accent)',
        fontSize: '20px',
        fontWeight: 700,
        margin: '0 0 4px 0',
        fontFamily: "'Inter', sans-serif",
      }}>
        BEFORE // AFTER
      </h2>
      <p style={{
        color: 'var(--text-dim)',
        fontSize: '11px',
        letterSpacing: '3px',
        margin: '0 0 28px 0',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        REAL SESSION A/B COMPARISON ({stemsToUse.length} STEMS)
      </p>

      {isRendering ? (
        <div style={{
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: '16px',
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '2px solid var(--accent)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{
            fontSize: '12px',
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-dim)',
            letterSpacing: '1.5px',
          }}>
            RENDERING BEFORE/AFTER SESSION MIXES...
          </span>
        </div>
      ) : renderError ? (
        <div style={{
          padding: '24px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          color: '#f87171',
          fontSize: '12px',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Error: {renderError}
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          maxWidth: '720px',
          width: '100%',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: '20px',
          padding: '28px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}>
          {/* A/B Channel Selector Toggle */}
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.4)',
            padding: '4px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
            width: '100%',
          }}>
            <button
              onClick={() => setActiveChannel('BEFORE')}
              style={{
                flex: 1,
                padding: '14px 20px',
                borderRadius: '8px',
                border: 'none',
                background: activeChannel === 'BEFORE' ? '#ef4444' : 'transparent',
                color: activeChannel === 'BEFORE' ? '#ffffff' : 'var(--text-dim)',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '2px',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                transition: 'all 0.2s ease',
                boxShadow: activeChannel === 'BEFORE' ? '0 0 16px rgba(239, 68, 68, 0.4)' : 'none',
              }}
            >
              RAW UNPROCESSED (BEFORE)
            </button>

            <button
              onClick={() => setActiveChannel('AFTER')}
              style={{
                flex: 1,
                padding: '14px 20px',
                borderRadius: '8px',
                border: 'none',
                background: activeChannel === 'AFTER' ? 'var(--accent)' : 'transparent',
                color: activeChannel === 'AFTER' ? '#000000' : 'var(--text-dim)',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '2px',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                transition: 'all 0.2s ease',
                boxShadow: activeChannel === 'AFTER' ? '0 0 16px var(--accent)' : 'none',
              }}
            >
              CURRENT LIVE MIX (AFTER)
            </button>
          </div>

          {/* Active Mode Info */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: activeChannel === 'BEFORE' ? '#ef4444' : 'var(--accent)',
                boxShadow: `0 0 8px ${activeChannel === 'BEFORE' ? '#ef4444' : 'var(--accent)'}`,
              }} />
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: activeChannel === 'BEFORE' ? '#f87171' : 'var(--accent)',
              }}>
                LISTENING TO: {activeChannel === 'BEFORE' ? 'RAW UNPROCESSED STEMS (0dB UNITY)' : 'CURRENT SESSION LIVE DSP MIX'}
              </span>
            </div>
            <span style={{
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--text-dim)',
            }}>
              {stemsToUse.length} TRACKS IN SYNC
            </span>
          </div>

          {/* Waveform Scrubber Timeline */}
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', monospace",
                color: isPlaying ? (activeChannel === 'BEFORE' ? '#f87171' : 'var(--accent)') : 'var(--text-dim)',
                minWidth: '42px',
                textAlign: 'center',
              }}>
                {formatTime(elapsed)}
              </span>

              <div
                ref={containerRef}
                onClick={handleSeek}
                style={{
                  flex: 1,
                  height: '48px',
                  background: 'rgba(0,0,0,0.4)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  border: `1px solid ${activeChannel === 'BEFORE' ? 'rgba(239, 68, 68, 0.4)' : 'var(--card-border)'}`,
                  transition: 'border-color 0.3s ease',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={48}
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>

              <span style={{
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text-dim)',
                minWidth: '42px',
                textAlign: 'center',
              }}>
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Play/Pause Transport Button */}
          <button
            onClick={togglePlay}
            style={{
              width: '100%',
              padding: '14px',
              background: isPlaying
                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              border: 'none',
              borderRadius: '10px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '2px',
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
              boxShadow: isPlaying ? '0 0 20px rgba(239, 68, 68, 0.4)' : '0 0 20px rgba(59, 130, 246, 0.4)',
              transition: 'all 0.2s ease',
            }}
          >
            {isPlaying ? '■ PAUSE A/B COMPARISON' : `▶ START A/B COMPARISON PLAYBACK`}
          </button>
        </div>
      )}
    </div>
  );
};

export default CompareScreen;
