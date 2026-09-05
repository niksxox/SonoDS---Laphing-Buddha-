// sonods-comp-processor.ts
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

export const COMP_WORKLET_PROCESSOR_CODE = `
class SonodsCompProcessor extends AudioWorkletProcessor {
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
    this.sabMeterGrDb = null;
    this.initialized = false;
    this.meterDecimateCounter = 0;
    this.pendingCommands = [];

    this.port.onmessage = async (event) => {
      const data = event.data;
      if (data.type === 'INIT') {
        try {
          const { instance } = await WebAssembly.instantiate(data.wasmBytes, {});
          this.exports = instance.exports;
          this.enginePtr = this.exports.create_compressor(data.sampleRate || sampleRate);

          if (data.sharedBuffer) {
            this.sabHead = new Int32Array(data.sharedBuffer, 96, 1);
            this.sabTail = new Int32Array(data.sharedBuffer, 100, 1);
            this.sabCommands = new Int32Array(data.sharedBuffer, 104, 64);
            this.sabValues = new Float64Array(data.sharedBuffer, 360, 64);
            this.sabMeterGrDb = new Float64Array(data.sharedBuffer, 872, 1);
          }

          // Apply any pending parameters received before WASM was initialized
          for (const cmdObj of this.pendingCommands) {
            this.applyParamCommand(cmdObj.cmd, cmdObj.val);
          }
          this.pendingCommands = [];

          this.initialized = true;
          this.port.postMessage({ type: 'READY' });
        } catch (err) {
          this.port.postMessage({ type: 'ERROR', error: String(err) });
        }
      } else if (data.type === 'SET_PARAM') {
        if (!this.initialized || !this.exports || !this.enginePtr) {
          this.pendingCommands.push({ cmd: data.cmd, val: data.value });
        } else {
          this.applyParamCommand(data.cmd, data.value);
        }
      }
    };
  }

  applyParamCommand(cmd, val) {
    if (!this.exports || !this.enginePtr) return;
    switch (cmd) {
      case 1: // SetThreshold
        this.exports.set_threshold(this.enginePtr, val);
        break;
      case 2: // SetRatio
        this.exports.set_ratio(this.enginePtr, val);
        break;
      case 3: // SetAttack
        this.exports.set_attack(this.enginePtr, val);
        break;
      case 4: // SetRelease
        this.exports.set_release(this.enginePtr, val);
        break;
      case 5: // SetKnee
        this.exports.set_knee(this.enginePtr, val);
        break;
      case 6: // SetLink
        this.exports.set_stereo_link(this.enginePtr, val);
        break;
      case 7: // SetMix
        this.exports.set_mix(this.enginePtr, val);
        break;
      case 8: // SetOutputGain
        this.exports.set_output_gain(this.enginePtr, val);
        break;
      case 9: // SetAutoGain
        this.exports.set_auto_gain(this.enginePtr, val);
        break;
      case 10: // SetSidechainHpf
        this.exports.set_sidechain_hpf(this.enginePtr, val);
        break;
      case 11: // SetLookahead
        this.exports.set_lookahead(this.enginePtr, val);
        break;
      case 12: // SetCharacter
        this.exports.set_character(this.enginePtr, val | 0);
        break;
    }
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

      this.applyParamCommand(cmd, val);
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
      for (let ch = 0; ch < numChannels; ch++) {
        if (input && input[ch]) {
          output[ch].set(input[ch]);
        } else {
          output[ch].fill(0);
        }
      }
      return true;
    }

    // Drain queued parameter changes
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

    // Process stereo block
    this.exports.process_block(this.enginePtr, this.leftBufferPtr, this.rightBufferPtr, numSamples);

    // Read back output
    const outMemF32 = new Float32Array(this.exports.memory.buffer);
    for (let ch = 0; ch < numChannels; ch++) {
      const heapOffset = ch === 0 ? leftHeapOffset : rightHeapOffset;
      output[ch].set(outMemF32.subarray(heapOffset, heapOffset + numSamples));
    }

    // Reverse-direction telemetry: read full telemetry taps from DSP core
    const currentGrDb = this.exports.get_gain_reduction_db(this.enginePtr);
    const inputDb = this.exports.get_input_level_db ? this.exports.get_input_level_db(this.enginePtr) : -60.0;
    const detectedDb = this.exports.get_detected_level_db ? this.exports.get_detected_level_db(this.enginePtr) : -60.0;
    const outputDb = this.exports.get_output_level_db ? this.exports.get_output_level_db(this.enginePtr) : -60.0;

    if (this.sabMeterGrDb) {
      this.sabMeterGrDb[0] = currentGrDb;
    }

    // Post real telemetry at ~100Hz for ultra-smooth timeline rendering
    this.meterDecimateCounter++;
    if (this.meterDecimateCounter >= 4) {
      this.meterDecimateCounter = 0;
      this.port.postMessage({
        type: 'METER_TELEMETRY',
        inputDb,
        detectedDb,
        outputDb,
        grDb: currentGrDb,
      });
    }

    return true;
  }
}

registerProcessor('sonods-comp-processor', SonodsCompProcessor);
`;
