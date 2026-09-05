import { PROCESSOR_CODE } from './processor.js';

export interface ImagerTelemetry {
  overallCorrelation: number;
  bandCorrelations: number[];
  bandWidths: number[];
  samples: number[];
}

const BaseNode: typeof AudioWorkletNode =
  typeof AudioWorkletNode !== 'undefined'
    ? AudioWorkletNode
    : (class {
        constructor(_context: any, _name: any, _options?: any) {}
      } as unknown as typeof AudioWorkletNode);

export class SonodsImagerNode extends BaseNode {
  private telemetryCallbacks: Set<(telemetry: ImagerTelemetry) => void> = new Set();
  public port: MessagePort = (this as any).port || { postMessage: () => {} };

  public static async create(context: AudioContext, wasmBytes?: ArrayBuffer): Promise<SonodsImagerNode> {
    const blob = new Blob([PROCESSOR_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const node = new SonodsImagerNode(context);
    if (wasmBytes) {
      node.port.postMessage({ type: 'INIT_WASM', wasmBytes });
    }
    return node;
  }

  constructor(context: AudioContext) {
    super(context, 'sonods-imager-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    if (this.port) {
      this.port.onmessage = (event) => {
        const data = event.data;
        if (data.type === 'TELEMETRY') {
          const telemetry: ImagerTelemetry = data.telemetry;
          for (const cb of this.telemetryCallbacks) {
            cb(telemetry);
          }
        }
      };
    }
  }

  public setNumBands(numBands: number): void {
    this.port.postMessage({ type: 'PARAM', name: 'numBands', value: numBands });
  }

  public setCrossovers(f1: number, f2: number, f3: number): void {
    this.port.postMessage({ type: 'PARAM', name: 'crossovers', value: [f1, f2, f3] });
  }

  public setBandWidth(band: number, width: number): void {
    this.port.postMessage({ type: 'PARAM', name: 'bandWidth', band, value: width });
  }

  public setStereoize(mode: 'off' | 'mode_i' | 'mode_ii', amount: number): void {
    const modeInt = mode === 'mode_i' ? 1 : mode === 'mode_ii' ? 2 : 0;
    this.port.postMessage({ type: 'PARAM', name: 'stereoize', mode: modeInt, amount });
  }

  public setAsymmetry(asymmetry: number): void {
    this.port.postMessage({ type: 'PARAM', name: 'asymmetry', value: asymmetry });
  }

  public setRecoverSides(amount: number): void {
    this.port.postMessage({ type: 'PARAM', name: 'recoverSides', value: amount });
  }

  public setBypass(bypassed: boolean): void {
    this.port.postMessage({ type: 'PARAM', name: 'bypass', value: bypassed });
  }

  public setSoloMid(soloMid: boolean): void {
    this.port.postMessage({ type: 'PARAM', name: 'soloMid', value: soloMid });
  }

  public setSoloSide(soloSide: boolean): void {
    this.port.postMessage({ type: 'PARAM', name: 'soloSide', value: soloSide });
  }

  public onTelemetry(callback: (telemetry: ImagerTelemetry) => void): () => void {
    this.telemetryCallbacks.add(callback);
    return () => {
      this.telemetryCallbacks.delete(callback);
    };
  }
}
