import { describe, it, expect } from 'vitest';
import {
  CommandType,
  createSharedMemoryLayout,
  popCommandsFromRingBuffer,
  pushCommandToRingBuffer,
} from '../src/ringBuffer.js';

describe('Lock-free Command Ring Buffer', () => {
  it('enqueues and dequeues structural commands in FIFO order', () => {
    // Create local buffer simulating shared memory
    const buffer = new Int32Array(3 + 64 * 4);
    buffer[0] = 0; // writeIdx
    buffer[1] = 0; // readIdx
    buffer[2] = 64; // capacity

    const pushed1 = pushCommandToRingBuffer(buffer, CommandType.SetBand, 0, 1, 0);
    const pushed2 = pushCommandToRingBuffer(buffer, CommandType.RemoveBand, 1, 0, 0);

    expect(pushed1).toBe(true);
    expect(pushed2).toBe(true);

    const received: { type: CommandType; band: number; a1: number; a2: number }[] = [];
    const count = popCommandsFromRingBuffer(buffer, (type, band, a1, a2) => {
      received.push({ type, band, a1, a2 });
    });

    expect(count).toBe(2);
    expect(received).toEqual([
      { type: CommandType.SetBand, band: 0, a1: 1, a2: 0 },
      { type: CommandType.RemoveBand, band: 1, a1: 0, a2: 0 },
    ]);

    // Subsequent pop should return 0
    const count2 = popCommandsFromRingBuffer(buffer, () => {});
    expect(count2).toBe(0);
  });
});
