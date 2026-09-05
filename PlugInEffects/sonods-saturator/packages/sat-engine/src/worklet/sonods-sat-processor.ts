// sonods-sat-processor.ts
// Runs inside the AudioWorkletGlobalScope

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void;

export const WORKLET_PROCESSOR_CODE = `
class SonodsSatProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enginePtr = 0;
    this.exports = null;
    this.leftBufferPtr = 0;
    this.rightBufferPtr = 0;
    this.bufferCapacity = 0;
    this.sabHead = null;
    this.sabTail = null;
    this.sabCommands = null;
    this.sabValues = null;
    this.initialized = false;

    this.port.onmessage = async (event) => {
      const data = event.data;
      if (data.type === 'INIT') {
        try {
          const { instance } = await WebAssembly.instantiate(data.wasmBytes, {});
          this.exports = instance.exports;
          this.enginePtr = this.exports.create_saturator(data.sampleRate || sampleRate);

          if (data.sharedBuffer) {
            this.sabHead = new Int32Array(data.sharedBuffer, 64, 1);
            this.sabTail = new Int32Array(data.sharedBuffer, 68, 1);
            this.sabCommands = new Int32Array(data.sharedBuffer, 72, 64);
            this.sabValues = new Float64Array(data.sharedBuffer, 328, 64);
          }

          this.initialized = true;
          this.port.postMessage({ type: 'READY' });
        } catch (err) {
          this.port.postMessage({ type: 'ERROR', error: String(err) });
        }
      } else if (data.type === 'SET_DRIVE') {
        if (this.exports && this.enginePtr) {
          this.exports.set_drive(this.enginePtr, data.value);
        }
      } else if (data.type === 'SET_TONE') {
        if (this.exports && this.enginePtr) {
          this.exports.set_tone(this.enginePtr, data.value);
        }
      } else if (data.type === 'SET_CHARACTER') {
        if (this.exports && this.enginePtr) {
          this.exports.set_character(this.enginePtr, data.value);
        }
      } else if (data.type === 'SET_MIX') {
        if (this.exports && this.enginePtr) {
          this.exports.set_mix(this.enginePtr, data.value);
        }
      } else if (data.type === 'SET_OUTPUT_GAIN') {
        if (this.exports && this.enginePtr) {
          this.exports.set_output_gain(this.enginePtr, data.value);
        }
      } else if (data.type === 'SET_AUTO_GAIN') {
        if (this.exports && this.enginePtr) {
          this.exports.set_auto_gain(this.enginePtr, data.value ? 1 : 0);
        }
      } else if (data.type === 'SET_QUALITY') {
        if (this.exports && this.enginePtr) {
          this.exports.set_quality(this.enginePtr, data.value);
        }
      }
    };
  }

  ensureBuffers(len) {
    if (this.bufferCapacity < len) {
      if (this.leftBufferPtr) {
        this.exports.deallocate_f32_buffer(this.leftBufferPtr, this.bufferCapacity);
        this.exports.deallocate_f32_buffer(this.rightBufferPtr, this.bufferCapacity);
      }
      this.leftBufferPtr = this.exports.allocate_f32_buffer(len);
      this.rightBufferPtr = this.exports.allocate_f32_buffer(len);
      this.bufferCapacity = len;
    }
  }

  drainRingBuffer() {
    if (!this.sabHead || !this.sabTail) return;
    const currentHead = Atomics.load(this.sabHead, 0);
    let currentTail = Atomics.load(this.sabTail, 0);

    while (currentTail < currentHead) {
      const index = currentTail & 63;
      const cmd = this.sabCommands[index];
      const val = this.sabValues[index];

      switch (cmd) {
        case 1: // SetDrive
          this.exports.set_drive(this.enginePtr, val);
          break;
        case 2: // SetTone
          this.exports.set_tone(this.enginePtr, val);
          break;
        case 3: // SetCharacter
          this.exports.set_character(this.enginePtr, val | 0);
          break;
        case 4: // SetMix
          this.exports.set_mix(this.enginePtr, val);
          break;
        case 5: // SetOutputGain
          this.exports.set_output_gain(this.enginePtr, val);
          break;
        case 6: // SetAutoGain
          this.exports.set_auto_gain(this.enginePtr, val > 0.5 ? 1 : 0);
          break;
        case 7: // SetQuality
          this.exports.set_quality(this.enginePtr, val | 0);
          break;
      }
      currentTail++;
    }

    Atomics.store(this.sabTail, 0, currentTail);
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const input = inputs[0];

    if (!output || output.length === 0) return true;

    const numChannels = output.length;
    const numSamples = output[0].length;

    if (!this.initialized || !this.exports || !this.enginePtr) {
      // Pass-through before initialization
      for (let ch = 0; ch < numChannels; ch++) {
        if (input && input[ch]) {
          output[ch].set(input[ch]);
        } else {
          output[ch].fill(0);
        }
      }
      return true;
    }

    // Drain any queued lock-free parameter changes
    this.drainRingBuffer();

    this.ensureBuffers(numSamples);

    const memF32 = new Float32Array(this.exports.memory.buffer);
    const leftHeapOffset = this.leftBufferPtr >> 2;
    const rightHeapOffset = this.rightBufferPtr >> 2;

    const inL = input && input[0] ? input[0] : null;
    const inR = input && input[1] ? input[1] : inL;

    if (inL) {
      memF32.set(inL, leftHeapOffset);
    } else {
      memF32.fill(0, leftHeapOffset, leftHeapOffset + numSamples);
    }

    if (inR) {
      memF32.set(inR, rightHeapOffset);
    } else {
      memF32.fill(0, rightHeapOffset, rightHeapOffset + numSamples);
    }

    // Process stereo DSP in-place inside WASM memory
    this.exports.process_block(this.enginePtr, this.leftBufferPtr, this.rightBufferPtr, numSamples);

    // Read back output
    const outMemF32 = new Float32Array(this.exports.memory.buffer);
    if (output[0]) {
      output[0].set(outMemF32.subarray(leftHeapOffset, leftHeapOffset + numSamples));
    }
    if (output[1]) {
      output[1].set(outMemF32.subarray(rightHeapOffset, rightHeapOffset + numSamples));
    }

    return true;
  }
}

registerProcessor('sonods-sat-processor', SonodsSatProcessor);
`;
