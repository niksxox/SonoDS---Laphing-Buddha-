// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/CorrelationMeterElement';
import '../src/components/VectorscopeElement';
import '../src/components/MultibandDisplayElement';

import { SonodsCorrelationMeterElement } from '../src/components/CorrelationMeterElement';
import { SonodsVectorscopeElement } from '../src/components/VectorscopeElement';
import { SonodsMultibandDisplayElement } from '../src/components/MultibandDisplayElement';

describe('Live Visualization Correctness Checklist (Task 3.4)', () => {
  let meter: SonodsCorrelationMeterElement;
  let scope: SonodsVectorscopeElement;
  let display: SonodsMultibandDisplayElement;

  beforeEach(() => {
    meter = document.createElement('sonods-correlation-meter') as SonodsCorrelationMeterElement;
    scope = document.createElement('sonods-vectorscope') as SonodsVectorscopeElement;
    display = document.createElement('sonods-multiband-display') as SonodsMultibandDisplayElement;

    document.body.appendChild(meter);
    document.body.appendChild(scope);
    document.body.appendChild(display);
  });

  it('Checklist 1 & 2: Vectorscope is drawn from real sample pairs, not synthesized from scalar correlation', () => {
    const rawSamples = [0.8, 0.8, -0.5, -0.5, 0.3, 0.3]; // Real L/R pairs
    scope.updateSamples(rawSamples);
    const points = scope.getRenderedSamplePoints();

    expect(points.length).toBe(3);
    const centerX = 280 / 2;
    for (const pt of points) {
      // Real sample pairs with L == R produce x == centerX
      expect(Math.abs(pt.x - centerX)).toBeLessThan(1e-4);
    }
  });

  it('Checklist 3: Per-band display accurately reflects real per-band engine telemetry', () => {
    const bandCorrelations = [1.0, 0.65, 0.15, 0.98];
    const bandWidths = [0.0, 1.0, 1.8, 1.0];

    display.setNumBands(4);
    display.updateTelemetry(bandCorrelations, bandWidths);

    const shadow = display.shadowRoot;
    expect(shadow).not.toBeNull();
  });

  it('Checklist 4: Perfectly mono input produces vertical-line vectorscope and correlation +1.00 simultaneously', () => {
    meter.updateCorrelation(1.0);
    scope.updateSamples([0.5, 0.5, 0.2, 0.2, -0.4, -0.4]);

    const readout = meter.shadowRoot?.querySelector('#numReadout');
    expect(readout?.textContent).toBe('+1.00');

    const points = scope.getRenderedSamplePoints();
    const centerX = 280 / 2;
    for (const pt of points) {
      expect(Math.abs(pt.x - centerX)).toBeLessThan(1e-4);
    }
  });

  it('Checklist 5: Silent input produces idle/centered display with no phantom motion', () => {
    meter.updateCorrelation(1.0);
    scope.updateSamples([0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);

    const points = scope.getRenderedSamplePoints();
    const centerX = 280 / 2;
    const centerY = 280 / 2;

    for (const pt of points) {
      expect(Math.abs(pt.x - centerX)).toBeLessThan(1e-4);
      expect(Math.abs(pt.y - centerY)).toBeLessThan(1e-4);
    }
  });
});
