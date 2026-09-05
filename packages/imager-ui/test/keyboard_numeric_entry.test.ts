// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/SonodsImagerElement';
import '../src/components/MultibandDisplayElement';
import { SonodsImagerElement } from '../src/components/SonodsImagerElement';
import { SonodsMultibandDisplayElement } from '../src/components/MultibandDisplayElement';

describe('Keyboard Accessibility & Direct Numeric Entry (Task 4.5)', () => {
  let imagerUI: SonodsImagerElement;

  beforeEach(() => {
    imagerUI = document.createElement('sonods-imager') as SonodsImagerElement;
    document.body.appendChild(imagerUI);
  });

  it('assigns correct ARIA roles and attributes to mode tabs and controls', () => {
    const tabList = imagerUI.shadowRoot?.querySelector('.mode-tabs');
    expect(tabList?.getAttribute('role')).toBe('tablist');

    const tabs = imagerUI.shadowRoot?.querySelectorAll('.tab-btn');
    expect(tabs?.length).toBe(3);
    expect(tabs?.[0].getAttribute('role')).toBe('tab');
    expect(tabs?.[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs?.[1].getAttribute('aria-selected')).toBe('false');

    const bypassBtn = imagerUI.shadowRoot?.querySelector('#bypassBtn');
    expect(bypassBtn?.getAttribute('role')).toBe('button');
    expect(bypassBtn?.getAttribute('aria-pressed')).toBe('false');

    const b0Slider = imagerUI.shadowRoot?.querySelector('.band-slider[data-band="0"]');
    expect(b0Slider?.getAttribute('role')).toBe('slider');
    expect(b0Slider?.getAttribute('aria-label')).toBe('Band 1 Width');
    expect(b0Slider?.getAttribute('aria-valuenow')).toBe('0');
  });

  it('supports arrow key navigation across mode tabs', () => {
    const tab0 = imagerUI.shadowRoot?.querySelectorAll('.tab-btn')[0] as HTMLButtonElement;
    expect(imagerUI.getActiveTab()).toBe('imager');

    // Press ArrowRight on tab 0
    tab0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(imagerUI.getActiveTab()).toBe('shuffler');

    const tab1 = imagerUI.shadowRoot?.querySelectorAll('.tab-btn')[1] as HTMLButtonElement;
    tab1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(imagerUI.getActiveTab()).toBe('matrix');
  });

  it('allows direct numeric entry for band width controls on double-click', () => {
    const valB0 = imagerUI.shadowRoot?.querySelector('#val-b0') as HTMLElement;
    expect(valB0).not.toBeNull();

    // Trigger double click to start editing
    valB0.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const input = valB0.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();

    // Type 1.45 and press Enter
    input.value = '1.45';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(imagerUI.getBandWidths()[0]).toBe(1.45);
    expect(valB0.textContent).toBe('1.45x');
  });

  it('cancels direct numeric entry on Escape key without updating state', () => {
    const valB1 = imagerUI.shadowRoot?.querySelector('#val-b1') as HTMLElement;
    expect(valB1).not.toBeNull();

    // Double click to start editing
    valB1.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = valB1.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();

    input.value = '1.99';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(imagerUI.getBandWidths()[1]).toBe(1.0); // Retains default
    expect(valB1.textContent).toBe('1.00x');
  });

  it('supports percentage input formatting for Stereoize & Recover Sides depth', () => {
    const valStAmt = imagerUI.shadowRoot?.querySelector('#val-st-amt') as HTMLElement;
    expect(valStAmt).not.toBeNull();

    valStAmt.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = valStAmt.querySelector('input') as HTMLInputElement;

    input.value = '75%';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(valStAmt.textContent).toBe('75%');

    const valRecAmt = imagerUI.shadowRoot?.querySelector('#val-rec-amt') as HTMLElement;
    valRecAmt.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const recInput = valRecAmt.querySelector('input') as HTMLInputElement;

    recInput.value = '35%';
    recInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(imagerUI.getRecoverSidesAmount()).toBe(0.35);
    expect(valRecAmt.textContent).toBe('35%');
  });

  it('provides keyboard accessibility for MultibandDisplay crossover handles', () => {
    const display = imagerUI.shadowRoot?.querySelector('#multibandDisplay') as SonodsMultibandDisplayElement;
    expect(display).not.toBeNull();

    const initialCrossovers = display.getCrossovers();
    expect(initialCrossovers[0]).toBe(140);

    const handleBtns = display.shadowRoot?.querySelectorAll('.handle-btn');
    expect(handleBtns?.length).toBe(3);

    const h0Btn = handleBtns?.[0] as HTMLButtonElement;
    expect(h0Btn.getAttribute('role')).toBe('slider');
    expect(h0Btn.getAttribute('aria-label')).toBe('Crossover 1 Frequency');

    // Adjust crossover handle 0 with ArrowRight
    h0Btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(display.getCrossovers()[0]).toBe(145);
  });
});
