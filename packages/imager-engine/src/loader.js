import initWasm, { ImagerEngineWasm } from '../pkg/dsp_core.js';
let wasmInitialized = false;
let initPromise = null;
/**
 * Loads and initializes the WASM DSP core module.
 * Can be called multiple times safely (idempotent).
 */
export async function loadWasmModule(wasmSource) {
    if (wasmInitialized) {
        return;
    }
    if (!initPromise) {
        initPromise = (async () => {
            if (wasmSource) {
                await initWasm({ module_or_path: wasmSource });
            }
            else {
                await initWasm();
            }
            wasmInitialized = true;
        })();
    }
    return initPromise;
}
export { ImagerEngineWasm };
//# sourceMappingURL=loader.js.map