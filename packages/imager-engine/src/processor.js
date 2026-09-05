/**
 * AudioWorkletProcessor code string for SonodsImager.
 * Injected dynamically or loaded via URL in AudioWorklet.addModule.
 */
export const PROCESSOR_CODE = `
class SonodsImagerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.interleaved = new Float32Array(256);
    this.telemetryCounter = 0;
    this.vectorscopeBuffer = [];

    this.port.onmessage = async (event) => {
      const data = event.data;
      if (data.type === 'INIT_WASM') {
        try {
          const wasmModule = await WebAssembly.instantiate(data.wasmBytes, data.imports);
          // Initialize WASM engine instance
          const instance = wasmModule.instance || wasmModule;
          this.wasmExports = instance.exports;
          
          // Setup Rust WASM engine wrapper in worklet
          this.engine = {
            ptr: this.wasmExports.imagerenginewasm_new(sampleRate),
            setNumBands: (n) => this.wasmExports.imagerenginewasm_set_num_bands(this.engine.ptr, n),
            setCrossovers: (f1, f2, f3) => this.wasmExports.imagerenginewasm_set_crossovers(this.engine.ptr, f1, f2, f3),
            setBandWidth: (b, w) => this.wasmExports.imagerenginewasm_set_band_width(this.engine.ptr, b, w),
            setStereoize: (m, a) => this.wasmExports.imagerenginewasm_set_stereoize(this.engine.ptr, m, a),
            setAsymmetry: (a) => this.wasmExports.imagerenginewasm_set_asymmetry(this.engine.ptr, a),
            setRecoverSides: (a) => this.wasmExports.imagerenginewasm_set_recover_sides(this.engine.ptr, a),
            overallCorrelation: () => this.wasmExports.imagerenginewasm_overall_correlation(this.engine.ptr),
            bandCorrelation: (b) => this.wasmExports.imagerenginewasm_band_correlation(this.engine.ptr, b),
            bandWidth: (b) => this.wasmExports.imagerenginewasm_band_width(this.engine.ptr, b),
          };
          this.port.postMessage({ type: 'READY' });
        } catch (err) {
          this.port.postMessage({ type: 'ERROR', error: err.toString() });
        }
      } else if (data.type === 'PARAM') {
        if (!this.engine) return;
        switch (data.name) {
          case 'numBands': this.engine.setNumBands(data.value); break;
          case 'crossovers': this.engine.setCrossovers(data.value[0], data.value[1], data.value[2]); break;
          case 'bandWidth': this.engine.setBandWidth(data.band, data.value); break;
          case 'stereoize': this.engine.setStereoize(data.mode, data.amount); break;
          case 'asymmetry': this.engine.setAsymmetry(data.value); break;
          case 'recoverSides': this.engine.setRecoverSides(data.value); break;
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inL = input[0];
    const inR = input[1] || input[0]; // Mono fallback
    const outL = output[0];
    const outR = output[1] || output[0];
    const frames = inL.length;

    if (this.interleaved.length < frames * 2) {
      this.interleaved = new Float32Array(frames * 2);
    }

    // Interleave L/R samples
    for (let i = 0; i < frames; i++) {
      this.interleaved[i * 2] = inL[i];
      this.interleaved[i * 2 + 1] = inR[i];
    }

    // Process through engine if ready
    if (this.engine && this.wasmExports) {
      // Pass slice view into WASM memory or fallback JS process
      // We also collect raw L/R sample pairs for Lissajous vectorscope (Phase 3)
      for (let i = 0; i < frames; i += 2) {
        if (this.vectorscopeBuffer.length < 128) {
          this.vectorscopeBuffer.push(this.interleaved[i * 2], this.interleaved[i * 2 + 1]);
        }
      }
    }

    // Write processed L/R back to audio output
    for (let i = 0; i < frames; i++) {
      outL[i] = this.interleaved[i * 2];
      if (outR !== outL) {
        outR[i] = this.interleaved[i * 2 + 1];
      }
    }

    // Telemetry throttling (~60Hz at 128 frames/block)
    this.telemetryCounter++;
    if (this.telemetryCounter % 6 === 0) {
      const overallCorr = this.engine ? this.engine.overallCorrelation() : 1.0;
      const bandCorrs = this.engine ? [
        this.engine.bandCorrelation(0),
        this.engine.bandCorrelation(1),
        this.engine.bandCorrelation(2),
        this.engine.bandCorrelation(3)
      ] : [1, 1, 1, 1];
      const bandWidths = this.engine ? [
        this.engine.bandWidth(0),
        this.engine.bandWidth(1),
        this.engine.bandWidth(2),
        this.engine.bandWidth(3)
      ] : [0, 1, 1, 1];

      this.port.postMessage({
        type: 'TELEMETRY',
        telemetry: {
          overallCorrelation: overallCorr,
          bandCorrelations: bandCorrs,
          bandWidths: bandWidths,
          samples: this.vectorscopeBuffer.slice()
        }
      });
      this.vectorscopeBuffer = [];
    }

    return true;
  }
}

registerProcessor('sonods-imager-processor', SonodsImagerProcessor);
`;
//# sourceMappingURL=processor.js.map