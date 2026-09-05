export interface ImagerTelemetry {
    overallCorrelation: number;
    bandCorrelations: number[];
    bandWidths: number[];
    samples: number[];
}
declare const BaseNode: typeof AudioWorkletNode;
export declare class SonodsImagerNode extends BaseNode {
    private telemetryCallbacks;
    port: MessagePort;
    static create(context: AudioContext, wasmBytes?: ArrayBuffer): Promise<SonodsImagerNode>;
    constructor(context: AudioContext);
    setNumBands(numBands: number): void;
    setCrossovers(f1: number, f2: number, f3: number): void;
    setBandWidth(band: number, width: number): void;
    setStereoize(mode: 'off' | 'mode_i' | 'mode_ii', amount: number): void;
    setAsymmetry(asymmetry: number): void;
    setRecoverSides(amount: number): void;
    onTelemetry(callback: (telemetry: ImagerTelemetry) => void): () => void;
}
export {};
//# sourceMappingURL=node.d.ts.map