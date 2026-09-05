// sat-node.test.ts
import { describe, it, expect } from 'vitest';
import { loadDspModule } from '../src/wasmLoader.js';
import { getWasmBytes } from '../src/wasm/wasmBinary.js';
import { CommandType, createSharedMemoryLayout, drainRingBuffer, pushCommandToRingBuffer } from '../src/ringBuffer.js';

describe('SatEngine Web Audio & WASM Integration', () => {
  it('instantiates the sat_core WASM module cleanly', async () => {
    const wasmBytes = getWasmBytes();
    expect(wasmBytes).toBeDefined();
    expect(wasmBytes.length).toBeGreaterThan(1000);

    const exports = await loadDspModule(wasmBytes);
    expect(exports).toBeDefined();
    expect(typeof exports.create_saturator).toBe('function');
    expect(typeof exports.process_block).toBe('function');
  });

  it('manages saturator engine lifecycle and processes audio blocks', async () => {
    const wasmBytes = getWasmBytes();
    const exports = await loadDspModule(wasmBytes);

    const ptr = exports.create_saturator(48000.0);
    expect(ptr).toBeGreaterThan(0);

    exports.set_drive(ptr, 0.6);
    exports.set_tone(ptr, 2.5);
    exports.set_character(ptr, 1); // Tube
    exports.set_mix(ptr, 1.0);
    exports.set_auto_gain(ptr, 1);
    exports.set_quality(ptr, 0);

    const blockLen = 128;
    const leftPtr = exports.allocate_f32_buffer(blockLen);
    const rightPtr = exports.allocate_f32_buffer(blockLen);

    const memF32 = new Float32Array(exports.memory.buffer);
    const leftOffset = leftPtr >> 2;
    const rightOffset = rightPtr >> 2;

    for (let i = 0; i < blockLen; i++) {
      memF32[leftOffset + i] = 0.5;
      memF32[rightOffset + i] = -0.5;
    }

    exports.process_block(ptr, leftPtr, rightPtr, blockLen);

    const outMemF32 = new Float32Array(exports.memory.buffer);
    for (let i = 0; i < blockLen; i++) {
      expect(Number.isFinite(outMemF32[leftOffset + i])).toBe(true);
      expect(Number.isNaN(outMemF32[leftOffset + i])).toBe(false);
    }

    exports.deallocate_f32_buffer(leftPtr, blockLen);
    exports.deallocate_f32_buffer(rightPtr, blockLen);
    exports.destroy_saturator(ptr);
  });

  it('computes transfer curve points across input grid', async () => {
    const wasmBytes = getWasmBytes();
    const exports = await loadDspModule(wasmBytes);

    const ptr = exports.create_saturator(48000.0);
    exports.set_drive(ptr, 0.5);
    exports.set_character(ptr, 0); // Tape

    const numPoints = 64;
    const inPtr = exports.allocate_f64_buffer(numPoints);
    const outPtr = exports.allocate_f64_buffer(numPoints);

    const inOffset = inPtr >> 3;
    const outOffset = outPtr >> 3;
    const memF64 = new Float64Array(exports.memory.buffer);

    for (let i = 0; i < numPoints; i++) {
      memF64[inOffset + i] = -1.0 + (2.0 * i) / (numPoints - 1);
    }

    exports.get_transfer_curve(ptr, inPtr, outPtr, numPoints);

    const outMemF64 = new Float64Array(exports.memory.buffer);
    const first = outMemF64[outOffset];
    const middle = outMemF64[outOffset + 32];
    const last = outMemF64[outOffset + numPoints - 1];

    expect(first).toBeLessThan(0.0);
    expect(Math.abs(middle)).toBeLessThan(0.1);
    expect(last).toBeGreaterThan(0.0);

    exports.deallocate_f64_buffer(inPtr, numPoints);
    exports.deallocate_f64_buffer(outPtr, numPoints);
    exports.destroy_saturator(ptr);
  });

  it('executes SharedArrayBuffer ring buffer queueing when supported', () => {
    if (typeof SharedArrayBuffer === 'undefined') {
      return;
    }

    const layout = createSharedMemoryLayout();
    if (!layout) return;

    expect(pushCommandToRingBuffer(layout, CommandType.SetDrive, 0.85)).toBe(true);
    expect(pushCommandToRingBuffer(layout, CommandType.SetTone, 4.0)).toBe(true);

    const received: { type: CommandType; val: number }[] = [];
    drainRingBuffer(layout, (type, val) => {
      received.push({ type, val });
    });

    expect(received.length).toBe(2);
    expect(received[0]).toEqual({ type: CommandType.SetDrive, val: 0.85 });
    expect(received[1]).toEqual({ type: CommandType.SetTone, val: 4.0 });
  });
});
