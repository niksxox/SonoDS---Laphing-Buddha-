import { describe, it, expect } from 'vitest';
import { getWasmBytes } from '../src/wasm/wasmBinary.js';

describe('WASM Smoke Test against native Rust DSP core', () => {
  it('loads WASM binary and instantiates WebAssembly module', async () => {
    const bytes = getWasmBytes();
    expect(bytes.length).toBeGreaterThan(1000);

    const module = await WebAssembly.instantiate(bytes, {
      env: {},
    });

    const exports = module.instance.exports as Record<string, any>;
    expect(exports).toBeDefined();
    expect(typeof exports.create_compressor).toBe('function');
    expect(typeof exports.set_threshold).toBe('function');
    expect(typeof exports.set_ratio).toBe('function');
    expect(typeof exports.process_block).toBe('function');
    expect(typeof exports.get_gain_reduction_db).toBe('function');

    // Create compressor instance via WASM FFI
    const compPtr = exports.create_compressor(48000.0);
    expect(compPtr).toBeGreaterThan(0);

    // Initial GR must be 0.0
    const initialGr = exports.get_gain_reduction_db(compPtr);
    expect(initialGr).toBe(0.0);

    // Set parameters
    exports.set_threshold(compPtr, -12.0);
    exports.set_ratio(compPtr, 4.0);

    // Clean up
    exports.destroy_compressor(compPtr);
  });
});
