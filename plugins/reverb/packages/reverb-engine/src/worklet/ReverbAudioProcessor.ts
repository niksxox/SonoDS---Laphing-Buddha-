// SonoDS Reverb - AudioWorkletProcessor
// Runs in the Web Audio rendering thread, hosting the WasmReverbProcessor.

export interface ReverbParamMessage {
  type: 'param';
  param: string;
  value: any;
}

export interface ReverbInitMessage {
  type: 'init';
  wasmBytes: ArrayBuffer;
  sampleRate: f32;
}

// Global scope decls for AudioWorklet
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: any);
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare function registerProcessor(name: string, processorCtor: any): void;

class ReverbAudioProcessor extends AudioWorkletProcessor {
  private wasmInstance: any = null;
  private wasmMemory: WebAssembly.Memory | null = null;
  private processor: any = null;

  private inputLPtr: number = 0;
  private inputRPtr: number = 0;
  private outputLPtr: number = 0;
  private outputRPtr: number = 0;

  private isInitialized = false;
  private bypass = false;

  constructor() {
    super();

    this.port.onmessage = async (event: MessageEvent) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'init') {
        await this.initWasm(msg.wasmBytes, msg.sampleRate || 44100);
      } else if (msg.type === 'param') {
        this.handleParam(msg.param, msg.value, msg.args);
      } else if (msg.type === 'bypass') {
        this.bypass = !!msg.value;
      }
    };
  }

  private async initWasm(wasmBytes: ArrayBuffer, sampleRate: number) {
    try {
      // Import generated JS glue / instantiate raw module
      const wasmModule = await WebAssembly.instantiate(wasmBytes, {
        env: {
          abort: () => console.error('WASM aborted'),
        },
      });

      const exports = wasmModule.instance.exports as any;
      this.wasmMemory = exports.memory;
      this.wasmInstance = exports;

      // Construct WasmReverbProcessor from WASM exports
      if (exports.WasmReverbProcessor) {
        this.processor = exports.WasmReverbProcessor.new(sampleRate, 128);
        this.inputLPtr = this.processor.input_mut_ptr_l();
        this.inputRPtr = this.processor.input_mut_ptr_r();
        this.outputLPtr = this.processor.output_ptr_l();
        this.outputRPtr = this.processor.output_ptr_r();
        this.isInitialized = true;
        this.port.postMessage({ type: 'ready' });
      }
    } catch (err) {
      console.error('Failed to initialize WASM Reverb processor in worklet:', err);
      this.port.postMessage({ type: 'error', error: String(err) });
    }
  }

  private handleParam(param: string, value: any, args?: any[]) {
    if (!this.processor) return;

    switch (param) {
      case 'space':
        this.processor.set_space(value);
        break;
      case 'rt60':
        this.processor.set_rt60(value);
        break;
      case 'brightness':
        this.processor.set_brightness(value);
        break;
      case 'character':
        this.processor.set_character(value);
        break;
      case 'distance':
        this.processor.set_distance(value);
        break;
      case 'thickness':
        this.processor.set_thickness(value);
        break;
      case 'stereoWidth':
        this.processor.set_stereo_width(value);
        break;
      case 'predelayMs':
        this.processor.set_predelay_ms(value);
        break;
      case 'predelaySync':
        this.processor.set_predelay_sync(value);
        break;
      case 'predelayBpm':
        this.processor.set_predelay_bpm(value);
        break;
      case 'predelayDivision':
        this.processor.set_predelay_division(value);
        break;
      case 'decayRateBand':
        if (args && args.length >= 4) {
          this.processor.set_decay_rate_band(args[0], args[1], args[2], args[3], args[4] ?? 1.0);
        }
        break;
      case 'postEqBand':
        if (args && args.length >= 5) {
          this.processor.set_post_eq_band(args[0], args[1], args[2], args[3], args[4], args[5] ?? 1.0);
        }
        break;
      case 'duckingAmount':
        this.processor.set_ducking_amount(value);
        break;
      case 'autoGate':
        if (args && args.length >= 1) {
          this.processor.set_auto_gate(value, args[0]);
        }
        break;
      case 'freeze':
        this.processor.set_freeze(value);
        break;
      case 'mix':
        this.processor.set_mix_percent(value);
        break;
      case 'forceMix':
        this.processor.force_set_mix_percent(value);
        break;
      case 'dryGainDb':
        this.processor.set_dry_gain_db(value);
        break;
      case 'wetGainDb':
        this.processor.set_wet_gain_db(value);
        break;
      case 'mixLocked':
        this.processor.set_mix_locked(value);
        break;
      case 'snapAll':
        this.processor.snap_all_params();
        break;
      case 'clearBuffers':
        this.processor.clear_buffers();
        break;
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !output || input.length === 0 || output.length === 0) {
      return true;
    }

    const inL = input[0];
    const inR = input[1] || input[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const frames = inL ? inL.length : 128;

    if (!this.isInitialized || this.bypass || !this.processor || !this.wasmMemory) {
      // Passthrough
      if (inL && outL) outL.set(inL);
      if (inR && outR) outR.set(inR);
      return true;
    }

    const memoryBuffer = this.wasmMemory.buffer;

    // Copy input to WASM memory
    const wasmInL = new Float32Array(memoryBuffer, this.inputLPtr, frames);
    const wasmInR = new Float32Array(memoryBuffer, this.inputRPtr, frames);
    wasmInL.set(inL);
    wasmInR.set(inR);

    // Execute DSP process block
    this.processor.process(frames);

    // Copy output from WASM memory
    const wasmOutL = new Float32Array(memoryBuffer, this.outputLPtr, frames);
    const wasmOutR = new Float32Array(memoryBuffer, this.outputRPtr, frames);
    if (outL) outL.set(wasmOutL);
    if (outR) outR.set(wasmOutR);

    return true;
  }
}

registerProcessor('sono-ds-reverb-processor', ReverbAudioProcessor);
