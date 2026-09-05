import type { ImagerTelemetry } from './node.js';

export class TelemetryStream {
  private subscribers: Set<(telemetry: ImagerTelemetry) => void> = new Set();
  private lastTelemetry: ImagerTelemetry = {
    overallCorrelation: 1.0,
    bandCorrelations: [1.0, 1.0, 1.0, 1.0],
    bandWidths: [0.0, 1.0, 1.0, 1.0],
    samples: [],
  };

  public subscribe(callback: (telemetry: ImagerTelemetry) => void): () => void {
    this.subscribers.add(callback);
    // Send immediate snapshot upon subscription
    callback(this.lastTelemetry);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  public emit(telemetry: ImagerTelemetry): void {
    this.lastTelemetry = telemetry;
    for (const subscriber of this.subscribers) {
      subscriber(telemetry);
    }
  }

  public getSnapshot(): ImagerTelemetry {
    return { ...this.lastTelemetry };
  }
}
