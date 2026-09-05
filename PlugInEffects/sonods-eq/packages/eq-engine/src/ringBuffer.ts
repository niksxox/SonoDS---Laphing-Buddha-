import { MAX_BANDS, PARAMS_PER_BAND } from './types.js';

export function isCrossOriginIsolated(): boolean {
  if (typeof window !== 'undefined' && 'crossOriginIsolated' in window) {
    return window.crossOriginIsolated;
  }
  if (typeof globalThis !== 'undefined' && 'crossOriginIsolated' in globalThis) {
    return (globalThis as unknown as { crossOriginIsolated: boolean }).crossOriginIsolated;
  }
  return false;
}

export const PARAM_SLOTS = MAX_BANDS * PARAMS_PER_BAND;
export const COMMAND_RING_BUFFER_CAPACITY = 64;
// Command entry: [type, bandIndex, arg1, arg2] (4 ints)
export const COMMAND_ENTRY_SIZE = 4;

export enum CommandType {
  SetBand = 1,
  RemoveBand = 2,
  SetPhaseMode = 3,
  SetSampleRate = 4,
  ClearBands = 5,
  SnapBand = 6,
}

export interface SharedMemoryLayout {
  sab: SharedArrayBuffer;
  params: Float64Array;
  cmdBuffer: Int32Array;
}

export function createSharedMemoryLayout(): SharedMemoryLayout | null {
  if (!isCrossOriginIsolated() || typeof SharedArrayBuffer === 'undefined') {
    return null;
  }

  // Float64Array for params: PARAM_SLOTS * 8 bytes
  // Command header + ring: (3 + COMMAND_RING_BUFFER_CAPACITY * COMMAND_ENTRY_SIZE) * 4 bytes
  const paramBytes = PARAM_SLOTS * 8;
  const cmdBytes = (3 + COMMAND_RING_BUFFER_CAPACITY * COMMAND_ENTRY_SIZE) * 4;
  const totalBytes = paramBytes + cmdBytes;

  const sab = new SharedArrayBuffer(totalBytes);
  const params = new Float64Array(sab, 0, PARAM_SLOTS);
  const cmdBuffer = new Int32Array(sab, paramBytes);

  // Initialize ring buffer header: [writeIndex=0, readIndex=0, capacity]
  cmdBuffer[0] = 0;
  cmdBuffer[1] = 0;
  cmdBuffer[2] = COMMAND_RING_BUFFER_CAPACITY;

  return { sab, params, cmdBuffer };
}

export function pushCommandToRingBuffer(
  cmdBuffer: Int32Array,
  cmdType: CommandType,
  bandIndex: number,
  arg1: number,
  arg2: number
): boolean {
  const writeIdx = Atomics.load(cmdBuffer, 0);
  const readIdx = Atomics.load(cmdBuffer, 1);
  const capacity = cmdBuffer[2];

  const nextWriteIdx = (writeIdx + 1) % capacity;
  if (nextWriteIdx === readIdx) {
    // Ring buffer full
    return false;
  }

  const offset = 3 + writeIdx * COMMAND_ENTRY_SIZE;
  cmdBuffer[offset] = cmdType;
  cmdBuffer[offset + 1] = bandIndex;
  cmdBuffer[offset + 2] = arg1;
  cmdBuffer[offset + 3] = arg2;

  Atomics.store(cmdBuffer, 0, nextWriteIdx);
  return true;
}

export function popCommandsFromRingBuffer(
  cmdBuffer: Int32Array,
  callback: (cmdType: CommandType, bandIndex: number, arg1: number, arg2: number) => void
): number {
  const writeIdx = Atomics.load(cmdBuffer, 0);
  let readIdx = Atomics.load(cmdBuffer, 1);
  const capacity = cmdBuffer[2];
  let processed = 0;

  while (readIdx !== writeIdx) {
    const offset = 3 + readIdx * COMMAND_ENTRY_SIZE;
    const cmdType = cmdBuffer[offset];
    const bandIndex = cmdBuffer[offset + 1];
    const arg1 = cmdBuffer[offset + 2];
    const arg2 = cmdBuffer[offset + 3];

    callback(cmdType, bandIndex, arg1, arg2);

    readIdx = (readIdx + 1) % capacity;
    processed++;
  }

  Atomics.store(cmdBuffer, 1, readIdx);
  return processed;
}
