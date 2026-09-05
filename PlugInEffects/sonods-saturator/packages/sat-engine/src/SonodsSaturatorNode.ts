// SonodsSaturatorNode.ts
import {
  CharacterType,
  DspExports,
  QualityType,
  SaturatorState,
} from './types.js';
import { loadDspModule } from './wasmLoader.js';
import {
  CommandType,
  createSharedMemoryLayout,
  pushCommandToRingBuffer,
  SharedMemoryLayout,
} from './ringBuffer.js';
import { WORKLET_PROCESSOR_CODE } from './worklet/sonods-sat-processor.js';
import { getWasmBytes } from './wasm/wasmBinary.js';

export class SonodsSaturatorNode {
  readonly audioContext: AudioContext;
  readonly inputNode: GainNode;
  readonly outputNode: GainNode;
  readonly preAnalyser: AnalyserNode;
  readonly postAnalyser: AnalyserNode;
  private workletNode: AudioWorkletNode | null = null;

  // Main-thread WASM engine instance for instant UI curve rendering
  private dspExports: DspExports | null = null;
  private mainEnginePtr = 0;
  private sharedLayout: SharedMemoryLayout | null = null;

  private state: SaturatorState;
  private listeners: Set<(state: SaturatorState) => void> = new Set();
  private readyPromise: Promise<void>;

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
      drive: 0.3,
      tone: 0.0,
      character: 'tape',
      mix: 1.0,
      outputGain: 0.0,
      autoGain: true,
      quality: 'standard',
      sampleRate: audioContext.sampleRate,
    };

    this.sharedLayout = createSharedMemoryLayout();
    this.readyPromise = this.init();
  }

  public async whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private async init(): Promise<void> {
    const wasmBytes = getWasmBytes();
    this.dspExports = await loadDspModule(wasmBytes);
    this.mainEnginePtr = this.dspExports.create_saturator(this.audioContext.sampleRate);

    // Synchronize initial state with main thread engine
    this.applyStateToMainEngine();

    // Register AudioWorklet processor
    if (typeof this.audioContext.audioWorklet !== 'undefined') {
      const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);

      try {
        await this.audioContext.audioWorklet.addModule(workletUrl);
      } catch {
        // Module might already be registered in the audioContext
      } finally {
        URL.revokeObjectURL(workletUrl);
      }

      this.workletNode = new AudioWorkletNode(this.audioContext, 'sonods-sat-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.inputNode.connect(this.workletNode);
      this.workletNode.connect(this.postAnalyser);
      this.postAnalyser.connect(this.outputNode);

      // Send initial configuration to worklet
      this.workletNode.port.postMessage({
        type: 'INIT',
        wasmBytes: wasmBytes.buffer,
        sampleRate: this.audioContext.sampleRate,
        sharedBuffer: this.sharedLayout ? this.sharedLayout.buffer : null,
      });

      // Send initial parameter values
      this.sendParamToWorklet('SET_DRIVE', CommandType.SetDrive, this.state.drive);
      this.sendParamToWorklet('SET_TONE', CommandType.SetTone, this.state.tone);
      this.sendParamToWorklet('SET_CHARACTER', CommandType.SetCharacter, this.getCharacterId(this.state.character));
      this.sendParamToWorklet('SET_MIX', CommandType.SetMix, this.state.mix);
      this.sendParamToWorklet('SET_OUTPUT_GAIN', CommandType.SetOutputGain, this.state.outputGain);
      this.sendParamToWorklet('SET_AUTO_GAIN', CommandType.SetAutoGain, this.state.autoGain ? 1 : 0);
      this.sendParamToWorklet('SET_QUALITY', CommandType.SetQuality, this.state.quality === 'high' ? 1 : 0);
    } else {
      // Direct pass-through if running in an environment without AudioWorklet
      this.inputNode.connect(this.outputNode);
    }
  }

  public connect(destination: AudioNode): AudioNode {
    return this.outputNode.connect(destination);
  }

  public disconnect(): void {
    this.outputNode.disconnect();
  }

  private getCharacterId(char: CharacterType): number {
    switch (char) {
      case 'tape': return 0;
      case 'tube': return 1;
      case 'transformer': return 2;
      default: return 0;
    }
  }

  private applyStateToMainEngine(): void {
    if (!this.dspExports || !this.mainEnginePtr) return;
    this.dspExports.set_drive(this.mainEnginePtr, this.state.drive);
    this.dspExports.set_tone(this.mainEnginePtr, this.state.tone);
    this.dspExports.set_character(this.mainEnginePtr, this.getCharacterId(this.state.character));
    this.dspExports.set_mix(this.mainEnginePtr, this.state.mix);
    this.dspExports.set_output_gain(this.mainEnginePtr, this.state.outputGain);
    this.dspExports.set_auto_gain(this.mainEnginePtr, this.state.autoGain ? 1 : 0);
    this.dspExports.set_quality(this.mainEnginePtr, this.state.quality === 'high' ? 1 : 0);
  }

  private sendParamToWorklet(postMsgType: string, cmdType: CommandType, value: number): void {
    let queued = false;
    if (this.sharedLayout) {
      queued = pushCommandToRingBuffer(this.sharedLayout, cmdType, value);
    }

    if (!queued && this.workletNode) {
      this.workletNode.port.postMessage({ type: postMsgType, value });
    }
  }

  // --- Parameter Setters ---

  public setDrive(drive: number): void {
    const val = Math.max(0.0, Math.min(1.0, drive));
    this.state.drive = val;
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_drive(this.mainEnginePtr, val);
    }
    this.sendParamToWorklet('SET_DRIVE', CommandType.SetDrive, val);
    this.notify();
  }

  public setTone(toneDb: number): void {
    const val = Math.max(-24.0, Math.min(24.0, toneDb));
    this.state.tone = val;
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_tone(this.mainEnginePtr, val);
    }
    this.sendParamToWorklet('SET_TONE', CommandType.SetTone, val);
    this.notify();
  }

  public setCharacter(character: CharacterType): void {
    this.state.character = character;
    const charId = this.getCharacterId(character);
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_character(this.mainEnginePtr, charId);
    }
    this.sendParamToWorklet('SET_CHARACTER', CommandType.SetCharacter, charId);
    this.notify();
  }

  public setMix(mix: number): void {
    const val = Math.max(0.0, Math.min(1.0, mix));
    this.state.mix = val;
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_mix(this.mainEnginePtr, val);
    }
    this.sendParamToWorklet('SET_MIX', CommandType.SetMix, val);
    this.notify();
  }

  public setOutputGain(gainDb: number): void {
    const val = Math.max(-36.0, Math.min(36.0, gainDb));
    this.state.outputGain = val;
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_output_gain(this.mainEnginePtr, val);
    }
    this.sendParamToWorklet('SET_OUTPUT_GAIN', CommandType.SetOutputGain, val);
    this.notify();
  }

  public setAutoGain(enabled: boolean): void {
    this.state.autoGain = enabled;
    const val = enabled ? 1 : 0;
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_auto_gain(this.mainEnginePtr, val);
    }
    this.sendParamToWorklet('SET_AUTO_GAIN', CommandType.SetAutoGain, val);
    this.notify();
  }

  public setQuality(quality: QualityType): void {
    this.state.quality = quality;
    const val = quality === 'high' ? 1 : 0;
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_quality(this.mainEnginePtr, val);
    }
    this.sendParamToWorklet('SET_QUALITY', CommandType.SetQuality, val);
    this.notify();
  }

  // --- Getters ---

  public getState(): SaturatorState {
    return { ...this.state };
  }

  public getLatencySamples(): number {
    if (this.dspExports && this.mainEnginePtr) {
      return this.dspExports.get_latency_samples(this.mainEnginePtr);
    }
    return 0;
  }

  /**
   * Evaluates the non-linear transfer curve for visualization.
   * Returns array of [x, y] points mapped from -1.0 to +1.0.
   */
  public getTransferCurve(numPoints = 256): { x: number; y: number }[] {
    if (!this.dspExports || !this.mainEnginePtr || numPoints <= 0) {
      // Fallback mathematical linear curve
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < numPoints; i++) {
        const x = -1.0 + (2.0 * i) / (numPoints - 1);
        points.push({ x, y: x });
      }
      return points;
    }

    const inPtr = this.dspExports.allocate_f64_buffer(numPoints);
    const outPtr = this.dspExports.allocate_f64_buffer(numPoints);

    const memF64 = new Float64Array(this.dspExports.memory.buffer);
    const inOffset = inPtr >> 3;
    const outOffset = outPtr >> 3;

    for (let i = 0; i < numPoints; i++) {
      memF64[inOffset + i] = -1.0 + (2.0 * i) / (numPoints - 1);
    }

    this.dspExports.get_transfer_curve(this.mainEnginePtr, inPtr, outPtr, numPoints);

    const outMemF64 = new Float64Array(this.dspExports.memory.buffer);
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < numPoints; i++) {
      points.push({
        x: memF64[inOffset + i],
        y: outMemF64[outOffset + i],
      });
    }

    this.dspExports.deallocate_f64_buffer(inPtr, numPoints);
    this.dspExports.deallocate_f64_buffer(outPtr, numPoints);

    return points;
  }

  public subscribe(listener: (state: SaturatorState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  public dispose(): void {
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.destroy_saturator(this.mainEnginePtr);
      this.mainEnginePtr = 0;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.preAnalyser.disconnect();
    this.postAnalyser.disconnect();
    this.listeners.clear();
  }
}
