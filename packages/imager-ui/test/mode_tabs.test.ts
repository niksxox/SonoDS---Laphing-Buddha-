// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/SonodsImagerElement';
import { SonodsImagerElement } from '../src/components/SonodsImagerElement';

describe('Mode Tabs Interaction (Task 4.3)', () => {
  let imagerUI: SonodsImagerElement;

  beforeEach(() => {
    imagerUI = document.createElement('sonods-imager') as SonodsImagerElement;
    document.body.appendChild(imagerUI);
  });

  it('preserves underlying band width settings when switching between tabs', () => {
    // 1. In Imager tab, set Band 0 (bass) width to 0.4
    const tabBtns = imagerUI.shadowRoot?.querySelectorAll('.tab-btn');
    (tabBtns?.[0] as HTMLElement)?.click(); // Imager tab

    const b0Slider = imagerUI.shadowRoot?.querySelector('.band-slider[data-band="0"]') as HTMLInputElement;
    if (b0Slider) {
      b0Slider.value = '0.4';
      b0Slider.dispatchEvent(new Event('input'));
    }

    expect(imagerUI.getBandWidths()[0]).toBe(0.4);

    // 2. Switch to Shuffler tab
    (tabBtns?.[1] as HTMLElement)?.click();
    expect(imagerUI.getActiveTab()).toBe('shuffler');

    const shufWidth = imagerUI.shadowRoot?.querySelector('#shufWidth') as HTMLInputElement;
    expect(shufWidth?.value).toBe('0.4'); // Preserved!

    // 3. Switch to M-S Matrix tab
    (tabBtns?.[2] as HTMLElement)?.click();
    expect(imagerUI.getActiveTab()).toBe('matrix');
    expect(imagerUI.shadowRoot?.querySelector('#soloMidBtn')).not.toBeNull();

    // 4. Switch back to Imager tab — state remains preserved
    (tabBtns?.[0] as HTMLElement)?.click();
    expect(imagerUI.getBandWidths()[0]).toBe(0.4);
  });
});
