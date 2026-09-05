export type SourceType = 'pad' | 'pink_noise' | 'sine' | 'drums' | 'mic' | 'file';

export class AudioHarness {
  public ctx: AudioContext;
  private currentSourceNode: AudioNode | null = null;
  private isPlaying = false;
  private intervalId: number | null = null;
  public masterGain: GainNode;
  private fileBuffer: AudioBuffer | null = null;
  public onFileEnded: (() => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.5;
  }

  public setFileBuffer(buffer: AudioBuffer) {
    this.fileBuffer = buffer;
  }

  public async play(type: SourceType, destination: AudioNode) {
    this.stop();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isPlaying = true;

    if (type === 'file') {
      if (!this.fileBuffer) return;
      const source = this.ctx.createBufferSource();
      source.buffer = this.fileBuffer;
      source.connect(destination);
      source.start();
      source.onended = () => {
        this.isPlaying = false;
        this.onFileEnded?.();
      };
      this.currentSourceNode = source;
      return;
    }

    if (type === 'pink_noise') {
      // Pink noise buffer generator
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const out = noiseBuffer.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        }
      }
      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;
      noiseNode.connect(destination);
      noiseNode.start();
      this.currentSourceNode = noiseNode;
    } else if (type === 'pad') {
      // Warm polyphonic synth pad (chords + harmonics)
      const frequencies = [130.81, 164.81, 196.00, 246.94]; // C3, E3, G3, B3 (Cmaj7)
      const merger = this.ctx.createChannelMerger(2);
      const oscillators: OscillatorNode[] = [];

      for (const f of frequencies) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;

        const detuneOsc = this.ctx.createOscillator();
        detuneOsc.type = 'sawtooth';
        detuneOsc.frequency.value = f * 1.004;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.08;

        osc.connect(gain);
        detuneOsc.connect(gain);
        gain.connect(destination);

        osc.start();
        detuneOsc.start();
        oscillators.push(osc, detuneOsc);
      }

      this.currentSourceNode = {
        disconnect: () => {
          oscillators.forEach((o) => {
            try { o.stop(); } catch {}
            o.disconnect();
          });
        },
      } as unknown as AudioNode;
    } else if (type === 'sine') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 450; // 450Hz sine
      osc.connect(destination);
      osc.start();
      this.currentSourceNode = osc;
    } else if (type === 'drums') {
      // Synthesized rhythmic drum loop (Kick + Snare + Hi-Hat)
      let step = 0;
      const bpm = 120;
      const intervalMs = (60 / bpm / 4) * 1000;

      const triggerDrum = () => {
        if (!this.isPlaying) return;
        const now = this.ctx.currentTime;

        // Kick on steps 0, 8, 10
        if (step % 16 === 0 || step % 16 === 8 || step % 16 === 10) {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.frequency.setValueAtTime(140, now);
          osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
          gain.gain.setValueAtTime(0.8, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(now);
          osc.stop(now + 0.28);
        }

        // Snare on steps 4, 12
        if (step % 16 === 4 || step % 16 === 12) {
          const noise = this.ctx.createBufferSource();
          const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          noise.buffer = buf;

          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.4, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          noise.connect(gain);
          gain.connect(destination);
          noise.start(now);
          noise.stop(now + 0.18);
        }

        // Hi-hat on every odd step
        if (step % 2 === 1) {
          const noise = this.ctx.createBufferSource();
          const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          noise.buffer = buf;

          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          noise.connect(gain);
          gain.connect(destination);
          noise.start(now);
          noise.stop(now + 0.04);
        }

        step++;
      };

      const timer = setInterval(triggerDrum, intervalMs);
      this.currentSourceNode = {
        disconnect: () => {
          clearInterval(timer);
        },
      } as unknown as AudioNode;
    }
  }

  public stop() {
    this.isPlaying = false;
    if (this.currentSourceNode) {
      try {
        if ('stop' in this.currentSourceNode) {
          (this.currentSourceNode as AudioScheduledSourceNode).stop();
        }
        this.currentSourceNode.disconnect();
      } catch {}
      this.currentSourceNode = null;
    }
  }
}
