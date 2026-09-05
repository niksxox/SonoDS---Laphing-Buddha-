import { describe, it, expect } from 'vitest';
import {
  formatFrequency,
  formatGain,
  frequencyToX,
  gainToY,
  xToFrequency,
  yToGain,
} from '../src/coords.js';

describe('Coordinate Conversion and Formatting', () => {
  it('converts log frequency to x and back invertibly', () => {
    const width = 800;
    const testFreqs = [20, 100, 450, 1000, 5000, 20000];

    for (const freq of testFreqs) {
      const x = frequencyToX(freq, width);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);

      const recoveredFreq = xToFrequency(x, width);
      expect(Math.abs(recoveredFreq - freq) / freq).toBeLessThan(1e-4);
    }
  });

  it('converts gain in dB to y and back invertibly', () => {
    const height = 400;
    const testGains = [-30, -12, 0, 6, 24, 30];

    for (const gain of testGains) {
      const y = gainToY(gain, height);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);

      const recoveredGain = yToGain(y, height);
      expect(Math.abs(recoveredGain - gain)).toBeLessThan(1e-4);
    }
  });

  it('formats frequencies and gains correctly', () => {
    expect(formatFrequency(450)).toBe('450');
    expect(formatFrequency(1200)).toBe('1.20k');
    expect(formatFrequency(15400)).toBe('15.4k');

    expect(formatGain(6.5)).toBe('+6.5 dB');
    expect(formatGain(-3.0)).toBe('-3.0 dB');
  });
});
