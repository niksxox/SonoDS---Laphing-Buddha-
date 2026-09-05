// sonods-eq-processor.ts
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
class SonodsEqProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enginePtr = 0;
    this.exports = null;
    this.leftBufferPtr = 0;
    this.rightBufferPtr = 0;
    this.bufferCapacity = 0;
    this.sabParams = null;
    this.sabCmds = null;
    this.initialized = false;

    this.port.onmessage = async (event) => {
      const data = event.data;
      if (data.type === 'INIT') {
        try {
          const { instance } = await WebAssembly.instantiate(data.wasmBytes, {});
          this.exports = instance.exports;
          this.enginePtr = this.exports.create_engine(data.sampleRate || sampleRate);

          if (data.sharedBuffer) {
            const paramBytes = 12 * 10 * 8;
            this.sabParams = new Float64Array(data.sharedBuffer, 0, 12 * 10);
            this.sabCmds = new Int32Array(data.sharedBuffer, paramBytes);
          }

          this.initialized = true;
          this.port.postMessage({ type: 'READY' });
        } catch (err) {
          this.port.postMessage({ type: 'ERROR', error: String(err) });
        }
      } else if (data.type === 'SET_PARAM') {
        if (this.exports && this.enginePtr) {
          this.exports.set_band_param(this.enginePtr, data.bandIndex, data.paramId, data.value);
        }
      } else if (data.type === 'SET_BAND') {
        if (this.exports && this.enginePtr) {
          this.exports.set_band(
            this.enginePtr,
            data.index,
            data.shape,
            data.freq,
            data.gain,
            data.q,
            data.enabled ? 1 : 0
          );
        }
      } else if (data.type === 'CLEAR_BANDS') {
        if (this.exports && this.enginePtr) {
          if (this.exports.clear_bands) {
            this.exports.clear_bands(this.enginePtr);
          }
          if (this.lastSabParams) {
            this.lastSabParams.fill(-999.0);
          }
        }
      } else if (data.type === 'SNAP_BAND') {
        if (this.exports && this.enginePtr) {
          if (this.exports.snap_band) {
            this.exports.snap_band(
              this.enginePtr,
              data.index,
              data.shape,
              data.freq,
              data.gain,
              data.q,
              data.enabled ? 1 : 0
            );
          }
        }
      } else if (data.type === 'REMOVE_BAND') {
        if (this.exports && this.enginePtr) {
          this.exports.remove_band(this.enginePtr, data.index);
        }
      } else if (data.type === 'SET_PHASE_MODE') {
        if (this.exports && this.enginePtr) {
          this.exports.set_phase_mode(this.enginePtr, data.mode);
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

    // Process shared-memory command ring buffer if available
    if (this.sabCmds) {
      const writeIdx = Atomics.load(this.sabCmds, 0);
      let readIdx = Atomics.load(this.sabCmds, 1);
      const capacity = this.sabCmds[2];

      while (readIdx !== writeIdx) {
        const offset = 3 + readIdx * 4;
        const cmdType = this.sabCmds[offset];
        const bandIdx = this.sabCmds[offset + 1];
        const arg1 = this.sabCmds[offset + 2];
        const arg2 = this.sabCmds[offset + 3];

        if (cmdType === 1) { // SetBand
          this.exports.set_band(this.enginePtr, bandIdx, arg1, 1000.0, 0.0, 1.0, 1);
        } else if (cmdType === 2) { // RemoveBand
          this.exports.remove_band(this.enginePtr, bandIdx);
        } else if (cmdType === 3) { // PhaseMode
          this.exports.set_phase_mode(this.enginePtr, arg1);
        }

        readIdx = (readIdx + 1) % capacity;
      }
      Atomics.store(this.sabCmds, 1, readIdx);
    }

    // Read parameters from SharedArrayBuffer if active (only dispatch when changed)
    if (this.sabParams && this.exports && this.enginePtr) {
      if (!this.lastSabParams) {
        this.lastSabParams = new Float64Array(120);
        this.lastSabParams.fill(-999.0);
      }
      for (let i = 0; i < 120; i++) {
        const val = this.sabParams[i];
        if (val !== this.lastSabParams[i]) {
          this.lastSabParams[i] = val;
          const bandIdx = (i / 10) | 0;
          const paramId = i % 10;
          this.exports.set_band_param(this.enginePtr, bandIdx, paramId, val);
        }
      }
    }

    this.ensureBuffers(numSamples);

    const memF32 = new Float32Array(this.exports.memory.buffer);
    const leftOffset = this.leftBufferPtr >> 2;
    const rightOffset = this.rightBufferPtr >> 2;

    const inL = (input && input[0]) ? input[0] : null;
    const inR = (input && input[1]) ? input[1] : inL;

    if (inL) {
      memF32.set(inL, leftOffset);
    } else {
      memF32.fill(0, leftOffset, leftOffset + numSamples);
    }

    if (inR) {
      memF32.set(inR, rightOffset);
    } else {
      memF32.fill(0, rightOffset, rightOffset + numSamples);
    }

    this.exports.process_block(this.enginePtr, this.leftBufferPtr, this.rightBufferPtr, numSamples);

    if (output[0]) {
      output[0].set(memF32.subarray(leftOffset, leftOffset + numSamples));
    }
    if (output[1]) {
      output[1].set(memF32.subarray(rightOffset, rightOffset + numSamples));
    }

    return true;
  }
}

registerProcessor('sonods-eq-processor', SonodsEqProcessor);
`;
