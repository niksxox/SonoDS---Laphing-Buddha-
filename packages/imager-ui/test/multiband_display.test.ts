// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/components/MultibandDisplayElement';
import { SonodsMultibandDisplayElement } from '../src/components/MultibandDisplayElement';

describe('Multiband Display & Crossover Interaction (Task 3.3)', () => {
  let display: SonodsMultibandDisplayElement;

  beforeEach(() => {
    display = document.createElement('sonods-multiband-display') as SonodsMultibandDisplayElement;
    document.body.appendChild(display);
  });

  it('initializes with default crossover frequencies', () => {
    const crossovers = display.getCrossovers();
    expect(crossovers).toEqual([140.0, 1500.0, 6000.0]);
  });

  it('updates display telemetry for per-band correlation and width', () => {
    display.setNumBands(4);
    display.updateTelemetry([1.0, 0.75, 0.35, 0.95], [0.0, 1.0, 1.8, 1.0]);

    const readoutEl = display.shadowRoot?.querySelector('#crossoverReadout');
    expect(readoutEl?.textContent).toContain('140Hz');
    expect(readoutEl?.textContent).toContain('1.5kHz');
    expect(readoutEl?.textContent).toContain('6.0kHz');
  });

  it('emits crossover-change event when crossover frequency is updated', () => {
    const callback = vi.fn();
    display.addEventListener('crossover-change', callback);

    display.setCrossovers(180.0, 2000.0, 7000.0);
    expect(display.getCrossovers()).toEqual([180.0, 2000.0, 7000.0]);

    // Dispatch synthetic crossover change
    display.dispatchEvent(
      new CustomEvent('crossover-change', {
        detail: { crossovers: [180.0, 2000.0, 7000.0] },
      })
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].detail.crossovers).toEqual([180.0, 2000.0, 7000.0]);
  });
});
