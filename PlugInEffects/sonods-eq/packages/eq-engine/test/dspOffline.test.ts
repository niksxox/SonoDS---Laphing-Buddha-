import { describe, it, expect } from 'vitest';
import { loadDspModule } from '../src/wasmLoader.js';
import { Shape } from '../src/types.js';

describe('DSP Offline Processing Correctness', () => {
  it('correctly filters audio with bell boost', async () => {
    const dsp = await loadDspModule();
    const sampleRate = 48000;
    const enginePtr = dsp.create_engine(sampleRate);

    // Bell band at 1000 Hz, +6 dB, Q=2.0
    dsp.set_band(enginePtr, 0, Shape.Bell, 1000.0, 6.0, 2.0, 1);

    const blockSize = 4800;
    const leftPtr = dsp.allocate_f32_buffer(blockSize);
    const rightPtr = dsp.allocate_f32_buffer(blockSize);

    const leftView = new Float32Array(dsp.memory.buffer, leftPtr, blockSize);
    const rightView = new Float32Array(dsp.memory.buffer, rightPtr, blockSize);

    // Warm up smoothing with sine wave blocks
    let sampleIdx = 0;
    for (let b = 0; b < 10; b++) {
      for (let i = 0; i < blockSize; i++) {
        const t = (sampleIdx + i) / sampleRate;
        const val = Math.sin(2 * Math.PI * 1000 * t);
        leftView[i] = val;
        rightView[i] = val;
      }
      sampleIdx += blockSize;
      dsp.process_block(enginePtr, leftPtr, rightPtr, blockSize);
    }

    // Compute RMS
    let sumSq = 0;
    for (let i = 0; i < blockSize; i++) {
      sumSq += leftView[i] * leftView[i];
    }
    const rmsOut = Math.sqrt(sumSq / blockSize);
    const rmsIn = 1 / Math.sqrt(2); // ~0.707

    const gainDb = 20 * Math.log10(rmsOut / rmsIn);
    expect(Math.abs(gainDb - 6.0)).toBeLessThan(0.3);

    // Clean up
    dsp.deallocate_f32_buffer(leftPtr, blockSize);
    dsp.deallocate_f32_buffer(rightPtr, blockSize);
    dsp.destroy_engine(enginePtr);
  });
});
