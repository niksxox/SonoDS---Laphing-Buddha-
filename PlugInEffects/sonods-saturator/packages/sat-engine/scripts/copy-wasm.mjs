import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidates = [
  path.resolve(__dirname, '../../../target/wasm32-unknown-unknown/release/sat_core.wasm'),
  path.resolve(__dirname, '../../sat-core/target/wasm32-unknown-unknown/release/sat_core.wasm'),
];

const wasmSource = candidates.find(p => fs.existsSync(p));
const destDir = path.resolve(__dirname, '../src/wasm');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

if (!wasmSource) {
  console.error(`❌ WASM source not found in candidates:\n${candidates.join('\n')}`);
  process.exit(1);
}

const wasmBytes = fs.readFileSync(wasmSource);
fs.writeFileSync(path.join(destDir, 'sat_core.wasm'), wasmBytes);

const base64Wasm = wasmBytes.toString('base64');
const tsContent = `// Auto-generated from sat_core.wasm
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
