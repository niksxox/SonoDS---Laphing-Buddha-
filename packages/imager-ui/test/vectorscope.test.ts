// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/VectorscopeElement';
import { SonodsVectorscopeElement } from '../src/components/VectorscopeElement';

describe('Vectorscope 45° Lissajous Component (Task 3.2)', () => {
  let scope: SonodsVectorscopeElement;

  beforeEach(() => {
    scope = document.createElement('sonods-vectorscope') as SonodsVectorscopeElement;
    document.body.appendChild(scope);
  });

  it('renders a vertical line for pure in-phase mono input (L == R)', () => {
    // Generate mono samples: L = R = sin(t)
    const monoSamples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const val = Math.sin(i * 0.1);
      monoSamples.push(val, val); // L, R
    }

    scope.updateSamples(monoSamples);
    const points = scope.getRenderedSamplePoints();
    expect(points.length).toBe(100);

    const centerX = 280 / 2;
    for (const pt of points) {
      // For mono signal (L == R), X position must strictly equal centerX (vertical line)
      expect(Math.abs(pt.x - centerX)).toBeLessThan(1e-4);
    }
  });

  it('renders a horizontal line for pure out-of-phase input (L == -R)', () => {
    // Generate out-of-phase samples: L = sin(t), R = -sin(t)
    const phaseSamples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const val = Math.sin(i * 0.1);
      phaseSamples.push(val, -val); // L, R
    }

    scope.updateSamples(phaseSamples);
    const points = scope.getRenderedSamplePoints();
    expect(points.length).toBe(100);

    const centerY = 280 / 2;
    for (const pt of points) {
      // For out-of-phase signal (L == -R), Y position must strictly equal centerY (horizontal line)
      expect(Math.abs(pt.y - centerY)).toBeLessThan(1e-4);
    }
  });

  it('renders a 2D spatial cloud for decorrelated stereo noise input', () => {
    const noiseSamples: number[] = [];
    let seedL = 12345;
    let seedR = 67890;

    for (let i = 0; i < 100; i++) {
      seedL = (seedL * 9301 + 49297) % 233280;
      seedR = (seedR * 9301 + 49297) % 233280;
      const l = (seedL / 233280) * 2 - 1;
      const r = (seedR / 233280) * 2 - 1;
      noiseSamples.push(l, r);
    }

    scope.updateSamples(noiseSamples);
    const points = scope.getRenderedSamplePoints();
    expect(points.length).toBe(100);

    const centerX = 280 / 2;
    const centerY = 280 / 2;

    const xDeviations = points.map((p) => Math.abs(p.x - centerX));
    const yDeviations = points.map((p) => Math.abs(p.y - centerY));

    // Both X and Y must show significant spatial spread > 5px
    expect(Math.max(...xDeviations)).toBeGreaterThan(5);
    expect(Math.max(...yDeviations)).toBeGreaterThan(5);
  });
});
