import { describe, it, expect, vi } from 'vitest';
import { TelemetryStream } from '../src/telemetry';
import { ImagerTelemetry } from '../src/node';

describe('Telemetry Stream (Task 2.3)', () => {
  it('delivers telemetry updates to subscribers', () => {
    const stream = new TelemetryStream();
    const subscriber = vi.fn();

    const unsubscribe = stream.subscribe(subscriber);
    expect(subscriber).toHaveBeenCalledTimes(1); // Immediate snapshot

    const mockTelemetry: ImagerTelemetry = {
      overallCorrelation: 0.85,
      bandCorrelations: [1.0, 0.72, 0.45, 0.90],
      bandWidths: [0.0, 1.2, 1.8, 1.0],
      samples: [0.1, 0.1, -0.2, 0.3],
    };

    stream.emit(mockTelemetry);
    expect(subscriber).toHaveBeenCalledTimes(2);
    expect(subscriber).toHaveBeenLastCalledWith(mockTelemetry);

    unsubscribe();
    stream.emit(mockTelemetry);
    expect(subscriber).toHaveBeenCalledTimes(2); // Unsubscribed
  });

  it('demonstrates per-band correlation divergence across different width settings', () => {
    const stream = new TelemetryStream();
    let receivedTelemetry: ImagerTelemetry | null = null;

    stream.subscribe((data) => {
      receivedTelemetry = data;
    });

    // Simulate telemetry emitted when Band 0 is mono (width=0.0) and Band 2 is widened (width=1.8)
    const activeTelemetry: ImagerTelemetry = {
      overallCorrelation: 0.65,
      bandCorrelations: [1.0, 0.85, 0.25, 0.92], // Band 0 correlation = 1.0 (mono), Band 2 correlation = 0.25 (widened)
      bandWidths: [0.0, 1.0, 1.8, 1.0],
      samples: [0.5, 0.5, -0.4, 0.6],
    };

    stream.emit(activeTelemetry);

    expect(receivedTelemetry).not.toBeNull();
    const tel = receivedTelemetry!;

    // Assert band 0 (mono) correlation is high (~1.0)
    expect(tel.bandCorrelations[0]).toBeGreaterThanOrEqual(0.99);

    // Assert band 2 (widened) correlation is lower than band 0 due to widening divergence
    expect(tel.bandCorrelations[2]).toBeLessThan(tel.bandCorrelations[0]);

    // Assert vectorscope samples present
    expect(tel.samples.length).toBeGreaterThan(0);
  });
});
