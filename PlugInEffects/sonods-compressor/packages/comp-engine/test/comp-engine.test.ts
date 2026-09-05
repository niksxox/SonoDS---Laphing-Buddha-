import { describe, it, expect } from 'vitest';
import { loadDspModule } from '../src/wasmLoader.js';
import { getWasmBytes } from '../src/wasm/wasmBinary.js';
import {
  CommandType,
  createSharedMemoryLayout,
  drainRingBuffer,
  pushCommandToRingBuffer,
} from '../src/ringBuffer.js';

describe('CompEngine Web Audio, RingBuffer & Parameter Tests (Task 2.2 - 2.6)', () => {
  it('instantiates the comp_core WASM module cleanly', async () => {
    const wasmBytes = getWasmBytes();
    expect(wasmBytes).toBeDefined();
    expect(wasmBytes.length).toBeGreaterThan(1000);

    const exports = await loadDspModule(wasmBytes);
    expect(exports).toBeDefined();
    expect(typeof exports.create_compressor).toBe('function');
    expect(typeof exports.process_block).toBe('function');
    expect(typeof exports.get_gain_reduction_db).toBe('function');
  });

  it('manages compressor lifecycle and processes audio blocks with gain reduction', async () => {
    const wasmBytes = getWasmBytes();
    const exports = await loadDspModule(wasmBytes);

    const ptr = exports.create_compressor(48000.0);
    expect(ptr).toBeGreaterThan(0);

    // Set high ratio and low threshold to trigger clear gain reduction
    exports.set_threshold(ptr, -20.0);
    exports.set_ratio(ptr, 6.0);
    exports.set_attack(ptr, 0.005);
    exports.set_release(ptr, 0.050);
    exports.set_mix(ptr, 1.0);

    const blockLen = 128;
    const leftPtr = exports.allocate_f32_buffer(blockLen);
    const rightPtr = exports.allocate_f32_buffer(blockLen);

    const memF32 = new Float32Array(exports.memory.buffer);
    const leftOffset = leftPtr >> 2;
    const rightOffset = rightPtr >> 2;

    // Loud AC input: 1kHz sine tone at 0.9 amplitude (~ -0.9 dBFS, well above -20dB threshold)
    for (let b = 0; b < 30; b++) {
      for (let i = 0; i < blockLen; i++) {
        const t = (b * blockLen + i) / 48000.0;
        const s = 0.9 * Math.sin(2.0 * Math.PI * 1000.0 * t);
        memF32[leftOffset + i] = s;
        memF32[rightOffset + i] = s;
      }
      exports.process_block(ptr, leftPtr, rightPtr, blockLen);
    }

    // Measure reverse-direction telemetry
    const grDb = exports.get_gain_reduction_db(ptr);
    expect(grDb).toBeGreaterThan(5.0); // Should be reducing gain by > 5 dB

    const outMemF32 = new Float32Array(exports.memory.buffer);
    for (let i = 0; i < blockLen; i++) {
      const outL = outMemF32[leftOffset + i];
      expect(Number.isFinite(outL)).toBe(true);
      expect(outL).toBeLessThan(0.9); // Compressed output should be lower amplitude
    }

    exports.deallocate_f32_buffer(leftPtr, blockLen);
    exports.deallocate_f32_buffer(rightPtr, blockLen);
    exports.destroy_compressor(ptr);
  });

  it('correctly handles lock-free ring buffer parameter queue', () => {
    // Mock shared memory if crossOriginIsolated isn't set in node/vitest
    const totalBytes = 1024;
    const rawBuffer = new ArrayBuffer(totalBytes);
    const layout = {
      buffer: rawBuffer as unknown as SharedArrayBuffer,
      params: new Float64Array(rawBuffer, 0, 12),
      head: new Int32Array(rawBuffer, 96, 1),
      tail: new Int32Array(rawBuffer, 100, 1),
      commands: new Int32Array(rawBuffer, 104, 64),
      values: new Float64Array(rawBuffer, 360, 64),
      meterGrDb: new Float64Array(rawBuffer, 872, 1),
    };

    // Push parameter changes
    pushCommandToRingBuffer(layout, CommandType.SetThreshold, -18.0);
    pushCommandToRingBuffer(layout, CommandType.SetRatio, 4.0);
    pushCommandToRingBuffer(layout, CommandType.SetCharacter, 1);

    const received: Array<{ type: CommandType; value: number }> = [];
    drainRingBuffer(layout, (type, value) => {
      received.push({ type, value });
    });

    expect(received.length).toBe(3);
    expect(received[0]).toEqual({ type: CommandType.SetThreshold, value: -18.0 });
    expect(received[1]).toEqual({ type: CommandType.SetRatio, value: 4.0 });
    expect(received[2]).toEqual({ type: CommandType.SetCharacter, value: 1 });
  });

  it('verifies reverse-direction gain reduction metering path (Task 2.3)', async () => {
    const wasmBytes = getWasmBytes();
    const exports = await loadDspModule(wasmBytes);
    const ptr = exports.create_compressor(48000.0);

    // Initial state: 0 dB reduction
    expect(exports.get_gain_reduction_db(ptr)).toBe(0.0);

    // After quiet signal: still 0 dB reduction
    const blockLen = 64;
    const lPtr = exports.allocate_f32_buffer(blockLen);
    const rPtr = exports.allocate_f32_buffer(blockLen);
    const memF32 = new Float32Array(exports.memory.buffer);
    const lOff = lPtr >> 2;
    const rOff = rPtr >> 2;

    for (let i = 0; i < blockLen; i++) {
      memF32[lOff + i] = 0.01; // ~ -40 dBFS
      memF32[rOff + i] = 0.01;
    }
    exports.process_block(ptr, lPtr, rPtr, blockLen);
    expect(exports.get_gain_reduction_db(ptr)).toBe(0.0);

    exports.deallocate_f32_buffer(lPtr, blockLen);
    exports.deallocate_f32_buffer(rPtr, blockLen);
    exports.destroy_compressor(ptr);
  });
});
