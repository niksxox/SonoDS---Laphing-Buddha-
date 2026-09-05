// SonodsCompressorNode.ts
import {
  CompressorCharacterType,
  CompressorState,
  CompressorTelemetryFrame,
  DspExports,
} from './types.js';
import { loadDspModule } from './wasmLoader.js';
import {
  CommandType,
  createSharedMemoryLayout,
  pushCommandToRingBuffer,
  SharedMemoryLayout,
} from './ringBuffer.js';
import { COMP_WORKLET_PROCESSOR_CODE } from './worklet/comp-processor.js';
import { getWasmBytes } from './wasm/wasmBinary.js';

export class SonodsCompressorNode {
  readonly audioContext: AudioContext;
  readonly inputNode: GainNode;
  readonly outputNode: GainNode;
  readonly preAnalyser: AnalyserNode;
  readonly postAnalyser: AnalyserNode;
  private workletNode: AudioWorkletNode | null = null;

  // Main-thread WASM engine instance for offline processing / immediate computations
  private dspExports: DspExports | null = null;
  private mainEnginePtr = 0;
  private sharedLayout: SharedMemoryLayout | null = null;

  private state: CompressorState;
  private listeners: Set<(state: CompressorState) => void> = new Set();
  private grListeners: Set<(grDb: number) => void> = new Set();
  private telemetryListeners: Set<(frame: CompressorTelemetryFrame) => void> = new Set();
  private readyPromise: Promise<void>;
  private meterPollInterval: number | null = null;
  private currentGrDb = 0.0;
  private currentTelemetry: CompressorTelemetryFrame = {
    inputDb: -60.0,
    detectedDb: -60.0,
    outputDb: -60.0,
    grDb: 0.0,
  };

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;

    this.inputNode = audioContext.createGain();
    this.outputNode = audioContext.createGain();

    this.preAnalyser = audioContext.createAnalyser();
    this.preAnalyser.fftSize = 2048;
    this.preAnalyser.smoothingTimeConstant = 0.8;

    this.postAnalyser = audioContext.createAnalyser();
    this.postAnalyser.fftSize = 2048;
    this.postAnalyser.smoothingTimeConstant = 0.8;

    this.inputNode.connect(this.preAnalyser);

    this.state = {
      threshold: -16.0,
      ratio: 4.0,
      attack: 0.020, // 20ms
      release: 0.150, // 150ms
      knee: 6.0, // 6dB soft knee
      link: 1.0, // 100% stereo linked
      mix: 1.0, // 100% wet
      outputGain: 0.0,
      autoGain: 0.0,
      sidechainHpf: 20.0,
      lookahead: 0.0,
      character: 'vca',
      sampleRate: audioContext.sampleRate,
    };

    this.sharedLayout = createSharedMemoryLayout();
    this.readyPromise = this.init();
  }

  public async whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private async init(): Promise<void> {
    try {
      const wasmBytes = getWasmBytes();
      this.dspExports = await loadDspModule(wasmBytes);
      this.mainEnginePtr = this.dspExports.create_compressor(this.audioContext.sampleRate);

      this.applyStateToMainEngine();

      // Register AudioWorklet processor
      if (typeof this.audioContext.audioWorklet !== 'undefined') {
        const blob = new Blob([COMP_WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        try {
          await this.audioContext.audioWorklet.addModule(workletUrl);
        } catch {
          // Module might already be registered in the audioContext
        } finally {
          URL.revokeObjectURL(workletUrl);
        }

        this.workletNode = new AudioWorkletNode(this.audioContext, 'sonods-comp-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });

        this.workletNode.port.onmessage = (event) => {
          const data = event.data;
          if (data.type === 'METER_TELEMETRY') {
            this.currentGrDb = data.grDb;
            this.currentTelemetry = {
              inputDb: data.inputDb,
              detectedDb: data.detectedDb,
              outputDb: data.outputDb,
              grDb: data.grDb,
            };
            this.notifyGrListeners(data.grDb);
            this.notifyTelemetryListeners(this.currentTelemetry);
          } else if (data.type === 'METER_GR') {
            this.currentGrDb = data.grDb;
            this.notifyGrListeners(data.grDb);
          }
        };

        this.inputNode.connect(this.workletNode);
        this.workletNode.connect(this.postAnalyser);
        this.postAnalyser.connect(this.outputNode);

        this.workletNode.port.postMessage({
          type: 'INIT',
          wasmBytes: wasmBytes.buffer,
          sampleRate: this.audioContext.sampleRate,
          sharedBuffer: this.sharedLayout ? this.sharedLayout.buffer : undefined,
        });

        // Send current parameters to worklet
        this.sendAllParamsToWorklet();

        // Start reverse-direction metering polling if SharedArrayBuffer supported
        if (this.sharedLayout && this.sharedLayout.meterGrDb) {
          this.meterPollInterval = window.setInterval(() => {
            if (this.sharedLayout && this.sharedLayout.meterGrDb) {
              const gr = this.sharedLayout.meterGrDb[0];
              if (gr !== this.currentGrDb) {
                this.currentGrDb = gr;
                this.notifyGrListeners(gr);
              }
            }
          }, 16); // ~60 Hz
        }
      } else {
        // Direct pass-through if worklet unsupported
        this.inputNode.connect(this.postAnalyser);
        this.postAnalyser.connect(this.outputNode);
      }
    } catch (err) {
      console.warn('AudioWorklet initialization fallback to bypass:', err);
      this.inputNode.connect(this.postAnalyser);
      this.postAnalyser.connect(this.outputNode);
    }
  }

  private sendAllParamsToWorklet(): void {
    this.sendParam(CommandType.SetThreshold, this.state.threshold);
    this.sendParam(CommandType.SetRatio, this.state.ratio);
    this.sendParam(CommandType.SetAttack, this.state.attack);
    this.sendParam(CommandType.SetRelease, this.state.release);
    this.sendParam(CommandType.SetKnee, this.state.knee);
    this.sendParam(CommandType.SetLink, this.state.link);
    this.sendParam(CommandType.SetMix, this.state.mix);
    this.sendParam(CommandType.SetOutputGain, this.state.outputGain);
    this.sendParam(CommandType.SetAutoGain, this.state.autoGain);
    this.sendParam(CommandType.SetSidechainHpf, this.state.sidechainHpf);
    this.sendParam(CommandType.SetLookahead, this.state.lookahead);
    this.sendParam(CommandType.SetCharacter, this.getCharacterId(this.state.character));
  }

  private applyStateToMainEngine(): void {
    if (!this.dspExports || !this.mainEnginePtr) return;
    this.dspExports.set_threshold(this.mainEnginePtr, this.state.threshold);
    this.dspExports.set_ratio(this.mainEnginePtr, this.state.ratio);
    this.dspExports.set_attack(this.mainEnginePtr, this.state.attack);
    this.dspExports.set_release(this.mainEnginePtr, this.state.release);
    this.dspExports.set_knee(this.mainEnginePtr, this.state.knee);
    this.dspExports.set_stereo_link(this.mainEnginePtr, this.state.link);
    this.dspExports.set_mix(this.mainEnginePtr, this.state.mix);
    this.dspExports.set_output_gain(this.mainEnginePtr, this.state.outputGain);
    this.dspExports.set_auto_gain(this.mainEnginePtr, this.state.autoGain);
    this.dspExports.set_sidechain_hpf(this.mainEnginePtr, this.state.sidechainHpf);
    this.dspExports.set_lookahead(this.mainEnginePtr, this.state.lookahead);
    this.dspExports.set_character(this.mainEnginePtr, this.getCharacterId(this.state.character));
  }

  private getCharacterId(char: CompressorCharacterType): number {
    switch (char) {
      case 'vca': return 0;
      case 'opto': return 1;
      case 'fet': return 2;
    }
  }

  private sendParam(cmd: CommandType, value: number): void {
    if (this.sharedLayout) {
      const pushed = pushCommandToRingBuffer(this.sharedLayout, cmd, value);
      if (pushed) return;
    }
    // Fallback: postMessage
    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'SET_PARAM',
        cmd,
        value,
      });
    }
  }

  public connect(destination: AudioNode): AudioNode {
    return this.outputNode.connect(destination);
  }

  public disconnect(): void {
    this.outputNode.disconnect();
  }

  // --- Public Getters & Setters ---

  public getState(): CompressorState {
    return { ...this.state };
  }

  public setThreshold(thresholdDb: number): void {
    const val = Math.max(-60.0, Math.min(0.0, thresholdDb));
    this.state.threshold = val;
    this.sendParam(CommandType.SetThreshold, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_threshold(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setRatio(ratio: number): void {
    const val = Math.max(1.0, Math.min(30.0, ratio));
    this.state.ratio = val;
    this.sendParam(CommandType.SetRatio, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_ratio(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setAttack(attackS: number): void {
    const val = Math.max(0.00005, Math.min(0.5, attackS));
    this.state.attack = val;
    this.sendParam(CommandType.SetAttack, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_attack(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setRelease(releaseS: number): void {
    const val = Math.max(0.005, Math.min(2.5, releaseS));
    this.state.release = val;
    this.sendParam(CommandType.SetRelease, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_release(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setKnee(kneeDb: number): void {
    const val = Math.max(0.0, Math.min(24.0, kneeDb));
    this.state.knee = val;
    this.sendParam(CommandType.SetKnee, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_knee(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setLink(link: number): void {
    const val = Math.max(0.0, Math.min(1.0, link));
    this.state.link = val;
    this.sendParam(CommandType.SetLink, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_stereo_link(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setMix(mix: number): void {
    const val = Math.max(0.0, Math.min(1.0, mix));
    this.state.mix = val;
    this.sendParam(CommandType.SetMix, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_mix(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setOutputGain(gainDb: number): void {
    const val = Math.max(-24.0, Math.min(24.0, gainDb));
    this.state.outputGain = val;
    this.sendParam(CommandType.SetOutputGain, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_output_gain(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setAutoGain(amount: number): void {
    const val = Math.max(0.0, Math.min(1.0, amount));
    this.state.autoGain = val;
    this.sendParam(CommandType.SetAutoGain, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_auto_gain(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setSidechainHpf(cutoffHz: number): void {
    const val = Math.max(20.0, Math.min(500.0, cutoffHz));
    this.state.sidechainHpf = val;
    this.sendParam(CommandType.SetSidechainHpf, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_sidechain_hpf(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setLookahead(lookaheadS: number): void {
    const val = Math.max(0.0, Math.min(0.010, lookaheadS));
    this.state.lookahead = val;
    this.sendParam(CommandType.SetLookahead, val);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_lookahead(this.mainEnginePtr, val);
    }
    this.notify();
  }

  public setCharacter(char: CompressorCharacterType): void {
    this.state.character = char;
    // Update default knee width per character
    if (char === 'vca') this.state.knee = 6.0;
    else if (char === 'opto') this.state.knee = 12.0;
    else if (char === 'fet') this.state.knee = 2.0;

    const charId = this.getCharacterId(char);
    this.sendParam(CommandType.SetCharacter, charId);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_character(this.mainEnginePtr, charId);
    }
    this.notify();
  }

  public getLatencySamples(): number {
    return Math.round(this.state.lookahead * this.state.sampleRate);
  }

  public getCurrentGainReductionDb(): number {
    return this.currentGrDb;
  }

  public getTelemetry(): CompressorTelemetryFrame {
    return this.currentTelemetry;
  }

  public subscribe(listener: (state: CompressorState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public subscribeGainReduction(listener: (grDb: number) => void): () => void {
    this.grListeners.add(listener);
    listener(this.currentGrDb);
    return () => this.grListeners.delete(listener);
  }

  public subscribeTelemetry(listener: (frame: CompressorTelemetryFrame) => void): () => void {
    this.telemetryListeners.add(listener);
    listener(this.currentTelemetry);
    return () => this.telemetryListeners.delete(listener);
  }

  private notify(): void {
    const st = this.getState();
    for (const l of this.listeners) l(st);
  }

  private notifyGrListeners(grDb: number): void {
    for (const l of this.grListeners) l(grDb);
  }

  private notifyTelemetryListeners(frame: CompressorTelemetryFrame): void {
    for (const l of this.telemetryListeners) l(frame);
  }

  public dispose(): void {
    if (this.meterPollInterval !== null) {
      clearInterval(this.meterPollInterval);
      this.meterPollInterval = null;
    }
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.destroy_compressor(this.mainEnginePtr);
      this.mainEnginePtr = 0;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
  }
}
