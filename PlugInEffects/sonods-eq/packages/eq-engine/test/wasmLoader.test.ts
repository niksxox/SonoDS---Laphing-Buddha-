import { describe, it, expect } from 'vitest';
import { loadDspModule } from '../src/wasmLoader.js';

describe('WASM Loader', () => {
  it('loads the DSP module and exports expected functions', async () => {
    const dsp = await loadDspModule();
    expect(dsp).toBeDefined();
    expect(typeof dsp.create_engine).toBe('function');
    expect(typeof dsp.destroy_engine).toBe('function');
    expect(typeof dsp.set_band).toBe('function');
    expect(typeof dsp.process_block).toBe('function');
    expect(typeof dsp.get_magnitude_response).toBe('function');

    const ptr = dsp.create_engine(48000);
    expect(ptr).toBeGreaterThan(0);
    dsp.destroy_engine(ptr);
  });
});
