import { useRef, useCallback } from 'react';
import { STEM_CONFIG, dBToGain } from '../utils/stemConfig';
import { DSP } from '../utils/DSP';

export const useAudioEngine = () => {
  const audioCtxRef = useRef(null);
  const nodesRef = useRef({});  // stemId → { audioBuffer, gainNode, analyser, source, fx... }
  const masterGainRef = useRef(null);
  const isInitializedRef = useRef(false);

  // Shared FX Bus Refs
  const reverbBusRef = useRef(null); // { convolver, busGain }
  const delayBusRef = useRef(null);  // { delay, feedback, busGain }

  // Playback tracking refs
  const startCtxTimeRef = useRef(0);   // AudioContext.currentTime when playback began
  const seekOffsetRef = useRef(0);     // offset in seconds (for seeking)
  const durationRef = useRef(0);       // duration of longest stem buffer
  const isPlayingRef = useRef(false);
  const waveformRef = useRef([]);      // pre-computed peak data for waveform display
  const activeStemsRef = useRef([]);   // The stems config used for this session

  /**
   * Helper to set up shared reverb & delay send buses
   */
  const setupSharedBuses = (ctx) => {
    // 1. Shared Reverb Bus
    const convolver = ctx.createConvolver();
    convolver.buffer = DSP.createImpulse(2.0, 2.5, ctx);
    const reverbBusGain = ctx.createGain();
    reverbBusGain.gain.value = 0.8;
    convolver.connect(reverbBusGain);
    reverbBusGain.connect(masterGainRef.current);
    reverbBusRef.current = { convolver, busGain: reverbBusGain };

    // 2. Shared Delay Bus
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.25; // 250ms quarter-note delay
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.3; // 30% feedback
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);

    const delayBusGain = ctx.createGain();
    delayBusGain.gain.value = 0.7;
    delay.connect(delayBusGain);
    delayBusGain.connect(masterGainRef.current);
    delayBusRef.current = { delay, feedback: delayFeedback, busGain: delayBusGain };
  };

  /**
   * Initialize the audio engine with a given stems config.
   */
  const initialize = useCallback(async (stemsConfig) => {
    if (isInitializedRef.current) return;

    const stems = stemsConfig || STEM_CONFIG;
    activeStemsRef.current = stems;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;

    masterGainRef.current = ctx.createGain();
    masterGainRef.current.connect(ctx.destination);

    // Initialize shared Reverb and Delay return buses
    setupSharedBuses(ctx);

    // Load all stems in parallel
    const loadPromises = stems.map(async (stem) => {
      const urlSegs = stem.audioUrl.split('/');
      const fileName = urlSegs.pop();
      const baseUrl = urlSegs.join('/');
      const finalUrl = `${baseUrl}/${encodeURIComponent(fileName)}`;

      // 1. Fetch the audio file
      let response;
      try {
        response = await fetch(finalUrl);
      } catch (networkErr) {
        const reason = networkErr.message || 'Unknown network error';
        const hint = reason === 'Load failed'
          ? 'Connection refused — is the backend server running on port 3001?'
          : reason;
        console.error(`[AudioEngine] Network error loading "${stem.displayName}":`, networkErr);
        throw new Error(`Network error loading "${stem.displayName}": ${hint}`);
      }

      if (!response.ok) {
        const statusDetail = `${response.status} ${response.statusText}`;
        console.error(`[AudioEngine] HTTP error loading "${stem.displayName}": ${statusDetail}`);
        throw new Error(`HTTP ${statusDetail} loading "${stem.displayName}" — file may be missing from backend/stems/`);
      }

      // 2. Decode the audio data
      let arrayBuffer;
      try {
        arrayBuffer = await response.arrayBuffer();
      } catch (bufErr) {
        console.error(`[AudioEngine] Failed to read response body for "${stem.displayName}":`, bufErr);
        throw new Error(`Failed to read audio data for "${stem.displayName}": ${bufErr.message}`);
      }

      let audioBuffer;
      try {
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      } catch (decodeErr) {
        console.error(`[AudioEngine] decodeAudioData failed for "${stem.displayName}":`, decodeErr);
        throw new Error(`Audio decode failed for "${stem.displayName}": file may be corrupt or in an unsupported format`);
      }

      // 3. Build DSP Node Graph per track
      // --- 8-Band Parametric EQ Filters ---
      const eqBands = Array.from({ length: 8 }, (_, i) => {
        const filter = ctx.createBiquadFilter();
        if (i === 0) {
          filter.type = 'highpass';
          filter.frequency.value = 20;
          filter.Q.value = 0.7;
        } else if (i === 1) {
          filter.type = 'lowshelf';
          filter.frequency.value = 120;
          filter.gain.value = stem.eq?.bands?.[0]?.gain_db || 0;
        } else if (i === 2) {
          filter.type = 'peaking';
          filter.frequency.value = 800;
          filter.gain.value = stem.eq?.bands?.[1]?.gain_db || 0;
          filter.Q.value = 1.0;
        } else if (i === 3) {
          filter.type = 'highshelf';
          filter.frequency.value = 6000;
          filter.gain.value = stem.eq?.bands?.[2]?.gain_db || 0;
        } else if (i === 4) {
          filter.type = 'lowpass';
          filter.frequency.value = 20000;
          filter.Q.value = 0.7;
        } else {
          filter.type = 'peaking';
          filter.frequency.value = 1000;
          filter.gain.value = 0;
          filter.Q.value = 1.0;
        }
        return filter;
      });

      // Chain EQ filters in series: eqBands[0] -> eqBands[1] -> ... -> eqBands[7]
      for (let i = 0; i < eqBands.length - 1; i++) {
        eqBands[i].connect(eqBands[i + 1]);
      }

      // --- Dynamics Compressor ---
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = stem.compressor?.threshold_db ?? -16;
      compressor.ratio.value = stem.compressor?.ratio ?? 3;
      compressor.attack.value = (stem.compressor?.attack_ms ?? 15) / 1000;
      compressor.release.value = (stem.compressor?.release_ms ?? 120) / 1000;
      compressor.knee.value = stem.compressor?.knee_db ?? 3;

      const compMakeup = ctx.createGain();
      compMakeup.gain.value = dBToGain(stem.compressor?.makeup_gain_db ?? 0);

      // --- Saturation WaveShaper ---
      const saturation = ctx.createWaveShaper();
      const initialSatDrive = stem.saturation ?? 0;
      saturation.curve = DSP.makeDistortionCurve(initialSatDrive, 'tape');
      saturation.oversample = '4x';

      // --- Track Gain & Analyser ---
      const gainNode = ctx.createGain();
      gainNode.gain.value = dBToGain(stem.initialDB ?? 0);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      // --- Sends Gains ---
      const reverbSend = ctx.createGain();
      reverbSend.gain.value = stem.sends?.reverb ?? 0.1;

      const delaySend = ctx.createGain();
      delaySend.gain.value = stem.sends?.delay ?? 0.05;

      // Connect Track Chain:
      // eqBands[last] -> compressor -> compMakeup -> saturation -> gainNode -> analyser -> Master
      eqBands[eqBands.length - 1].connect(compressor);
      compressor.connect(compMakeup);
      compMakeup.connect(saturation);
      saturation.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(masterGainRef.current);

      // Connect Sends from gainNode to Shared Buses
      gainNode.connect(reverbSend);
      reverbSend.connect(reverbBusRef.current.convolver);

      gainNode.connect(delaySend);
      delaySend.connect(delayBusRef.current.delay);

      nodesRef.current[stem.id] = {
        audioBuffer,
        inputNode: eqBands[0], // Point where BufferSourceNode connects
        eqBands,
        compressor,
        compMakeup,
        saturation,
        gainNode,
        analyser,
        reverbSend,
        delaySend,
        source: null,
      };
    });

    try {
      await Promise.all(loadPromises);
    } catch (err) {
      isInitializedRef.current = false; // Allow retry
      throw err;
    }

    // Calculate duration from longest buffer
    let maxDuration = 0;
    stems.forEach((stem) => {
      const buf = nodesRef.current[stem.id]?.audioBuffer;
      if (buf && buf.duration > maxDuration) maxDuration = buf.duration;
    });
    durationRef.current = maxDuration;

    // Pre-compute waveform peaks for timeline visualization
    const waveformStem = nodesRef.current['lead-vocals'] || nodesRef.current[stems[0]?.id];
    if (waveformStem?.audioBuffer) {
      const channelData = waveformStem.audioBuffer.getChannelData(0);
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
      waveformRef.current = peaks;
    }

    isInitializedRef.current = true;
  }, []);

  const play = useCallback((fromOffset = null) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const stems = activeStemsRef.current;

    // Stop any existing sources first
    stems.forEach((stem) => {
      const nodes = nodesRef.current[stem.id];
      if (nodes?.source) {
        try { nodes.source.stop(); } catch (e) { /* noop */ }
      }
    });

    const offset = fromOffset !== null ? fromOffset : seekOffsetRef.current;
    seekOffsetRef.current = offset;
    startCtxTimeRef.current = ctx.currentTime;
    isPlayingRef.current = true;

    // Create and start BufferSourceNodes for all stems simultaneously
    stems.forEach((stem) => {
      const nodes = nodesRef.current[stem.id];
      if (!nodes) return;

      const source = ctx.createBufferSource();
      source.buffer = nodes.audioBuffer;
      source.loop = false;
      source.connect(nodes.inputNode); // Connect to head of FX chain (eqLow)
      source.start(0, offset);
      nodes.source = source;
    });
  }, []);

  const stop = useCallback(() => {
    const stems = activeStemsRef.current;

    if (isPlayingRef.current && audioCtxRef.current) {
      seekOffsetRef.current = seekOffsetRef.current +
        (audioCtxRef.current.currentTime - startCtxTimeRef.current);
      if (seekOffsetRef.current > durationRef.current) {
        seekOffsetRef.current = 0;
      }
    }
    isPlayingRef.current = false;

    stems.forEach((stem) => {
      const nodes = nodesRef.current[stem.id];
      if (nodes?.source) {
        try { nodes.source.stop(); } catch (e) { /* noop */ }
        nodes.source = null;
      }
    });
  }, []);

  // Seek to a specific time (in seconds)
  const seekTo = useCallback((seconds) => {
    const stems = activeStemsRef.current;
    const clamped = Math.max(0, Math.min(seconds, durationRef.current));
    const wasPlaying = isPlayingRef.current;

    isPlayingRef.current = false;
    stems.forEach((stem) => {
      const nodes = nodesRef.current[stem.id];
      if (nodes?.source) {
        try { nodes.source.stop(); } catch (e) { /* noop */ }
        nodes.source = null;
      }
    });

    seekOffsetRef.current = clamped;

    if (wasPlaying) {
      play(clamped);
    }
  }, [play]);

  // Get current elapsed time in seconds
  const getElapsed = useCallback(() => {
    if (!isPlayingRef.current || !audioCtxRef.current) {
      return seekOffsetRef.current;
    }
    const elapsed = seekOffsetRef.current +
      (audioCtxRef.current.currentTime - startCtxTimeRef.current);
    return Math.min(elapsed, durationRef.current);
  }, []);

  // Get total duration in seconds
  const getDuration = useCallback(() => durationRef.current, []);

  // Get pre-computed waveform peaks array
  const getWaveform = useCallback(() => waveformRef.current, []);

  // Check if the engine considers itself playing
  const checkIsPlaying = useCallback(() => isPlayingRef.current, []);

  const setChannelGain = useCallback((stemId, dB) => {
    const ctx = audioCtxRef.current;
    const nodes = nodesRef.current[stemId];
    if (!ctx || !nodes) return;
    const gain = dBToGain(dB);
    nodes.gainNode.gain.setTargetAtTime(gain, ctx.currentTime, 0.008);
  }, []);

  /**
   * Live automation update for track FX parameters (EQ, Dynamics, Saturation, Sends)
   */
  const updateTrackFx = useCallback((stemId, fx) => {
    const ctx = audioCtxRef.current;
    const nodes = nodesRef.current[stemId];
    if (!ctx || !nodes) return;

    const now = ctx.currentTime;

    // 1. Update Parametric EQ Filters (from bands array or legacy eq obj)
    if (nodes.eqBands && Array.isArray(nodes.eqBands)) {
      if (fx.bands && Array.isArray(fx.bands)) {
        fx.bands.forEach((b, idx) => {
          const filter = nodes.eqBands[idx] || nodes.eqBands[b.index];
          if (!filter) return;

          if (b.enabled === false) {
            filter.gain.setTargetAtTime(0, now, 0.005);
            if (filter.type === 'highpass') filter.frequency.setTargetAtTime(10, now, 0.005);
            if (filter.type === 'lowpass') filter.frequency.setTargetAtTime(22000, now, 0.005);
          } else {
            if (b.shape === 3) {
              // LowCut (Highpass)
              filter.type = 'highpass';
              filter.frequency.setTargetAtTime(Math.max(10, Math.min(b.freq, 22000)), now, 0.005);
              filter.Q.setTargetAtTime(b.q || 0.7, now, 0.005);
              filter.gain.setTargetAtTime(0, now, 0.005);
            } else if (b.shape === 1) {
              // LowShelf
              filter.type = 'lowshelf';
              filter.frequency.setTargetAtTime(Math.max(10, Math.min(b.freq, 22000)), now, 0.005);
              filter.gain.setTargetAtTime(b.gain, now, 0.005);
            } else if (b.shape === 0) {
              // Bell / Peaking
              filter.type = 'peaking';
              filter.frequency.setTargetAtTime(Math.max(10, Math.min(b.freq, 22000)), now, 0.005);
              filter.gain.setTargetAtTime(b.gain, now, 0.005);
              filter.Q.setTargetAtTime(b.q || 1.0, now, 0.005);
            } else if (b.shape === 2) {
              // HighShelf
              filter.type = 'highshelf';
              filter.frequency.setTargetAtTime(Math.max(10, Math.min(b.freq, 22000)), now, 0.005);
              filter.gain.setTargetAtTime(b.gain, now, 0.005);
            } else if (b.shape === 4) {
              // HighCut (Lowpass)
              filter.type = 'lowpass';
              filter.frequency.setTargetAtTime(Math.max(10, Math.min(b.freq, 22000)), now, 0.005);
              filter.Q.setTargetAtTime(b.q || 0.7, now, 0.005);
              filter.gain.setTargetAtTime(0, now, 0.005);
            }
          }
        });
      } else if (fx.eq) {
        if (nodes.eqBands[1] && fx.eq.low != null) nodes.eqBands[1].gain.setTargetAtTime(fx.eq.low, now, 0.005);
        if (nodes.eqBands[2] && fx.eq.mid != null) nodes.eqBands[2].gain.setTargetAtTime(fx.eq.mid, now, 0.005);
        if (nodes.eqBands[3] && fx.eq.high != null) nodes.eqBands[3].gain.setTargetAtTime(fx.eq.high, now, 0.005);
      }

      if (fx.lowCutFreq != null && nodes.eqBands[0]) {
        nodes.eqBands[0].frequency.setTargetAtTime(fx.lowCutFreq, now, 0.005);
      }
      if (fx.highCutFreq != null && nodes.eqBands[4]) {
        nodes.eqBands[4].frequency.setTargetAtTime(fx.highCutFreq, now, 0.005);
      }
    }

    // 2. Update Compressor
    if (fx.comp || fx.compressor) {
      const comp = fx.comp || fx.compressor;
      const threshVal = comp.thresh ?? comp.threshold;
      if (threshVal != null) nodes.compressor.threshold.setTargetAtTime(threshVal, now, 0.01);
      if (comp.ratio != null) nodes.compressor.ratio.setTargetAtTime(comp.ratio, now, 0.01);
      if (comp.attack != null) {
        const attSec = comp.attack > 1 ? comp.attack / 1000 : comp.attack;
        nodes.compressor.attack.setTargetAtTime(attSec, now, 0.01);
      }
      if (comp.release != null) {
        const relSec = comp.release > 1 ? comp.release / 1000 : comp.release;
        nodes.compressor.release.setTargetAtTime(relSec, now, 0.01);
      }
      if (comp.knee != null) nodes.compressor.knee.setTargetAtTime(comp.knee, now, 0.01);
      const makeupVal = comp.makeup ?? comp.outputGain;
      if (makeupVal != null) nodes.compMakeup.gain.setTargetAtTime(dBToGain(makeupVal), now, 0.01);
    }

    // 3. Update Saturation
    if (fx.sat != null || fx.saturator != null) {
      const sat = fx.saturator || {};
      const drive = typeof fx.sat === 'number' ? fx.sat : sat.drive ?? 0;
      const char = sat.char || sat.character || 'tape';
      nodes.saturation.curve = DSP.makeDistortionCurve(drive, char);
    }

    // 4. Update FX Sends
    if (fx.sends) {
      if (fx.sends.reverb != null) nodes.reverbSend.gain.setTargetAtTime(fx.sends.reverb, now, 0.01);
      if (fx.sends.delay != null) nodes.delaySend.gain.setTargetAtTime(fx.sends.delay, now, 0.01);
    }
  }, []);

  const getAnalyserData = useCallback((stemId) => {
    const nodes = nodesRef.current[stemId];
    if (!nodes?.analyser) return null;
    const dataArray = new Float32Array(nodes.analyser.frequencyBinCount);
    nodes.analyser.getFloatTimeDomainData(dataArray);
    return dataArray;
  }, []);

  // Reset playhead to beginning
  const resetPlayhead = useCallback(() => {
    seekOffsetRef.current = 0;
  }, []);

  const cleanup = useCallback(() => {
    stop();
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    nodesRef.current = {};
    activeStemsRef.current = [];
    isInitializedRef.current = false;
  }, [stop]);

  return {
    initialize, play, stop, seekTo,
    setChannelGain, updateTrackFx, getAnalyserData,
    getElapsed, getDuration, getWaveform,
    checkIsPlaying, resetPlayhead, cleanup,
  };
};

export default useAudioEngine;
