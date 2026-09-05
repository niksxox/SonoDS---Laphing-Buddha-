// SonodsGateNode.ts — Web Audio Node interface for SonoDS Gate/Expander
import {
  GateCharacterStyle,
  GateDetectorType,
  GateDspExports,
  GateProcessingMode,
  GateRoutingMode,
  GateSidechainSource,
  GateState,
  GateTelemetryFrame,
} from './types.js';
import { loadGateDspModule } from './wasmLoader.js';
import { getWasmBytes } from './wasm/wasmBinary.js';
import { GATE_WORKLET_PROCESSOR_CODE } from './worklet/gate-processor.js';

export class SonodsGateNode {
  readonly audioContext: AudioContext;
  readonly inputNode: GainNode;
  readonly sidechainInputNode: GainNode;
  readonly outputNode: GainNode;
  readonly preAnalyser: AnalyserNode;
  readonly postAnalyser: AnalyserNode;
  private workletNode: AudioWorkletNode | null = null;

  private dspExports: GateDspExports | null = null;
  private mainEnginePtr = 0;

  private state: GateState;
  private listeners: Set<(state: GateState) => void> = new Set();
  private grListeners: Set<(grDb: number) => void> = new Set();
  private telemetryListeners: Set<(frame: GateTelemetryFrame) => void> = new Set();
  private readyPromise: Promise<void>;

  private currentGrDb = 0.0;
  private currentTelemetry: GateTelemetryFrame = {
    inputDb: -60.0,
    detectedDb: -60.0,
    outputDb: -60.0,
    grDb: 0.0,
    state: 'closed',
  };

  private midiAccess: any = null;
  private midiChannel: number | null = null;
  private midiTargetNote: number | null = null;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;

    this.inputNode = audioContext.createGain();
    this.sidechainInputNode = audioContext.createGain();
    this.outputNode = audioContext.createGain();

    this.preAnalyser = audioContext.createAnalyser();
    this.preAnalyser.fftSize = 2048;
    this.preAnalyser.smoothingTimeConstant = 0.8;

    this.postAnalyser = audioContext.createAnalyser();
    this.postAnalyser.fftSize = 2048;
    this.postAnalyser.smoothingTimeConstant = 0.8;

    this.inputNode.connect(this.preAnalyser);

    this.state = {
      threshold: -24.0,
      range: -60.0,
      ratio: 100.0, // Hard gate by default
      knee: 0.0,
      attack: 0.002, // 2 ms
      hold: 0.020,   // 20 ms
      release: 0.150,// 150 ms
      lookahead: 0.0,
      style: 'classic',
      mode: 'gate',
      detectorMode: 'peak',
      sidechainSource: 'internal',
      sidechainListen: false,
      sidechainHpf: 20.0,
      sidechainLpf: 20000.0,
      stereoLink: 1.0,
      routingMode: 'stereo',
      mix: 1.0,
      outputGain: 0.0,
      midiForceOpen: false,
    };

    // Connect input directly to output initially so audio plays immediately while worklet loads
    this.inputNode.connect(this.outputNode);
    this.readyPromise = this.init();
  }

  public async whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private async init(): Promise<void> {
    try {
      const wasmBytes = getWasmBytes();
      this.dspExports = await loadGateDspModule(wasmBytes);
      this.mainEnginePtr = this.dspExports.create_gate(this.audioContext.sampleRate);
      this.applyStateToMainEngine();

      if (typeof this.audioContext.audioWorklet !== 'undefined') {
        const blob = new Blob([GATE_WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await this.audioContext.audioWorklet.addModule(workletUrl);

        this.workletNode = new AudioWorkletNode(this.audioContext, 'sonods-gate-processor', {
          numberOfInputs: 2, // 0 = main, 1 = external sidechain
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });

        this.workletNode.port.onmessage = (event) => {
          const data = event.data;
          if (data.type === 'TELEMETRY') {
            this.currentGrDb = data.grDb;
            this.currentTelemetry = {
              inputDb: data.inputDb,
              detectedDb: data.detectedDb,
              outputDb: data.outputDb,
              grDb: data.grDb,
              state: data.state,
            };
            this.notifyGrListeners(data.grDb);
            this.notifyTelemetryListeners(this.currentTelemetry);
          }
        };

        this.workletNode.port.postMessage({
          type: 'INIT',
          wasmBytes,
          sampleRate: this.audioContext.sampleRate,
        });

        // Switch from fallback direct bypass to the worklet DSP node
        try {
          this.inputNode.disconnect(this.outputNode);
        } catch {}

        this.inputNode.connect(this.workletNode, 0, 0);
        this.sidechainInputNode.connect(this.workletNode, 0, 1);
        this.workletNode.connect(this.postAnalyser);
        this.postAnalyser.connect(this.outputNode);

        // Send current parameters to worklet
        this.sendAllParamsToWorklet();
      }
    } catch (err) {
      console.error('Failed to initialize SonodsGateNode AudioWorklet:', err);
    }
  }

  private applyStateToMainEngine() {
    if (!this.dspExports || !this.mainEnginePtr) return;
    this.dspExports.set_threshold(this.mainEnginePtr, this.state.threshold);
    this.dspExports.set_range(this.mainEnginePtr, this.state.range);
    this.dspExports.set_ratio(this.mainEnginePtr, this.state.ratio);
    this.dspExports.set_knee(this.mainEnginePtr, this.state.knee);
    this.dspExports.set_attack(this.mainEnginePtr, this.state.attack);
    this.dspExports.set_hold(this.mainEnginePtr, this.state.hold);
    this.dspExports.set_release(this.mainEnginePtr, this.state.release);
    this.dspExports.set_lookahead(this.mainEnginePtr, this.state.lookahead);
    this.dspExports.set_style(this.mainEnginePtr, this.styleToId(this.state.style));
    this.dspExports.set_mode(this.mainEnginePtr, this.modeToId(this.state.mode));
    this.dspExports.set_detector_mode(this.mainEnginePtr, this.state.detectorMode === 'peak' ? 0 : 1);
    this.dspExports.set_sidechain_source(this.mainEnginePtr, this.state.sidechainSource === 'internal' ? 0 : 1);
    this.dspExports.set_sidechain_listen(this.mainEnginePtr, this.state.sidechainListen ? 1 : 0);
    this.dspExports.set_sidechain_hpf(this.mainEnginePtr, this.state.sidechainHpf);
    this.dspExports.set_sidechain_lpf(this.mainEnginePtr, this.state.sidechainLpf);
    this.dspExports.set_stereo_link(this.mainEnginePtr, this.state.stereoLink);
    this.dspExports.set_mix(this.mainEnginePtr, this.state.mix);
    this.dspExports.set_output_gain(this.mainEnginePtr, this.state.outputGain);
    this.dspExports.set_midi_force_open(this.mainEnginePtr, this.state.midiForceOpen ? 1 : 0);
  }

  private sendAllParamsToWorklet() {
    if (!this.workletNode) return;
    this.sendWorkletCommand('threshold', this.state.threshold);
    this.sendWorkletCommand('range', this.state.range);
    this.sendWorkletCommand('ratio', this.state.ratio);
    this.sendWorkletCommand('knee', this.state.knee);
    this.sendWorkletCommand('attack', this.state.attack);
    this.sendWorkletCommand('hold', this.state.hold);
    this.sendWorkletCommand('release', this.state.release);
    this.sendWorkletCommand('lookahead', this.state.lookahead);
    this.sendWorkletCommand('style', this.styleToId(this.state.style));
    this.sendWorkletCommand('mode', this.modeToId(this.state.mode));
    this.sendWorkletCommand('detectorMode', this.state.detectorMode === 'peak' ? 0 : 1);
    this.sendWorkletCommand('sidechainSource', this.state.sidechainSource === 'internal' ? 0 : 1);
    this.sendWorkletCommand('sidechainListen', this.state.sidechainListen ? 1 : 0);
    this.sendWorkletCommand('sidechainHpf', this.state.sidechainHpf);
    this.sendWorkletCommand('sidechainLpf', this.state.sidechainLpf);
    this.sendWorkletCommand('stereoLink', this.state.stereoLink);
    this.sendWorkletCommand('mix', this.state.mix);
    this.sendWorkletCommand('outputGain', this.state.outputGain);
    this.sendWorkletCommand('midiForceOpen', this.state.midiForceOpen ? 1 : 0);
  }

  private sendWorkletCommand(cmd: string, value: number) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'SET_PARAM', cmd, value });
    }
  }

  private styleToId(style: GateCharacterStyle): number {
    switch (style) {
      case 'classic': return 0;
      case 'clean': return 1;
      case 'vocal': return 2;
      case 'guitar': return 3;
    }
  }

  private modeToId(mode: GateProcessingMode): number {
    switch (mode) {
      case 'gate': return 0;
      case 'upward': return 1;
      case 'ducking': return 2;
    }
  }

  // Getters
  public getState(): GateState {
    return { ...this.state };
  }

  public getCurrentGainReductionDb(): number {
    return this.currentGrDb;
  }

  public getCurrentTelemetry(): GateTelemetryFrame {
    return { ...this.currentTelemetry };
  }

  // Subscriptions
  public subscribe(listener: (state: GateState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public subscribeGainReduction(listener: (grDb: number) => void): () => void {
    this.grListeners.add(listener);
    listener(this.currentGrDb);
    return () => this.grListeners.delete(listener);
  }

  public subscribeTelemetry(listener: (frame: GateTelemetryFrame) => void): () => void {
    this.telemetryListeners.add(listener);
    listener(this.currentTelemetry);
    return () => this.telemetryListeners.delete(listener);
  }

  private notifyStateListeners() {
    const s = this.getState();
    this.listeners.forEach((cb) => cb(s));
  }

  private notifyGrListeners(gr: number) {
    this.grListeners.forEach((cb) => cb(gr));
  }

  private notifyTelemetryListeners(frame: GateTelemetryFrame) {
    this.telemetryListeners.forEach((cb) => cb(frame));
  }

  // Setters
  public setThreshold(val: number) {
    this.state.threshold = Math.max(-60, Math.min(0, val));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_threshold(this.mainEnginePtr, this.state.threshold);
    this.sendWorkletCommand('threshold', this.state.threshold);
    this.notifyStateListeners();
  }

  public setRange(val: number) {
    this.state.range = Math.max(-60, Math.min(24, val));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_range(this.mainEnginePtr, this.state.range);
    this.sendWorkletCommand('range', this.state.range);
    this.notifyStateListeners();
  }

  public setRatio(val: number) {
    this.state.ratio = Math.max(1, Math.min(100, val));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_ratio(this.mainEnginePtr, this.state.ratio);
    this.sendWorkletCommand('ratio', this.state.ratio);
    this.notifyStateListeners();
  }

  public setKnee(val: number) {
    this.state.knee = Math.max(0, Math.min(24, val));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_knee(this.mainEnginePtr, this.state.knee);
    this.sendWorkletCommand('knee', this.state.knee);
    this.notifyStateListeners();
  }

  public setAttack(val: number) {
    this.state.attack = Math.max(0.0001, Math.min(0.5, val));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_attack(this.mainEnginePtr, this.state.attack);
    this.sendWorkletCommand('attack', this.state.attack);
    this.notifyStateListeners();
  }

  public setHold(val: number) {
    this.state.hold = Math.max(0, Math.min(2.0, val));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_hold(this.mainEnginePtr, this.state.hold);
    this.sendWorkletCommand('hold', this.state.hold);
    this.notifyStateListeners();
  }

  public setRelease(val: number) {
    this.state.release = Math.max(0.005, Math.min(5.0, val));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_release(this.mainEnginePtr, this.state.release);
    this.sendWorkletCommand('release', this.state.release);
    this.notifyStateListeners();
  }

  public setLookahead(val: number) {
    this.state.lookahead = Math.max(0, Math.min(0.010, val));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_lookahead(this.mainEnginePtr, this.state.lookahead);
    this.sendWorkletCommand('lookahead', this.state.lookahead);
    this.notifyStateListeners();
  }

  public setStyle(style: GateCharacterStyle) {
    this.state.style = style;
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_style(this.mainEnginePtr, this.styleToId(style));
    this.sendWorkletCommand('style', this.styleToId(style));
    this.notifyStateListeners();
  }

  public setMode(mode: GateProcessingMode) {
    this.state.mode = mode;
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_mode(this.mainEnginePtr, this.modeToId(mode));
    this.sendWorkletCommand('mode', this.modeToId(mode));
    this.notifyStateListeners();
  }

  public setDetectorMode(mode: GateDetectorType) {
    this.state.detectorMode = mode;
    const id = mode === 'peak' ? 0 : 1;
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_detector_mode(this.mainEnginePtr, id);
    this.sendWorkletCommand('detectorMode', id);
    this.notifyStateListeners();
  }

  public setSidechainSource(source: GateSidechainSource) {
    this.state.sidechainSource = source;
    const id = source === 'internal' ? 0 : 1;
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_sidechain_source(this.mainEnginePtr, id);
    this.sendWorkletCommand('sidechainSource', id);
    this.notifyStateListeners();
  }

  public setSidechainListen(listen: boolean) {
    this.state.sidechainListen = listen;
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_sidechain_listen(this.mainEnginePtr, listen ? 1 : 0);
    this.sendWorkletCommand('sidechainListen', listen ? 1 : 0);
    this.notifyStateListeners();
  }

  public setSidechainHpf(freq: number) {
    this.state.sidechainHpf = Math.max(10, Math.min(20000, freq));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_sidechain_hpf(this.mainEnginePtr, this.state.sidechainHpf);
    this.sendWorkletCommand('sidechainHpf', this.state.sidechainHpf);
    this.notifyStateListeners();
  }

  public setSidechainLpf(freq: number) {
    this.state.sidechainLpf = Math.max(10, Math.min(20000, freq));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_sidechain_lpf(this.mainEnginePtr, this.state.sidechainLpf);
    this.sendWorkletCommand('sidechainLpf', this.state.sidechainLpf);
    this.notifyStateListeners();
  }

  public setStereoLink(link: number) {
    this.state.stereoLink = Math.max(0, Math.min(1, link));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_stereo_link(this.mainEnginePtr, this.state.stereoLink);
    this.sendWorkletCommand('stereoLink', this.state.stereoLink);
    this.notifyStateListeners();
  }

  public setRoutingMode(mode: GateRoutingMode) {
    this.state.routingMode = mode;
    this.notifyStateListeners();
  }

  public setMix(mix: number) {
    this.state.mix = Math.max(0, Math.min(1, mix));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_mix(this.mainEnginePtr, this.state.mix);
    this.sendWorkletCommand('mix', this.state.mix);
    this.notifyStateListeners();
  }

  public setOutputGain(gainDb: number) {
    this.state.outputGain = Math.max(-24, Math.min(24, gainDb));
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_output_gain(this.mainEnginePtr, this.state.outputGain);
    this.sendWorkletCommand('outputGain', this.state.outputGain);
    this.notifyStateListeners();
  }

  public setMidiForceOpen(force: boolean) {
    this.state.midiForceOpen = force;
    if (this.dspExports && this.mainEnginePtr) this.dspExports.set_midi_force_open(this.mainEnginePtr, force ? 1 : 0);
    this.sendWorkletCommand('midiForceOpen', force ? 1 : 0);
    this.notifyStateListeners();
  }

  // Web MIDI Trigger
  public async enableMidiTrigger(midiAccess?: any, channel: number | null = null, note: number | null = null) {
    this.midiChannel = channel;
    this.midiTargetNote = note;

    try {
      if (!midiAccess && typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
        this.midiAccess = await (navigator as any).requestMIDIAccess();
      } else {
        this.midiAccess = midiAccess;
      }

      if (this.midiAccess) {
        for (const input of this.midiAccess.inputs.values()) {
          input.onmidimessage = (msg: { data: Uint8Array }) => {
            const [status, data1, data2] = msg.data;
            const command = status >> 4;
            const ch = status & 0xf;

            if (this.midiChannel !== null && ch !== this.midiChannel) return;
            if (this.midiTargetNote !== null && data1 !== this.midiTargetNote) return;

            if (command === 9 && data2 > 0) {
              // Note On -> Force gate open
              this.setMidiForceOpen(true);
            } else if (command === 8 || (command === 9 && data2 === 0)) {
              // Note Off -> Release force open
              this.setMidiForceOpen(false);
            }
          };
        }
      }
    } catch (err) {
      console.warn('Web MIDI not available or permission denied:', err);
    }
  }

  public dispose() {
    this.listeners.clear();
    this.grListeners.clear();
    this.telemetryListeners.clear();

    if (this.dspExports && this.mainEnginePtr) {
      this.dspExports.destroy_gate(this.mainEnginePtr);
      this.mainEnginePtr = 0;
    }

    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }
  }
}
