import { describe, it, expect, beforeEach } from 'vitest';
import { loadGateDspModule } from '../wasmLoader.js';
import { GateDspExports } from '../types.js';

describe('Gate Engine DSP Integration (Phase 2)', () => {
  let dsp: GateDspExports;
  let gatePtr: number;

  beforeEach(async () => {
    dsp = await loadGateDspModule();
    gatePtr = dsp.create_gate(44100.0);
  });

  it('correctly processes block of audio and attenuates below threshold', () => {
    dsp.set_threshold(gatePtr, -20.0);
    dsp.set_ratio(gatePtr, 10.0); // Gate
    dsp.set_range(gatePtr, -60.0);
    dsp.set_attack(gatePtr, 0.001);
    dsp.set_release(gatePtr, 0.050);

    const len = 128;
    const leftPtr = dsp.allocate_f32_buffer(len);
    const rightPtr = dsp.allocate_f32_buffer(len);

    // Feed quiet audio (-40 dBFS, amplitude 0.01)
    const mem = new Float32Array((dsp as any).memory.buffer);
    mem.fill(0.01, leftPtr >> 2, (leftPtr >> 2) + len);
    mem.fill(0.01, rightPtr >> 2, (rightPtr >> 2) + len);

    // Process several blocks to let gate release/close
    for (let b = 0; b < 20; b++) {
      dsp.process_block(gatePtr, leftPtr, rightPtr, 0, 0, len);
    }

    const freshMem = new Float32Array((dsp as any).memory.buffer);
    const outSample = freshMem[leftPtr >> 2];

    // Output should be heavily attenuated below input 0.01
    expect(outSample).toBeLessThan(0.005);

    dsp.deallocate_f32_buffer(leftPtr, len);
    dsp.deallocate_f32_buffer(rightPtr, len);
    dsp.destroy_gate(gatePtr);
  });

  it('sidechain input drives gating in ducking mode', () => {
    dsp.set_threshold(gatePtr, -20.0);
    dsp.set_mode(gatePtr, 2); // Ducking
    dsp.set_sidechain_source(gatePtr, 1); // External sidechain

    const len = 128;
    const leftPtr = dsp.allocate_f32_buffer(len);
    const rightPtr = dsp.allocate_f32_buffer(len);
    const scLeftPtr = dsp.allocate_f32_buffer(len);
    const scRightPtr = dsp.allocate_f32_buffer(len);

    // Main input = 0.5 (-6 dBFS), Sidechain input = 1.0 (0 dBFS, loud)
    const mem = new Float32Array((dsp as any).memory.buffer);
    mem.fill(0.5, leftPtr >> 2, (leftPtr >> 2) + len);
    mem.fill(0.5, rightPtr >> 2, (rightPtr >> 2) + len);
    mem.fill(1.0, scLeftPtr >> 2, (scLeftPtr >> 2) + len);
    mem.fill(1.0, scRightPtr >> 2, (scRightPtr >> 2) + len);

    for (let b = 0; b < 10; b++) {
      dsp.process_block(gatePtr, leftPtr, rightPtr, scLeftPtr, scRightPtr, len);
    }

    const freshMem = new Float32Array((dsp as any).memory.buffer);
    const outSample = freshMem[leftPtr >> 2];
    // Main audio should be ducked down
    expect(outSample).toBeLessThan(0.5);

    dsp.deallocate_f32_buffer(leftPtr, len);
    dsp.deallocate_f32_buffer(rightPtr, len);
    dsp.deallocate_f32_buffer(scLeftPtr, len);
    dsp.deallocate_f32_buffer(scRightPtr, len);
    dsp.destroy_gate(gatePtr);
  });

  it('midi force open overrides detector and holds gate at 0 dB reduction', () => {
    dsp.set_threshold(gatePtr, 0.0); // high threshold -> normally closed
    dsp.set_midi_force_open(gatePtr, 1); // Force open

    const len = 128;
    const leftPtr = dsp.allocate_f32_buffer(len);
    const rightPtr = dsp.allocate_f32_buffer(len);

    const mem = new Float32Array((dsp as any).memory.buffer);
    mem.fill(0.2, leftPtr >> 2, (leftPtr >> 2) + len);
    mem.fill(0.2, rightPtr >> 2, (rightPtr >> 2) + len);

    for (let b = 0; b < 10; b++) {
      dsp.process_block(gatePtr, leftPtr, rightPtr, 0, 0, len);
    }

    const telPtr = dsp.allocate_f32_buffer(5);
    dsp.get_telemetry_frame(gatePtr, telPtr);
    const telMem = new Float32Array((dsp as any).memory.buffer, telPtr, 5);

    // grDb should be 0.0 dB (open)
    expect(telMem[3]).toBeCloseTo(0.0, 1);

    dsp.deallocate_f32_buffer(leftPtr, len);
    dsp.deallocate_f32_buffer(rightPtr, len);
    dsp.deallocate_f32_buffer(telPtr, 5);
    dsp.destroy_gate(gatePtr);
  });
});
