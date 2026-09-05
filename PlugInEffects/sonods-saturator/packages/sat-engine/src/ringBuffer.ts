// ringBuffer.ts
// Zero-allocation lock-free SharedArrayBuffer ring buffer with postMessage fallback.

export const PARAM_COUNT = 8;
export const RING_CAPACITY = 64; // Power of 2 for fast bitmasking
export const RING_MASK = RING_CAPACITY - 1;

export enum CommandType {
  SetDrive = 1,
  SetTone = 2,
  SetCharacter = 3,
  SetMix = 4,
  SetOutputGain = 5,
  SetAutoGain = 6,
  SetQuality = 7,
}

export interface SharedMemoryLayout {
  buffer: SharedArrayBuffer;
  params: Float64Array;     // Direct atomic/snapshot parameter array
  head: Int32Array;         // Ring write pointer
  tail: Int32Array;         // Ring read pointer
  commands: Int32Array;     // Command types
  values: Float64Array;     // Command values
}

export function isSharedArrayBufferSupported(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
}

export function createSharedMemoryLayout(): SharedMemoryLayout | null {
  if (!isSharedArrayBufferSupported()) {
    return null;
  }

  // Layout:
  // [0 .. 64 bytes]           : Params snapshot (8 x Float64)
  // [64 .. 72 bytes]          : Head (Int32) and Tail (Int32)
  // [72 .. 328 bytes]         : Commands (64 x Int32)
  // [328 .. 840 bytes]        : Values (64 x Float64)
  const totalBytes = 1024;
  const buffer = new SharedArrayBuffer(totalBytes);

  const params = new Float64Array(buffer, 0, PARAM_COUNT);
  const head = new Int32Array(buffer, 64, 1);
  const tail = new Int32Array(buffer, 68, 1);
  const commands = new Int32Array(buffer, 72, RING_CAPACITY);
  const values = new Float64Array(buffer, 328, RING_CAPACITY);

  return {
    buffer,
    params,
    head,
    tail,
    commands,
    values,
  };
}

export function pushCommandToRingBuffer(
  layout: SharedMemoryLayout,
  cmdType: CommandType,
  value: number
): boolean {
  const currentHead = Atomics.load(layout.head, 0);
  const currentTail = Atomics.load(layout.tail, 0);

  if (currentHead - currentTail >= RING_CAPACITY) {
    // Ring buffer full
    return false;
  }

  const index = currentHead & RING_MASK;
  layout.commands[index] = cmdType;
  layout.values[index] = value;

  // Publish with atomic release
  Atomics.store(layout.head, 0, currentHead + 1);
  return true;
}

export function drainRingBuffer(
  layout: SharedMemoryLayout,
  onCommand: (type: CommandType, value: number) => void
): void {
  const currentHead = Atomics.load(layout.head, 0);
  let currentTail = Atomics.load(layout.tail, 0);

  while (currentTail < currentHead) {
    const index = currentTail & RING_MASK;
    const type = layout.commands[index] as CommandType;
    const value = layout.values[index];

    onCommand(type, value);
    currentTail++;
  }

  Atomics.store(layout.tail, 0, currentTail);
}
