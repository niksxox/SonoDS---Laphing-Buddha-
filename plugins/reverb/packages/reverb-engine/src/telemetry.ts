// SonoDS Reverb - Telemetry & Metering Stream
// Task 3.2: Real-time RMS/Peak levels stream for UI meter displays.

export interface TelemetryData {
  inputPeakL: number;
  inputPeakR: number;
  outputPeakL: number;
  outputPeakR: number;
  inputRmsL: number;
  inputRmsR: number;
  outputRmsL: number;
  outputRmsR: number;
}

export type TelemetryListener = (data: TelemetryData) => void;

export class TelemetryStream {
  private listeners: Set<TelemetryListener> = new Set();
  private currentData: TelemetryData = {
    inputPeakL: -80,
    inputPeakR: -80,
    outputPeakL: -80,
    outputPeakR: -80,
    inputRmsL: -80,
    inputRmsR: -80,
    outputRmsL: -80,
    outputRmsR: -80,
  };

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    // Send immediate snapshot
    listener(this.currentData);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public update(data: Partial<TelemetryData>) {
    this.currentData = { ...this.currentData, ...data };
    this.listeners.forEach((fn) => fn(this.currentData));
  }

  public getData(): TelemetryData {
    return { ...this.currentData };
  }
}
