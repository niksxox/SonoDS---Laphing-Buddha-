import { describe, it, expect } from 'vitest';
import * as SatUI from '../src/index.js';

describe('SatUI Component Library', () => {
  it('exports all major plugin and visualizer components', () => {
    expect(SatUI.SonodsSaturatorPlugin).toBeDefined();
    expect(SatUI.SaturatorCharacterFace).toBeDefined();
    expect(SatUI.RainbowKnob).toBeDefined();
    expect(SatUI.TransferCurveCanvas).toBeDefined();
    expect(SatUI.HarmonicVisualizer).toBeDefined();
  });
});
