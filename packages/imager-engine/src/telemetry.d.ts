import type { ImagerTelemetry } from './node.js';
export declare class TelemetryStream {
    private subscribers;
    private lastTelemetry;
    subscribe(callback: (telemetry: ImagerTelemetry) => void): () => void;
    emit(telemetry: ImagerTelemetry): void;
    getSnapshot(): ImagerTelemetry;
}
//# sourceMappingURL=telemetry.d.ts.map