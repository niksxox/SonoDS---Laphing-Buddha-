import { ImagerEngineWasm } from '../pkg/dsp_core.js';
/**
 * Loads and initializes the WASM DSP core module.
 * Can be called multiple times safely (idempotent).
 */
export declare function loadWasmModule(wasmSource?: BufferSource | WebAssembly.Module): Promise<void>;
export { ImagerEngineWasm };
//# sourceMappingURL=loader.d.ts.map