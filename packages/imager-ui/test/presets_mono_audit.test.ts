// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/SonodsImagerElement';
import { SonodsImagerElement } from '../src/components/SonodsImagerElement';
import { FACTORY_PRESETS } from '../src/presets';

describe('Factory Presets & Mono-Compatibility Audit (Task 5.4)', () => {
  let imagerUI: SonodsImagerElement;

  beforeEach(() => {
    imagerUI = document.createElement('sonods-imager') as SonodsImagerElement;
    document.body.appendChild(imagerUI);
  });

  it('contains valid factory presets with mono-safe low-end defaults', () => {
    expect(FACTORY_PRESETS.length).toBeGreaterThanOrEqual(4);

    for (const preset of FACTORY_PRESETS) {
      expect(preset.id).toBeDefined();
      expect(preset.name).toBeDefined();
      expect(preset.state).toBeDefined();

      // Mono-safety rule: Band 0 (bass) width must default to 0.0 in mono-safe presets
      if (preset.category === 'Mono Safety' || preset.id === 'default-mono-bass' || preset.id === 'bass-shuffler-mono') {
        expect(preset.state.bandWidths?.[0]).toBe(0.0);
      }
    }
  });

  it('applies every factory preset to UI state without errors', () => {
    for (const preset of FACTORY_PRESETS) {
      expect(() => {
        imagerUI.setState(preset.state);
      }).not.toThrow();

      const currentState = imagerUI.getState();
      if (preset.state.bandWidths) {
        expect(currentState.bandWidths).toEqual(preset.state.bandWidths);
      }
    }
  });

  it('passes a 500-iteration parameter fuzz/stress test without NaN or crashes', () => {
    const getRandom = (min: number, max: number) => min + Math.random() * (max - min);

    for (let i = 0; i < 500; i++) {
      const randomState = {
        bypassed: Math.random() > 0.5,
        numBands: 4,
        crossovers: [
          getRandom(20, 200),
          getRandom(300, 2000),
          getRandom(2500, 10000)
        ] as [number, number, number],
        bandWidths: [
          getRandom(0.0, 2.0),
          getRandom(0.0, 2.0),
          getRandom(0.0, 2.0),
          getRandom(0.0, 2.0)
        ],
        stereoizeAmount: getRandom(0.0, 1.0),
        recoverSidesAmount: getRandom(0.0, 1.0),
        asymmetry: getRandom(-1.0, 1.0),
        soloMid: Math.random() > 0.8,
        soloSide: Math.random() > 0.8
      };

      expect(() => {
        imagerUI.setState(randomState);
        const state = imagerUI.getState();
        expect(state.bandWidths.some(isNaN)).toBe(false);
        expect(state.crossovers.some(isNaN)).toBe(false);
        expect(isNaN(state.stereoizeAmount)).toBe(false);
      }).not.toThrow();
    }
  });
});
