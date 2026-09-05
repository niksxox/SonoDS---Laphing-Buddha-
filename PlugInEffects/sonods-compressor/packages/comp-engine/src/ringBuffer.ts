// ringBuffer.ts
// Zero-allocation lock-free SharedArrayBuffer parameter path with reverse-direction metering.

export const PARAM_COUNT = 12;
export const RING_CAPACITY = 64;
export const RING_MASK = RING_CAPACITY - 1;

export enum CommandType {
  SetThreshold = 1,
  SetRatio = 2,
  SetAttack = 3,
  SetRelease = 4,
  SetKnee = 5,
  SetLink = 6,
  SetMix = 7,
  SetOutputGain = 8,
  SetAutoGain = 9,
  SetSidechainHpf = 10,
  SetLookahead = 11,
  SetCharacter = 12,
}

export interface SharedMemoryLayout {
  buffer: SharedArrayBuffer;
  params: Float64Array;     // Parameter snapshot
  head: Int32Array;         // Ring write pointer
  tail: Int32Array;         // Ring read pointer
  commands: Int32Array;     // Command types
  values: Float64Array;     // Command values
  meterGrDb: Float64Array;  // Reverse-direction gain-reduction meter value written by audio worklet
}

export function isSharedArrayBufferSupported(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
}

export function createSharedMemoryLayout(): SharedMemoryLayout | null {
  if (!isSharedArrayBufferSupported()) {
    return null;
  }

  // Layout:
  // [0 .. 96 bytes]           : Params snapshot (12 x Float64)
  // [96 .. 104 bytes]         : Head (Int32) and Tail (Int32)
  // [104 .. 360 bytes]        : Commands (64 x Int32)
  // [360 .. 872 bytes]        : Values (64 x Float64)
  // [872 .. 880 bytes]        : Metering: meterGrDb (1 x Float64)
  const totalBytes = 1024;
  const buffer = new SharedArrayBuffer(totalBytes);

  const params = new Float64Array(buffer, 0, PARAM_COUNT);
  const head = new Int32Array(buffer, 96, 1);
  const tail = new Int32Array(buffer, 100, 1);
  const commands = new Int32Array(buffer, 104, RING_CAPACITY);
  const values = new Float64Array(buffer, 360, RING_CAPACITY);
  const meterGrDb = new Float64Array(buffer, 872, 1);

  return {
    buffer,
    params,
    head,
    tail,
    commands,
    values,
    meterGrDb,
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
    return false;
  }

  const index = currentHead & RING_MASK;
  layout.commands[index] = cmdType;
  layout.values[index] = value;

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
