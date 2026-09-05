import { describe, it, expect, vi } from 'vitest';
import { PROCESSOR_CODE } from '../src/processor';
import { SonodsImagerNode } from '../src/node';

describe('SonodsImagerNode & Worklet Integration (Task 2.2)', () => {
  it('exports PROCESSOR_CODE containing SonodsImagerProcessor class definition', () => {
    expect(PROCESSOR_CODE).toContain('class SonodsImagerProcessor extends AudioWorkletProcessor');
    expect(PROCESSOR_CODE).toContain("registerProcessor('sonods-imager-processor', SonodsImagerProcessor)");
  });

  it('sends control parameters over MessagePort', () => {
    const mockPort = {
      postMessage: vi.fn(),
      onmessage: null,
    };

    // Create instance with mocked port
    const node = Object.create(SonodsImagerNode.prototype);
    Object.defineProperty(node, 'port', { value: mockPort });

    node.setNumBands(4);
    expect(mockPort.postMessage).toHaveBeenLastCalledWith({
      type: 'PARAM',
      name: 'numBands',
      value: 4,
    });

    node.setBandWidth(0, 0.0);
    expect(mockPort.postMessage).toHaveBeenLastCalledWith({
      type: 'PARAM',
      name: 'bandWidth',
      band: 0,
      value: 0.0,
    });

    node.setStereoize('mode_i', 0.8);
    expect(mockPort.postMessage).toHaveBeenLastCalledWith({
      type: 'PARAM',
      name: 'stereoize',
      mode: 1,
      amount: 0.8,
    });

    node.setAsymmetry(-0.5);
    expect(mockPort.postMessage).toHaveBeenLastCalledWith({
      type: 'PARAM',
      name: 'asymmetry',
      value: -0.5,
    });
  });
});
