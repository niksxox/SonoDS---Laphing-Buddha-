import {
  BandState,
  CutSlope,
  DspExports,
  EqState,
  MAX_BANDS,
  ParamId,
  PhaseMode,
  ProcessingMode,
  Shape,
} from './types.js';
import { loadDspModule } from './wasmLoader.js';
import {
  CommandType,
  createSharedMemoryLayout,
  pushCommandToRingBuffer,
  SharedMemoryLayout,
} from './ringBuffer.js';
import { WORKLET_PROCESSOR_CODE } from './worklet/sonods-eq-processor.js';
import { getWasmBytes } from './wasm/wasmBinary.js';

export class SonodsEqNode {
  readonly audioContext: AudioContext;
  readonly inputNode: GainNode;
  readonly outputNode: GainNode;
  readonly preAnalyser: AnalyserNode;
  readonly postAnalyser: AnalyserNode;
  private workletNode: AudioWorkletNode | null = null;

  // Main-thread WASM engine instance for instant UI curve calculations
  private dspExports: DspExports | null = null;
  private mainEnginePtr = 0;
  private sharedLayout: SharedMemoryLayout | null = null;

  private bands: Map<number, BandState> = new Map();
  private phaseMode: PhaseMode = PhaseMode.ZeroLatency;
  private nextBandId = 1;

  // Curve caching
  private curveDirty = true;
  private cachedCurve: { freq: number; gainDb: number }[] = [];
  private cachedBandCurves: Map<number, { freq: number; gainDb: number }[]> = new Map();

  // State change subscribers
  private listeners: Set<(state: EqState) => void> = new Set();
  private currentSnapshot: EqState;
  private readyPromise: Promise<void>;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;

    this.inputNode = audioContext.createGain();
    this.outputNode = audioContext.createGain();

    this.preAnalyser = audioContext.createAnalyser();
    this.preAnalyser.fftSize = 4096;
    this.preAnalyser.smoothingTimeConstant = 0.8;

    this.postAnalyser = audioContext.createAnalyser();
    this.postAnalyser.fftSize = 4096;
    this.postAnalyser.smoothingTimeConstant = 0.8;

    // Connect pre-analyser tap
    this.inputNode.connect(this.preAnalyser);

    this.currentSnapshot = {
      bands: [],
      phaseMode: this.phaseMode,
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
    this.mainEnginePtr = this.dspExports.create_engine(this.audioContext.sampleRate);

    // Register AudioWorklet
    const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);

    try {
      await this.audioContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    this.workletNode = new AudioWorkletNode(this.audioContext, 'sonods-eq-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Wire nodes: input -> worklet -> postAnalyser -> output
    this.inputNode.connect(this.workletNode);
    this.workletNode.connect(this.postAnalyser);
    this.postAnalyser.connect(this.outputNode);

    // Send init message to worklet
    this.workletNode.port.postMessage({
      type: 'INIT',
      wasmBytes: wasmBytes.buffer,
      sampleRate: this.audioContext.sampleRate,
      sharedBuffer: this.sharedLayout?.sab,
    });
  }

  public connect(destination: AudioNode): AudioNode {
    return this.outputNode.connect(destination);
  }

  public disconnect(): void {
    this.outputNode.disconnect();
  }

  public getPreAnalyserData(): Float32Array {
    const data = new Float32Array(this.preAnalyser.frequencyBinCount);
    this.preAnalyser.getFloatFrequencyData(data);
    return data;
  }

  public getPostAnalyserData(): Float32Array {
    const data = new Float32Array(this.postAnalyser.frequencyBinCount);
    this.postAnalyser.getFloatFrequencyData(data);
    return data;
  }

  public addBand(
    shape: Shape = Shape.Bell,
    freq: number = 1000,
    gain: number = 0,
    q: number = 1.0,
    slope: CutSlope = CutSlope.Db24
  ): BandState | null {
    // Find first free index (0..MAX_BANDS-1)
    let slot = -1;
    for (let i = 0; i < MAX_BANDS; i++) {
      if (!this.bands.has(i)) {
        slot = i;
        break;
      }
    }
    if (slot === -1) return null;

    const band: BandState = {
      id: this.nextBandId++,
      index: slot,
      shape,
      slope,
      freq: Math.max(10, Math.min(freq, 22000)),
      gain: Math.max(-30, Math.min(gain, 30)),
      q: Math.max(0.1, Math.min(q, 40)),
      enabled: true,
      mode: ProcessingMode.Stereo,
      dynamicEnabled: false,
      dynamicThreshold: -18,
      dynamicRange: 0,
    };

    this.bands.set(slot, band);
    this.updateBandInEngine(band);
    this.curveDirty = true;
    this.notifyState();
    return band;
  }

  public removeBand(bandIndex: number): void {
    if (this.bands.has(bandIndex)) {
      this.bands.delete(bandIndex);
      if (this.dspExports && this.mainEnginePtr) {
        this.dspExports.remove_band(this.mainEnginePtr, bandIndex);
      }

      if (this.sharedLayout) {
        // Zero out freq in SAB so processor sees it disabled
        this.sharedLayout.params[bandIndex * 10] = 0;
        pushCommandToRingBuffer(this.sharedLayout.cmdBuffer, CommandType.RemoveBand, bandIndex, 0, 0);
      }

      this.workletNode?.port.postMessage({
        type: 'REMOVE_BAND',
        index: bandIndex,
      });

      this.curveDirty = true;
      this.notifyState();
    }
  }

  public setBandParam(bandIndex: number, paramId: ParamId, value: number): void {
    const band = this.bands.get(bandIndex);
    if (!band) return;

    switch (paramId) {
      case ParamId.Freq:
        band.freq = Math.max(10, Math.min(value, 22000));
        break;
      case ParamId.Gain:
        band.gain = Math.max(-30, Math.min(value, 30));
        break;
      case ParamId.Q:
        band.q = Math.max(0.05, Math.min(value, 40));
        break;
      case ParamId.Shape:
        band.shape = value as Shape;
        break;
      case ParamId.Slope:
        band.slope = value as CutSlope;
        break;
      case ParamId.Enabled:
        band.enabled = value > 0.5;
        break;
      case ParamId.Mode:
        band.mode = value as ProcessingMode;
        break;
      case ParamId.DynamicEnabled:
        band.dynamicEnabled = value > 0.5;
        break;
      case ParamId.DynamicThreshold:
        band.dynamicThreshold = value;
        break;
      case ParamId.DynamicRange:
        band.dynamicRange = value;
        break;
    }

    // Update main-thread WASM engine for visual curve calculation
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_band_param(this.mainEnginePtr, bandIndex, paramId, value);
    }

    // Update SharedArrayBuffer if active
    if (this.sharedLayout) {
      const base = bandIndex * 10;
      this.sharedLayout.params[base + paramId] = value;
    }

    // Send targeted parameter change to worklet
    this.workletNode?.port.postMessage({
      type: 'SET_PARAM',
      bandIndex,
      paramId,
      value,
    });

    this.curveDirty = true;
    this.notifyState();
  }

  private updateBandInEngine(band: BandState): void {
    const i = band.index;

    // Update main-thread WASM engine for instant visual curve math
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_band(
        this.mainEnginePtr,
        i,
        band.shape,
        band.freq,
        band.gain,
        band.q,
        band.enabled ? 1 : 0
      );
      this.dspExports.set_band_param(this.mainEnginePtr, i, ParamId.Slope, band.slope);
      this.dspExports.set_band_param(this.mainEnginePtr, i, ParamId.Mode, band.mode);
      this.dspExports.set_band_param(this.mainEnginePtr, i, ParamId.DynamicEnabled, band.dynamicEnabled ? 1 : 0);
      this.dspExports.set_band_param(this.mainEnginePtr, i, ParamId.DynamicThreshold, band.dynamicThreshold);
      this.dspExports.set_band_param(this.mainEnginePtr, i, ParamId.DynamicRange, band.dynamicRange);
    }

    // Update SharedArrayBuffer if active
    if (this.sharedLayout) {
      const base = i * 10;
      this.sharedLayout.params[base + 0] = band.freq;
      this.sharedLayout.params[base + 1] = band.gain;
      this.sharedLayout.params[base + 2] = band.q;
      this.sharedLayout.params[base + 3] = band.shape;
      this.sharedLayout.params[base + 4] = band.slope;
      this.sharedLayout.params[base + 5] = band.enabled ? 1 : 0;
      this.sharedLayout.params[base + 6] = band.mode;
      this.sharedLayout.params[base + 7] = band.dynamicEnabled ? 1 : 0;
      this.sharedLayout.params[base + 8] = band.dynamicThreshold;
      this.sharedLayout.params[base + 9] = band.dynamicRange;
    }

    // Post message fallback for worklet
    this.workletNode?.port.postMessage({
      type: 'SET_BAND',
      index: i,
      shape: band.shape,
      freq: band.freq,
      gain: band.gain,
      q: band.q,
      enabled: band.enabled,
    });
  }

  public setPhaseMode(mode: PhaseMode): void {
    this.phaseMode = mode;
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.set_phase_mode(this.mainEnginePtr, mode);
    }

    if (this.sharedLayout) {
      pushCommandToRingBuffer(this.sharedLayout.cmdBuffer, CommandType.SetPhaseMode, 0, mode, 0);
    }

    this.workletNode?.port.postMessage({
      type: 'SET_PHASE_MODE',
      mode,
    });

    this.curveDirty = true;
    this.notifyState();
  }

  public getBands(): BandState[] {
    return Array.from(this.bands.values()).sort((a, b) => a.index - b.index);
  }

  public getState(): EqState {
    return this.currentSnapshot;
  }

  public setState(state: EqState): void {
    // Clear existing bands
    for (const band of this.getBands()) {
      this.removeBand(band.index);
    }

    for (const b of state.bands) {
      const added = this.addBand(b.shape, b.freq, b.gain, b.q, b.slope);
      if (added) {
        if (!b.enabled) this.setBandParam(added.index, ParamId.Enabled, 0);
        if (b.mode !== ProcessingMode.Stereo) this.setBandParam(added.index, ParamId.Mode, b.mode);
        if (b.dynamicEnabled) {
          this.setBandParam(added.index, ParamId.DynamicEnabled, 1);
          this.setBandParam(added.index, ParamId.DynamicThreshold, b.dynamicThreshold);
          this.setBandParam(added.index, ParamId.DynamicRange, b.dynamicRange);
        }
      }
    }

    if (state.phaseMode !== undefined) {
      this.setPhaseMode(state.phaseMode);
    }
  }

  public snapBand(
    slot: number,
    shape: Shape = Shape.Bell,
    freq: number = 1000,
    gain: number = 0,
    q: number = 1.0,
    slope: CutSlope = CutSlope.Db24
  ): BandState {
    const band: BandState = {
      id: this.nextBandId++,
      index: slot,
      shape,
      slope,
      freq: Math.max(10, Math.min(freq, 22000)),
      gain: Math.max(-30, Math.min(gain, 30)),
      q: Math.max(0.1, Math.min(q, 40)),
      enabled: true,
      mode: ProcessingMode.Stereo,
      dynamicEnabled: false,
      dynamicThreshold: -18,
      dynamicRange: 0,
    };

    this.bands.set(slot, band);

    if (this.dspExports && this.mainEnginePtr) {
      if (this.dspExports.snap_band) {
        this.dspExports.snap_band(
          this.mainEnginePtr,
          slot,
          band.shape,
          band.freq,
          band.gain,
          band.q,
          1
        );
      } else {
        this.dspExports.set_band(
          this.mainEnginePtr,
          slot,
          band.shape,
          band.freq,
          band.gain,
          band.q,
          1
        );
      }
    }

    if (this.sharedLayout) {
      const base = slot * 10;
      this.sharedLayout.params[base + 0] = band.freq;
      this.sharedLayout.params[base + 1] = band.gain;
      this.sharedLayout.params[base + 2] = band.q;
      this.sharedLayout.params[base + 3] = band.shape;
      this.sharedLayout.params[base + 4] = band.slope;
      this.sharedLayout.params[base + 5] = 1;
      this.sharedLayout.params[base + 6] = band.mode;
      this.sharedLayout.params[base + 7] = 0;
      this.sharedLayout.params[base + 8] = band.dynamicThreshold;
      this.sharedLayout.params[base + 9] = band.dynamicRange;
    }

    this.workletNode?.port.postMessage({
      type: 'SNAP_BAND',
      index: slot,
      shape: band.shape,
      freq: band.freq,
      gain: band.gain,
      q: band.q,
      enabled: true,
    });

    return band;
  }

  public resetToDefault(): void {
    if (this.dspExports && this.mainEnginePtr) {
      if (this.dspExports.clear_bands) {
        this.dspExports.clear_bands(this.mainEnginePtr);
      }
    }
    this.bands.clear();

    if (this.sharedLayout) {
      this.sharedLayout.params.fill(0);
    }

    this.workletNode?.port.postMessage({
      type: 'CLEAR_BANDS',
    });

    this.snapBand(0, Shape.LowCut, 35, 0.0, 0.7);
    this.snapBand(1, Shape.LowShelf, 120, 0.0, 0.8);
    this.snapBand(2, Shape.Bell, 800, 0.0, 1.4);
    this.snapBand(3, Shape.HighShelf, 6000, 0.0, 0.9);
    this.snapBand(4, Shape.HighCut, 18000, 0.0, 0.7);
    this.curveDirty = true;
    this.notifyState();
  }

  /**
   * Log-spaced frequency curve points with change-based caching (Task 3.2)
   */
  public getResponseCurve(numPoints = 512): { freq: number; gainDb: number }[] {
    if (!this.curveDirty && this.cachedCurve.length === numPoints) {
      return this.cachedCurve;
    }

    if (!this.dspExports || !this.mainEnginePtr) {
      return Array.from({ length: numPoints }, (_, i) => {
        const logMin = Math.log10(20);
        const logMax = Math.log10(20000);
        const freq = Math.pow(10, logMin + (i / (numPoints - 1)) * (logMax - logMin));
        return { freq, gainDb: 0 };
      });
    }

    const freqsPtr = this.dspExports.allocate_f64_buffer(numPoints);
    const outPtr = this.dspExports.allocate_f64_buffer(numPoints);

    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);
    const freqs = new Float64Array(this.dspExports.memory.buffer, freqsPtr, numPoints);

    for (let i = 0; i < numPoints; i++) {
      freqs[i] = Math.pow(10, logMin + (i / (numPoints - 1)) * (logMax - logMin));
    }

    this.dspExports.get_magnitude_response(this.mainEnginePtr, freqsPtr, outPtr, numPoints);
    const mags = new Float64Array(this.dspExports.memory.buffer, outPtr, numPoints);

    this.cachedCurve = Array.from({ length: numPoints }, (_, i) => ({
      freq: freqs[i],
      gainDb: mags[i],
    }));

    this.dspExports.deallocate_f64_buffer(freqsPtr, numPoints);
    this.dspExports.deallocate_f64_buffer(outPtr, numPoints);
    this.curveDirty = false;

    return this.cachedCurve;
  }

  public getBandResponseCurve(bandIndex: number, numPoints = 256): { freq: number; gainDb: number }[] {
    if (!this.dspExports || !this.mainEnginePtr || !this.bands.has(bandIndex)) {
      return [];
    }

    const freqsPtr = this.dspExports.allocate_f64_buffer(numPoints);
    const outPtr = this.dspExports.allocate_f64_buffer(numPoints);

    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);
    const freqs = new Float64Array(this.dspExports.memory.buffer, freqsPtr, numPoints);

    for (let i = 0; i < numPoints; i++) {
      freqs[i] = Math.pow(10, logMin + (i / (numPoints - 1)) * (logMax - logMin));
    }

    this.dspExports.get_band_magnitude_response(this.mainEnginePtr, bandIndex, freqsPtr, outPtr, numPoints);
    const mags = new Float64Array(this.dspExports.memory.buffer, outPtr, numPoints);

    const result = Array.from({ length: numPoints }, (_, i) => ({
      freq: freqs[i],
      gainDb: mags[i],
    }));

    this.dspExports.deallocate_f64_buffer(freqsPtr, numPoints);
    this.dspExports.deallocate_f64_buffer(outPtr, numPoints);

    return result;
  }

  public onStateChange(listener: (state: EqState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateSnapshot(): void {
    this.currentSnapshot = {
      bands: this.getBands(),
      phaseMode: this.phaseMode,
      sampleRate: this.audioContext.sampleRate,
    };
  }

  private notifyState(): void {
    this.updateSnapshot();
    for (const listener of this.listeners) {
      listener(this.currentSnapshot);
    }
  }

  public destroy(): void {
    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.destroy_engine(this.mainEnginePtr);
      this.mainEnginePtr = 0;
    }
    this.disconnect();
    this.listeners.clear();
  }
}
