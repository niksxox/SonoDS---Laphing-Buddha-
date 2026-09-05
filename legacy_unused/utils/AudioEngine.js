import * as Tone from 'tone';

export class AudioEngine {
  constructor() {
    // --- MASTER CHAIN ---
    // We add a Volume node before destination to control Master Gain (for Raw vs Mixed levels)
    this.masterVolume = new Tone.Volume(0).toDestination();
    this.limiter = new Tone.Limiter(-1).connect(this.masterVolume);
    
    // Gentle "Glue" Compression
    this.compressor = new Tone.Compressor({
      threshold: -20,
      ratio: 2,
      attack: 0.05,
      release: 0.25
    }).connect(this.limiter);

    // Vocal Chain
    this.vocalEq = new Tone.EQ3({ low: 0, mid: 0, high: 2 }).connect(this.compressor);

    // State
    this.players = null; 
    this.buffers = {}; 
    this.mixSettings = { vocals: 0, bass: 0, drums: 0, other: 0 };
    this.isPlaying = false;
  }

  getBuffer(stemName) {
    return this.buffers[stemName] ? this.buffers[stemName].get() : null;
  }

  get duration() {
    return this.buffers.vocals ? this.buffers.vocals.duration : 0;
  }

  get currentTime() {
    return Tone.Transport.seconds;
  }

  // --- HARD CLEANUP (Prevents "Ghost Audio" & Resets Time) ---
  cleanup() {
    // 1. Stop the timeline immediately
    this.stop(); 
    
    // 2. Clear scheduled events and reset time to 0:00
    Tone.Transport.cancel(); 
    Tone.Transport.seconds = 0; 

    // 3. Kill Players Individually to ensure no audio remains
    if (this.players) {
        this.players.stopAll();
        this.players.disconnect();
        this.players.dispose(); 
        this.players = null;
    }
    
    // 4. Clear buffers to free memory
    this.buffers = {}; 
  }

  // Call this when component unmounts
  dispose() {
    this.cleanup();
    // We keep effects alive for performance unless the app is closing
  }

  async loadStems(files) {
    await Tone.start(); 

    // CRITICAL: Clean before loading to prevent double-stacking
    this.cleanup();

    const loadFile = async (file) => {
      const url = URL.createObjectURL(file);
      return new Promise((resolve, reject) => {
        const buffer = new Tone.ToneAudioBuffer(url, () => {
          resolve(buffer);
        }, reject);
      });
    };

    try {
      this.buffers = {
        vocals: await loadFile(files.vocals),
        bass: await loadFile(files.bass),
        drums: await loadFile(files.drums),
        other: await loadFile(files.other)
      };

      this.players = new Tone.Players({
        vocals: this.buffers.vocals,
        bass: this.buffers.bass,
        drums: this.buffers.drums,
        other: this.buffers.other
      });

      // Routing
      this.players.player("vocals").disconnect();
      this.players.player("vocals").connect(this.vocalEq);
      this.players.player("bass").connect(this.compressor);
      this.players.player("drums").connect(this.compressor);
      this.players.player("other").connect(this.compressor);

      // Sync to timeline
      this.players.player("vocals").sync().start(0);
      this.players.player("bass").sync().start(0);
      this.players.player("drums").sync().start(0);
      this.players.player("other").sync().start(0);

      return true;
    } catch (e) {
      console.error("Tone.js Load Error:", e);
      return false;
    }
  }

  play(offset = null) {
    if (offset !== null) Tone.Transport.seconds = offset;
    if (Tone.context.state !== 'running') Tone.context.resume();
    Tone.Transport.start();
    this.isPlaying = true;
  }

  stop() {
    Tone.Transport.pause(); 
    this.isPlaying = false;
  }

  seek(time) {
    Tone.Transport.seconds = time;
  }

  // --- NEW: STRICT MODE SWITCHING ---

  // MODE A: RAW (Lower Master, Unity Stems)
  setRawMode() {
    if (!this.players) return;
    
    // 1. Drop Master Volume to create "Exaggerated Difference" (-4dB)
    this.masterVolume.volume.rampTo(-4, 0.1); 

    // 2. Set all stems to 0dB (Unity) - Untouched by AI
    ["vocals", "bass", "drums", "other"].forEach(stem => {
        const p = this.players.player(stem);
        if (p) {
            p.mute = false;
            p.volume.rampTo(0, 0.1);
        }
    });
  }

  // MODE B: MIXED (Full Master, AI Stems)
  setMixedMode(settings) {
    if (!this.players) return;
    this.mixSettings = settings;

    // 1. Reset Master to Full (0dB)
    this.masterVolume.volume.rampTo(0, 0.1); 

    // 2. Apply the SmartFader settings
    this.applyInternalMix(settings);
  }

  // Internal helper for fader updates (Used by Mixed Mode & SmartFaders)
  applyInternalMix(settings) {
    if (!this.players) return;
    
    const applyVol = (stem, targetDb) => {
      const player = this.players.player(stem);
      
      // FL STUDIO LOGIC: Handle -Infinity
      if (targetDb === -Infinity) {
        if (!player.mute) {
            // Fast fade out
            player.volume.value = -60;
            player.mute = true; 
        }
      } else {
        // Un-mute
        if (player.mute) {
            player.mute = false;
            player.volume.value = -60;
        }
        // Smooth Volume Ramp
        player.volume.rampTo(targetDb, 0.1);
      }
    };

    applyVol("vocals", settings.vocals);
    applyVol("bass", settings.bass);
    applyVol("drums", settings.drums);
    applyVol("other", settings.other);
  }

  // --- EXPORT (Uses current mix settings) ---
  async exportStems() {
    const stems = {};
    for (const name of ['vocals', 'bass', 'drums', 'other']) {
      stems[name] = await this.renderOffline(false, name);
    }
    return stems;
  }

  // Render Offline logic
  async renderOffline(isMaster, singleStemName = null) {
    if (!this.buffers.vocals) return null;
    const dur = this.buffers.vocals.duration;

    const renderedBuffer = await Tone.Offline(({ transport }) => {
      const offLimiter = new Tone.Limiter(-1).toDestination();
      const offCompressor = new Tone.Compressor({ threshold: -20, ratio: 2, attack: 0.05, release: 0.25 }).connect(offLimiter);
      const offVocalEq = new Tone.EQ3({ low: 0, mid: 0, high: 2 }).connect(offCompressor);

      const stemsToRender = isMaster ? ['vocals', 'bass', 'drums', 'other'] : [singleStemName];

      stemsToRender.forEach(stem => {
        const p = new Tone.Player(this.buffers[stem]);
        
        let db = this.mixSettings[stem];
        // Apply Volume Logic to Export too
        if (db === -Infinity) {
            p.volume.value = -100;
            p.mute = true;
        } else {
            p.volume.value = db;
        }

        if (stem === 'vocals') p.connect(offVocalEq);
        else p.connect(offCompressor);
        
        p.sync().start(0);
      });

      transport.start();
    }, dur);

    return this.encodeWAV(renderedBuffer);
  }

  encodeWAV(buffer) {
    const samples = buffer.get(); 
    const arrBuffer = new ArrayBuffer(44 + samples.length * 2 * samples.numberOfChannels);
    const view = new DataView(arrBuffer);

    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2 * samples.numberOfChannels, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true); 
    view.setUint32(24, samples.sampleRate, true);
    view.setUint32(28, samples.sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2 * samples.numberOfChannels, true);

    const left = samples.getChannelData(0);
    const right = samples.getChannelData(1);
    let offset = 44;

    for (let i = 0; i < left.length; i++) {
      const sL = Math.max(-1, Math.min(1, left[i]));
      const sR = Math.max(-1, Math.min(1, right[i]));
      view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7FFF, true);
      offset += 2;
      view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}