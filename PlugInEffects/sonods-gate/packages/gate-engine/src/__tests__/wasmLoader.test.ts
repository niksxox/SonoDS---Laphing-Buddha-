import { describe, it, expect } from 'vitest';
import { loadGateDspModule } from '../wasmLoader.js';

describe('WASM Loader', () => {
  it('loads gate WASM module and executes exported version function', async () => {
    const exports = await loadGateDspModule();
    expect(exports).toBeDefined();
    expect(typeof exports.gate_core_version).toBe('function');
    const version = exports.gate_core_version();
    expect(version).toBe(1);
  });

  it('can create and destroy a gate instance', async () => {
    const exports = await loadGateDspModule();
    const ptr = exports.create_gate(44100.0);
    expect(ptr).toBeGreaterThan(0);
    exports.set_threshold(ptr, -24.0);
    exports.set_ratio(ptr, 10.0);
    exports.destroy_gate(ptr);
  });
});
