// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/components/SonodsImagerElement';
import '../src/components/CorrelationMeterElement';
import '../src/components/VectorscopeElement';
import '../src/components/MultibandDisplayElement';
import { SonodsImagerElement } from '../src/components/SonodsImagerElement';
import { SonodsCorrelationMeterElement } from '../src/components/CorrelationMeterElement';
import { SonodsVectorscopeElement } from '../src/components/VectorscopeElement';
import { SonodsMultibandDisplayElement } from '../src/components/MultibandDisplayElement';

describe('Usability Smoke Test Suite (Task 4.6)', () => {
  let imagerUI: SonodsImagerElement;

  beforeEach(() => {
    imagerUI = document.createElement('sonods-imager') as SonodsImagerElement;
    document.body.appendChild(imagerUI);
  });

  it('mounts all top deck and mid deck visual components inside shadow root', () => {
    const scope = imagerUI.shadowRoot?.querySelector('#vectorscope') as SonodsVectorscopeElement;
    const meter = imagerUI.shadowRoot?.querySelector('#correlationMeter') as SonodsCorrelationMeterElement;
    const display = imagerUI.shadowRoot?.querySelector('#multibandDisplay') as SonodsMultibandDisplayElement;

    expect(scope).not.toBeNull();
    expect(meter).not.toBeNull();
    expect(display).not.toBeNull();
  });

  it('processes pointer drag gestures on MultibandDisplay crossover handles', () => {
    const display = imagerUI.shadowRoot?.querySelector('#multibandDisplay') as SonodsMultibandDisplayElement;
    const canvas = display.shadowRoot?.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas).not.toBeNull();

    // Mock getBoundingClientRect so clientX maps to canvas coordinates (600px width)
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 600,
      height: 160,
      right: 600,
      bottom: 160,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    const crossoverListener = vi.fn();
    display.addEventListener('crossover-change', crossoverListener);

    // Initial crossover 0 is ~140Hz which maps to freqToX(140, 600) ~ 169px
    const handle0X = 169;

    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: handle0X, clientY: 50, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: handle0X + 50, clientY: 50, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: handle0X + 50, clientY: 50, pointerId: 1 }));

    // Expect crossovers to be updated and event emitted
    expect(crossoverListener).toHaveBeenCalled();
    const updatedCrossovers = display.getCrossovers();
    expect(updatedCrossovers[0]).toBeGreaterThan(140);
  });

  it('handles complete parameter change events across all controls', () => {
    const paramListener = vi.fn();
    imagerUI.addEventListener('param-change', paramListener);

    // 1. Change Band 1 width slider
    const b1Slider = imagerUI.shadowRoot?.querySelector('.band-slider[data-band="1"]') as HTMLInputElement;
    if (b1Slider) {
      b1Slider.value = '1.35';
      b1Slider.dispatchEvent(new Event('input'));
    }
    expect(imagerUI.getBandWidths()[1]).toBe(1.35);

    // 2. Change Stereoize Mode & Depth
    const stSelect = imagerUI.shadowRoot?.querySelector('#stereoizeModeSelect') as HTMLSelectElement;
    if (stSelect) {
      stSelect.value = 'mode_i';
      stSelect.dispatchEvent(new Event('change'));
    }
    expect(imagerUI.getStereoizeMode()).toBe('mode_i');

    const stSlider = imagerUI.shadowRoot?.querySelector('#stereoizeAmountSlider') as HTMLInputElement;
    if (stSlider) {
      stSlider.value = '0.7';
      stSlider.dispatchEvent(new Event('input'));
    }

    // 3. Change Recover Sides Depth
    const recSlider = imagerUI.shadowRoot?.querySelector('#recoverSidesSlider') as HTMLInputElement;
    if (recSlider) {
      recSlider.value = '0.45';
      recSlider.dispatchEvent(new Event('input'));
    }
    expect(imagerUI.getRecoverSidesAmount()).toBe(0.45);

    expect(paramListener).toHaveBeenCalled();
  });

  it('toggles bypass state correctly and fires bypass-change event', () => {
    const bypassListener = vi.fn();
    imagerUI.addEventListener('bypass-change', bypassListener);

    const bypassBtn = imagerUI.shadowRoot?.querySelector('#bypassBtn') as HTMLButtonElement;
    expect(bypassBtn).not.toBeNull();
    expect(imagerUI.isBypassed()).toBe(false);

    bypassBtn.click();
    expect(imagerUI.isBypassed()).toBe(true);
    expect(bypassBtn.textContent).toBe('BYPASS');
    expect(bypassListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: { bypassed: true }
    }));

    bypassBtn.click();
    expect(imagerUI.isBypassed()).toBe(false);
    expect(bypassBtn.textContent).toBe('IN');
  });

  it('updates live visualization telemetry without rendering errors', () => {
    const scope = imagerUI.shadowRoot?.querySelector('#vectorscope') as SonodsVectorscopeElement;
    const meter = imagerUI.shadowRoot?.querySelector('#correlationMeter') as SonodsCorrelationMeterElement;
    const display = imagerUI.shadowRoot?.querySelector('#multibandDisplay') as SonodsMultibandDisplayElement;

    // Stream mock telemetry sample pairs
    const samples = [0.5, 0.5, -0.3, 0.3, 0.8, -0.8];
    expect(() => {
      scope.updateSamples(samples);
      meter.updateTelemetry(0.85);
      display.updateTelemetry([0.9, 0.8, 0.7, 0.6], [0.0, 1.0, 1.2, 1.5]);
      imagerUI.updateTelemetry({
        vectorscopeSamples: samples,
        correlation: 0.85,
        bandCorrelations: [0.9, 0.8, 0.7, 0.6]
      });
    }).not.toThrow();
  });
});
