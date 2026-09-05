// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/components/SonodsImagerElement';
import { SonodsImagerElement } from '../src/components/SonodsImagerElement';

describe('Stereoize & Recover Sides Controls (Task 4.4)', () => {
  let imagerUI: SonodsImagerElement;

  beforeEach(() => {
    imagerUI = document.createElement('sonods-imager') as SonodsImagerElement;
    document.body.appendChild(imagerUI);
  });

  it('renders a distinct enhancement section defaulting to Off / 0%', () => {
    const shadow = imagerUI.shadowRoot;
    const section = shadow?.querySelector('#enhancementSection');
    expect(section).not.toBeNull();

    expect(imagerUI.getStereoizeMode()).toBe('off');
    expect(imagerUI.getRecoverSidesAmount()).toBe(0.0);
  });

  it('emits param-change events when Stereoize or Recover Sides controls are modified', () => {
    const callback = vi.fn();
    imagerUI.addEventListener('param-change', callback);

    const stSelect = imagerUI.shadowRoot?.querySelector('#stereoizeModeSelect') as HTMLSelectElement;
    stSelect.value = 'mode_i';
    stSelect.dispatchEvent(new Event('change'));

    expect(imagerUI.getStereoizeMode()).toBe('mode_i');
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ name: 'stereoize', mode: 'mode_i' }),
      })
    );

    const recSlider = imagerUI.shadowRoot?.querySelector('#recoverSidesSlider') as HTMLInputElement;
    recSlider.value = '0.4';
    recSlider.dispatchEvent(new Event('input'));

    expect(imagerUI.getRecoverSidesAmount()).toBe(0.4);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ name: 'recoverSides', value: 0.4 }),
      })
    );
  });
});
