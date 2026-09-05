// gate-processor.ts
// Runs inside AudioWorkletGlobalScope

export const GATE_WORKLET_PROCESSOR_CODE = `
class SonodsGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enginePtr = 0;
    this.exports = null;
    this.leftBufferPtr = 0;
    this.rightBufferPtr = 0;
    this.scLeftBufferPtr = 0;
    this.scRightBufferPtr = 0;
    this.telemetryBufferPtr = 0;
    this.bufferCapacity = 0;
    this.initialized = false;
    this.meterDecimateCounter = 0;

    this.port.onmessage = async (event) => {
      const data = event.data;
      if (data.type === 'INIT') {
        try {
          const { instance } = await WebAssembly.instantiate(data.wasmBytes, {});
          this.exports = instance.exports;
          this.enginePtr = this.exports.create_gate(data.sampleRate || sampleRate);
          this.telemetryBufferPtr = this.exports.allocate_f32_buffer(5);

          this.initialized = true;
          this.port.postMessage({ type: 'READY' });
        } catch (err) {
          this.port.postMessage({ type: 'ERROR', error: String(err) });
        }
      } else if (data.type === 'SET_PARAM') {
        this.applyParamCommand(data.cmd, data.value);
      }
    };
  }

  applyParamCommand(cmd, val) {
    if (!this.exports || !this.enginePtr) return;
    switch (cmd) {
      case 'threshold':
        this.exports.set_threshold(this.enginePtr, val);
        break;
      case 'range':
        this.exports.set_range(this.enginePtr, val);
        break;
      case 'ratio':
        this.exports.set_ratio(this.enginePtr, val);
        break;
      case 'knee':
        this.exports.set_knee(this.enginePtr, val);
        break;
      case 'attack':
        this.exports.set_attack(this.enginePtr, val);
        break;
      case 'hold':
        this.exports.set_hold(this.enginePtr, val);
        break;
      case 'release':
        this.exports.set_release(this.enginePtr, val);
        break;
      case 'lookahead':
        this.exports.set_lookahead(this.enginePtr, val);
        break;
      case 'style':
        this.exports.set_style(this.enginePtr, val | 0);
        break;
      case 'mode':
        this.exports.set_mode(this.enginePtr, val | 0);
        break;
      case 'detectorMode':
        this.exports.set_detector_mode(this.enginePtr, val | 0);
        break;
      case 'sidechainSource':
        this.exports.set_sidechain_source(this.enginePtr, val | 0);
        break;
      case 'sidechainListen':
        this.exports.set_sidechain_listen(this.enginePtr, val ? 1 : 0);
        break;
      case 'sidechainHpf':
        this.exports.set_sidechain_hpf(this.enginePtr, val);
        break;
      case 'sidechainLpf':
        this.exports.set_sidechain_lpf(this.enginePtr, val);
        break;
      case 'stereoLink':
        this.exports.set_stereo_link(this.enginePtr, val);
        break;
      case 'mix':
        this.exports.set_mix(this.enginePtr, val);
        break;
      case 'outputGain':
        this.exports.set_output_gain(this.enginePtr, val);
        break;
      case 'midiForceOpen':
        this.exports.set_midi_force_open(this.enginePtr, val ? 1 : 0);
        break;
    }
  }

  ensureBuffers(len) {
    if (this.bufferCapacity < len) {
      if (this.leftBufferPtr) {
        this.exports.deallocate_f32_buffer(this.leftBufferPtr, this.bufferCapacity);
        this.exports.deallocate_f32_buffer(this.rightBufferPtr, this.bufferCapacity);
        this.exports.deallocate_f32_buffer(this.scLeftBufferPtr, this.bufferCapacity);
        this.exports.deallocate_f32_buffer(this.scRightBufferPtr, this.bufferCapacity);
      }
      this.leftBufferPtr = this.exports.allocate_f32_buffer(len);
      this.rightBufferPtr = this.exports.allocate_f32_buffer(len);
      this.scLeftBufferPtr = this.exports.allocate_f32_buffer(len);
      this.scRightBufferPtr = this.exports.allocate_f32_buffer(len);
      this.bufferCapacity = len;
    }
  }

  process(inputs, outputs) {
    const mainInput = inputs[0];
    const extScInput = inputs[1];
    const output = outputs[0];

    if (!output || output.length === 0) return true;

    const numChannels = output.length;
    const numSamples = output[0].length;

    if (!this.initialized || !this.exports || !this.enginePtr) {
      for (let ch = 0; ch < numChannels; ch++) {
        if (mainInput && mainInput[ch]) {
          output[ch].set(mainInput[ch]);
        } else {
          output[ch].fill(0);
        }
      }
      return true;
    }

    this.ensureBuffers(numSamples);

    const mem = new Float32Array(this.exports.memory.buffer);

    // Copy main inputs to WASM memory
    const inL = (mainInput && mainInput[0]) || new Float32Array(numSamples);
    const inR = (mainInput && (mainInput[1] || mainInput[0])) || inL;

    mem.set(inL, this.leftBufferPtr >> 2);
    mem.set(inR, this.rightBufferPtr >> 2);

    // Copy sidechain inputs to WASM memory if connected
    if (extScInput && extScInput[0]) {
      const scL = extScInput[0];
      const scR = extScInput[1] || extScInput[0];
      mem.set(scL, this.scLeftBufferPtr >> 2);
      mem.set(scR, this.scRightBufferPtr >> 2);
    } else {
      mem.fill(0, this.scLeftBufferPtr >> 2, (this.scLeftBufferPtr >> 2) + numSamples);
      mem.fill(0, this.scRightBufferPtr >> 2, (this.scRightBufferPtr >> 2) + numSamples);
    }

    // Process block in Rust DSP core
    this.exports.process_block(
      this.enginePtr,
      this.leftBufferPtr,
      this.rightBufferPtr,
      this.scLeftBufferPtr,
      this.scRightBufferPtr,
      numSamples
    );

    // Copy processed audio to outputs
    const freshMem = new Float32Array(this.exports.memory.buffer);
    output[0].set(freshMem.subarray(this.leftBufferPtr >> 2, (this.leftBufferPtr >> 2) + numSamples));
    if (numChannels > 1) {
      output[1].set(freshMem.subarray(this.rightBufferPtr >> 2, (this.rightBufferPtr >> 2) + numSamples));
    }

    // Emit telemetry every 4 blocks (~100 Hz at 48 kHz / 128 samples per block)
    this.meterDecimateCounter++;
    if (this.meterDecimateCounter >= 4) {
      this.meterDecimateCounter = 0;
      this.exports.get_telemetry_frame(this.enginePtr, this.telemetryBufferPtr);

      const telSlice = new Float32Array(this.exports.memory.buffer, this.telemetryBufferPtr, 5);
      const stateNames = ['closed', 'attacking', 'open', 'holding', 'releasing'];
      const stateIdx = Math.round(telSlice[4]) | 0;

      this.port.postMessage({
        type: 'TELEMETRY',
        inputDb: telSlice[0],
        detectedDb: telSlice[1],
        outputDb: telSlice[2],
        grDb: telSlice[3],
        state: stateNames[stateIdx] || 'closed',
      });
    }

    return true;
  }
}

registerProcessor('sonods-gate-processor', SonodsGateProcessor);
`;
