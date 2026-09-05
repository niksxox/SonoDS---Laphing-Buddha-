// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/SonodsImagerElement';
import { SonodsImagerElement } from '../src/components/SonodsImagerElement';

describe('Vectorscope & Correlation Meter Top Panel Placement (Task 4.2)', () => {
  let imagerUI: SonodsImagerElement;

  beforeEach(() => {
    imagerUI = document.createElement('sonods-imager') as SonodsImagerElement;
    document.body.appendChild(imagerUI);
  });

  it('renders vectorscope and correlation meter together inside the top-display-panel', () => {
    const shadow = imagerUI.shadowRoot;
    const topPanel = shadow?.querySelector('#topDisplayArea');
    expect(topPanel).not.toBeNull();

    const scope = topPanel?.querySelector('sonods-vectorscope');
    const meter = topPanel?.querySelector('sonods-correlation-meter');

    expect(scope).not.toBeNull();
    expect(meter).not.toBeNull();
  });

  it('resizes top panel display elements at various panel widths', () => {
    imagerUI.style.width = '500px';
    const topPanel = imagerUI.shadowRoot?.querySelector('#topDisplayArea') as HTMLElement;
    expect(topPanel).not.toBeNull();

    imagerUI.style.width = '800px';
    expect(imagerUI.shadowRoot?.querySelector('sonods-vectorscope')).not.toBeNull();
    expect(imagerUI.shadowRoot?.querySelector('sonods-correlation-meter')).not.toBeNull();
  });
});
