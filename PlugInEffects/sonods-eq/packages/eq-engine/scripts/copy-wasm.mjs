import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmSource = path.resolve(__dirname, '../../dsp-core/target/wasm32-unknown-unknown/release/sonods_dsp_core.wasm');
const destDir = path.resolve(__dirname, '../src/wasm');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const wasmBytes = fs.readFileSync(wasmSource);
fs.writeFileSync(path.join(destDir, 'sonods_dsp_core.wasm'), wasmBytes);

const base64Wasm = wasmBytes.toString('base64');
const tsContent = `// Auto-generated from sonods_dsp_core.wasm
export const WASM_BASE64 = "${base64Wasm}";

export function getWasmBytes(): Uint8Array {
  if (typeof atob === 'function') {
    const binStr = atob(WASM_BASE64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
  } else if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(WASM_BASE64, 'base64'));
  }
  throw new Error('No base64 decoding mechanism found');
}
`;

fs.writeFileSync(path.join(destDir, 'wasmBinary.ts'), tsContent);
console.log(`✅ Copied wasm (${wasmBytes.length} bytes) to src/wasm/`);
