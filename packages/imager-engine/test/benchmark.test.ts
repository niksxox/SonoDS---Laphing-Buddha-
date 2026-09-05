import { describe, it, expect } from 'vitest';
import { TelemetryStream } from '../src/telemetry';

describe('Engine Telemetry Benchmark (Task 5.3)', () => {
  it('benchmarks telemetry stream processing latency for 1000 telemetry updates', () => {
    const stream = new TelemetryStream();
    const mockTelemetry = {
      overallCorrelation: 0.82,
      bandCorrelations: [0.95, 0.88, 0.72, 0.65],
      bandWidths: [0.0, 1.0, 1.2, 1.4],
      samples: [0.5, 0.5, -0.3, 0.3, 0.8, -0.8]
    };

    let updateCount = 0;
    stream.subscribe(() => {
      updateCount++;
    });

    const start = performance.now();
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      stream.push(mockTelemetry);
    }
    const durationMs = performance.now() - start;
    const avgLatencyMicros = (durationMs / iterations) * 1000;

    console.log(`\n--- JS Engine Telemetry Benchmark ---`);
    console.log(`Processed ${iterations} telemetry packets in ${durationMs.toFixed(2)} ms`);
    console.log(`Average telemetry latency: ${avgLatencyMicros.toFixed(3)} µs per packet`);
    console.log(`-------------------------------------\n`);

    expect(updateCount).toBe(iterations);
    // Telemetry latency must be under 50 µs per packet (less than 0.1ms)
    expect(avgLatencyMicros).toBeLessThan(50);
  });
});
