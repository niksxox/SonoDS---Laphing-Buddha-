// wasmLoader.ts
import { DspExports } from './types.js';

export async function loadDspModule(wasmBytes: Uint8Array): Promise<DspExports> {
  const result: any = await WebAssembly.instantiate(wasmBytes, {});
  const instance = result && result.instance ? result.instance : result;
  return instance.exports as unknown as DspExports;
}
