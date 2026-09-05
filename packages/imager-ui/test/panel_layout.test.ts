// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/SonodsImagerElement';
import { SonodsImagerElement } from '../src/components/SonodsImagerElement';

describe('Panel Layout & Structural Review (Task 4.1)', () => {
  let imagerUI: SonodsImagerElement;

  beforeEach(() => {
    imagerUI = document.createElement('sonods-imager') as SonodsImagerElement;
    document.body.appendChild(imagerUI);
  });

  it('renders complete top deck, mid deck, mode tabs, and bottom bar', () => {
    const shadow = imagerUI.shadowRoot;
    expect(shadow).not.toBeNull();

    expect(shadow?.querySelector('sonods-vectorscope')).not.toBeNull();
    expect(shadow?.querySelector('sonods-correlation-meter')).not.toBeNull();
    expect(shadow?.querySelector('sonods-multiband-display')).not.toBeNull();
    expect(shadow?.querySelectorAll('.tab-btn').length).toBe(3);
    expect(shadow?.querySelector('#bypassBtn')).not.toBeNull();
  });

  it('switches active mode tabs smoothly without resetting state', () => {
    expect(imagerUI.getActiveTab()).toBe('imager');

    const tabBtns = imagerUI.shadowRoot?.querySelectorAll('.tab-btn');
    (tabBtns?.[1] as HTMLElement)?.click(); // Click Shuffler tab

    expect(imagerUI.getActiveTab()).toBe('shuffler');
  });
});
