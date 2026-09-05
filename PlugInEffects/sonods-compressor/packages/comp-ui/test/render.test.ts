import { describe, it, expect } from 'vitest';
import { GainReductionMeterState, pressCompressionAmount } from '../src/render/GainReductionMeterState.js';

describe('Phase 3 Visualization Engine & Ballistics Tests', () => {
  it('pressCompressionAmount maps 0-12dB with high visual sensitivity and bounds within [0,1]', () => {
    expect(pressCompressionAmount(0.0)).toBe(0.0);
    expect(pressCompressionAmount(-5.0)).toBe(0.0);

    const squish6Db = pressCompressionAmount(6.0);
    const squish12Db = pressCompressionAmount(12.0);
    const squish24Db = pressCompressionAmount(24.0);

    expect(squish6Db).toBeGreaterThan(0.4); // Over 40% travel by 6dB
    expect(squish12Db).toBeGreaterThan(0.7); // Over 70% travel by 12dB
    expect(squish24Db).toBeLessThanOrEqual(1.0);

    // Monotonically increasing
    expect(squish12Db).toBeGreaterThan(squish6Db);
    expect(squish24Db).toBeGreaterThan(squish12Db);
  });

  it('GainReductionMeterState exhibits fast attack and smooth held decay', () => {
    const meter = new GainReductionMeterState();

    // Step input from 0 to 10 dB
    let res = meter.update(10.0, 1000.0);
    // After 15ms time constant, it should grab downward quickly
    res = meter.update(10.0, 1050.0);
    expect(res.currentGr).toBeGreaterThan(8.0);
    expect(res.peakGr).toBeGreaterThanOrEqual(res.currentGr);

    // Now input drops back to 0 dB
    const peakBefore = res.peakGr;
    res = meter.update(0.0, 1200.0); // 150ms later (within 800ms peak hold)
    expect(res.currentGr).toBeLessThan(8.0);
    expect(res.peakGr).toBe(peakBefore); // Peak hold maintained

    // After 1000ms, peak hold expires and decays
    res = meter.update(0.0, 2200.0);
    expect(res.peakGr).toBeLessThan(peakBefore);
  });
});
