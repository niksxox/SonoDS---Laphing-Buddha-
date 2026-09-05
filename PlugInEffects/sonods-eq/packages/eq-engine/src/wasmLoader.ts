import { DspExports } from './types.js';
import { getWasmBytes } from './wasm/wasmBinary.js';

export async function loadDspModule(wasmBytes?: ArrayBuffer | Uint8Array): Promise<DspExports> {
  const bytes = wasmBytes || getWasmBytes();
  const res = (await WebAssembly.instantiate(bytes, {})) as unknown as {
    instance?: WebAssembly.Instance;
    exports?: Record<string, unknown>;
  };
  const instanceExports = res.instance ? res.instance.exports : (res as unknown as WebAssembly.Instance).exports;
  return instanceExports as unknown as DspExports;
}
