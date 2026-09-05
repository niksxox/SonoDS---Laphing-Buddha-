// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/CorrelationMeterElement';
import { SonodsCorrelationMeterElement } from '../src/components/CorrelationMeterElement';

describe('Correlation Meter Component (Task 3.1)', () => {
  let meter: SonodsCorrelationMeterElement;

  beforeEach(() => {
    meter = document.createElement('sonods-correlation-meter') as SonodsCorrelationMeterElement;
    document.body.appendChild(meter);
  });

  it('initializes with +1.00 correlation default', () => {
    const readout = meter.shadowRoot?.querySelector('#numReadout');
    expect(readout?.textContent).toBe('+1.00');
  });

  it('tracks real telemetry correlation values accurately', () => {
    meter.updateCorrelation(0.5);
    let readout = meter.shadowRoot?.querySelector('#numReadout');
    expect(readout?.textContent).toBe('+0.50');

    meter.updateCorrelation(-0.8);
    readout = meter.shadowRoot?.querySelector('#numReadout');
    expect(readout?.textContent).toBe('-0.80');

    meter.updateCorrelation(0.0);
    readout = meter.shadowRoot?.querySelector('#numReadout');
    expect(readout?.textContent).toBe('+0.00');
  });

  it('clamps extreme telemetry values outside [-1.0, +1.0] safely', () => {
    meter.updateCorrelation(1.5);
    let readout = meter.shadowRoot?.querySelector('#numReadout');
    expect(readout?.textContent).toBe('+1.00');

    meter.updateCorrelation(-2.0);
    readout = meter.shadowRoot?.querySelector('#numReadout');
    expect(readout?.textContent).toBe('-1.00');
  });
});
