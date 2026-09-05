// SonoDS Reverb - Main Thread Engine Host API
// Task 2.4: Host controller connecting Web Audio API graph and AudioWorklet node.

export interface ReverbPreset {
  name: string;
  category: string;
  space: number;
  rt60: number;
  brightness: number;
  character: number;
  distance: number;
  thickness: number;
  stereoWidth: number;
  predelayMs: number;
  predelaySync: boolean;
  predelayDivision: number;
  decayRateBands: Array<{
    enabled: boolean;
    freqHz: number;
    decayPercent: number;
    q: number;
  }>;
  postEqBands: Array<{
    enabled: boolean;
    filterType: number; // 0: LowShelf, 1: Bell, 2: HighShelf, 3: Notch
    freqHz: number;
    gainDb: number;
    q: number;
  }>;
  duckingAmount: number;
  autoGateEnabled: boolean;
  autoGateThresholdDb: number;
  freeze: boolean;
  mixPercent: number;
}

export class ReverbEngine {
  public readonly context: AudioContext;
  public readonly inputNode: GainNode;
  public readonly outputNode: GainNode;
  private workletNode: AudioWorkletNode | null = null;
  private isReady = false;
  private mixLocked = false;
  private currentParams: Partial<ReverbPreset> = {};

  private constructor(context: AudioContext) {
    this.context = context;
    this.inputNode = context.createGain();
    this.outputNode = context.createGain();
  }

  public static async create(
    context: AudioContext,
    workletUrl: string,
    wasmBytes: ArrayBuffer
  ): Promise<ReverbEngine> {
    const engine = new ReverbEngine(context);

    // Register AudioWorklet module
    await context.audioWorklet.addModule(workletUrl);

    // Create AudioWorkletNode
    engine.workletNode = new AudioWorkletNode(context, 'sono-ds-reverb-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Wire Web Audio nodes
    engine.inputNode.connect(engine.workletNode);
    engine.workletNode.connect(engine.outputNode);

    // Wait for ready message from worklet
    await new Promise<void>((resolve, reject) => {
      if (!engine.workletNode) return reject(new Error('Worklet node creation failed'));

      const timeout = setTimeout(() => {
        reject(new Error('Worklet initialization timed out'));
      }, 5000);

      engine.workletNode.port.onmessage = (event) => {
        const msg = event.data;
        if (msg?.type === 'ready') {
          clearTimeout(timeout);
          engine.isReady = true;
          resolve();
        } else if (msg?.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(msg.error || 'Worklet error'));
        }
      };

      // Send WASM binary to worklet for compilation
      engine.workletNode.port.postMessage(
        {
          type: 'init',
          wasmBytes,
          sampleRate: context.sampleRate,
        },
        [wasmBytes]
      );
    });

    return engine;
  }

  private postParam(param: string, value: any, args?: any[]) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'param',
      param,
      value,
      args,
    });
  }

  public setSpace(space: number) {
    const val = Math.max(0, Math.min(1, space));
    this.currentParams.space = val;
    this.postParam('space', val);
  }

  public setRt60(seconds: number) {
    const val = Math.max(0.1, Math.min(20, seconds));
    this.currentParams.rt60 = val;
    this.postParam('rt60', val);
  }

  public setBrightness(brightness: number) {
    const val = Math.max(-1, Math.min(1, brightness));
    this.currentParams.brightness = val;
    this.postParam('brightness', val);
  }

  public setCharacter(character: number) {
    const val = Math.max(0, Math.min(1, character));
    this.currentParams.character = val;
    this.postParam('character', val);
  }

  public setDistance(distance: number) {
    const val = Math.max(0, Math.min(1, distance));
    this.currentParams.distance = val;
    this.postParam('distance', val);
  }

  public setThickness(thickness: number) {
    const val = Math.max(0, Math.min(1, thickness));
    this.currentParams.thickness = val;
    this.postParam('thickness', val);
  }

  public setStereoWidth(width: number) {
    const val = Math.max(0, Math.min(2, width));
    this.currentParams.stereoWidth = val;
    this.postParam('stereoWidth', val);
  }

  public setPredelayMs(ms: number) {
    const val = Math.max(0, Math.min(500, ms));
    this.currentParams.predelayMs = val;
    this.postParam('predelayMs', val);
  }

  public setPredelaySync(enabled: boolean) {
    this.currentParams.predelaySync = enabled;
    this.postParam('predelaySync', enabled);
  }

  public setPredelayBpm(bpm: number) {
    this.postParam('predelayBpm', Math.max(20, Math.min(300, bpm)));
  }

  public setPredelayDivision(division: number) {
    this.currentParams.predelayDivision = division;
    this.postParam('predelayDivision', division);
  }

  public setDecayRateBand(
    bandIdx: number,
    enabled: boolean,
    freqHz: number,
    decayPercent: number,
    q = 1.0
  ) {
    this.postParam('decayRateBand', null, [bandIdx, enabled, freqHz, decayPercent, q]);
  }

  public setPostEqBand(
    bandIdx: number,
    enabled: boolean,
    filterType: number,
    freqHz: number,
    gainDb: number,
    q = 1.0
  ) {
    this.postParam('postEqBand', null, [bandIdx, enabled, filterType, freqHz, gainDb, q]);
  }

  public setDuckingAmount(amount: number) {
    const val = Math.max(0, Math.min(1, amount));
    this.currentParams.duckingAmount = val;
    this.postParam('duckingAmount', val);
  }

  public setAutoGate(enabled: boolean, thresholdDb = -40) {
    this.currentParams.autoGateEnabled = enabled;
    this.currentParams.autoGateThresholdDb = thresholdDb;
    this.postParam('autoGate', enabled, [thresholdDb]);
  }

  public setFreeze(freeze: boolean) {
    this.currentParams.freeze = freeze;
    this.postParam('freeze', freeze);
  }

  public setMix(percent: number) {
    const val = Math.max(0, Math.min(100, percent));
    this.currentParams.mixPercent = val;
    this.postParam('forceMix', val);
  }

  public setMixLocked(locked: boolean) {
    this.mixLocked = locked;
    this.postParam('mixLocked', locked);
  }

  public isMixLocked(): boolean {
    return this.mixLocked;
  }

  public setBypass(bypass: boolean) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'bypass', value: bypass });
  }

  public loadPreset(preset: ReverbPreset) {
    const savedMix = this.currentParams.mixPercent;

    this.setSpace(preset.space);
    this.setRt60(preset.rt60);
    this.setBrightness(preset.brightness);
    this.setCharacter(preset.character);
    this.setDistance(preset.distance);
    this.setThickness(preset.thickness);
    this.setStereoWidth(preset.stereoWidth);
    this.setPredelayMs(preset.predelayMs);
    this.setPredelaySync(preset.predelaySync);
    this.setPredelayDivision(preset.predelayDivision);

    preset.decayRateBands.forEach((b, i) => {
      this.setDecayRateBand(i, b.enabled, b.freqHz, b.decayPercent, b.q);
    });

    preset.postEqBands.forEach((b, i) => {
      this.setPostEqBand(i, b.enabled, b.filterType, b.freqHz, b.gainDb, b.q);
    });

    this.setDuckingAmount(preset.duckingAmount);
    this.setAutoGate(preset.autoGateEnabled, preset.autoGateThresholdDb);
    this.setFreeze(preset.freeze);

    if (!this.mixLocked) {
      this.setMix(preset.mixPercent);
    } else if (savedMix !== undefined) {
      this.setMix(savedMix);
    }
  }

  public getParams(): Partial<ReverbPreset> {
    return { ...this.currentParams };
  }

  public dispose() {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.inputNode.disconnect();
    this.outputNode.disconnect();
  }
}
