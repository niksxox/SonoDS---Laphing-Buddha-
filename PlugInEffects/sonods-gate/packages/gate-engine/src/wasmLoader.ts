// wasmLoader.ts
import { GateDspExports } from './types.js';
import { getWasmBytes } from './wasm/wasmBinary.js';

export async function loadGateDspModule(customWasmBytes?: Uint8Array): Promise<GateDspExports> {
  const bytes = customWasmBytes || getWasmBytes();
  const result: any = await WebAssembly.instantiate(bytes, {});
  const instance = result && result.instance ? result.instance : result;
  return instance.exports as unknown as GateDspExports;
}
