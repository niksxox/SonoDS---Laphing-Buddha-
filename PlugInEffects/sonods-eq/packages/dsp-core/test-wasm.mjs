import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmPath = path.resolve(__dirname, 'target/wasm32-unknown-unknown/release/sonods_dsp_core.wasm');
const wasmBytes = fs.readFileSync(wasmPath);

const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exp = instance.exports;

console.log('✅ WebAssembly module instantiated successfully!');
console.log('Memory buffer byte length:', exp.memory.buffer.byteLength);

const enginePtr = exp.create_engine(48000.0);
if (!enginePtr) {
  throw new Error('Failed to create engine');
}
console.log('✅ Engine instance created at:', enginePtr);

// Set Band 0: Bell at 1000Hz, +6dB, Q=1.0, enabled=1
exp.set_band(enginePtr, 0, 0, 1000.0, 6.0, 1.0, 1);

// Test magnitude response calculation
const numFreqs = 3;
const freqsPtr = exp.allocate_f64_buffer(numFreqs);
const outPtr = exp.allocate_f64_buffer(numFreqs);

const freqs = new Float64Array(exp.memory.buffer, freqsPtr, numFreqs);
freqs[0] = 20.0;
freqs[1] = 1000.0;
freqs[2] = 20000.0;

exp.get_magnitude_response(enginePtr, freqsPtr, outPtr, numFreqs);
const mags = new Float64Array(exp.memory.buffer, outPtr, numFreqs);

console.log(`Magnitude response: 20Hz=${mags[0].toFixed(2)}dB, 1000Hz=${mags[1].toFixed(2)}dB, 20kHz=${mags[2].toFixed(2)}dB`);

if (Math.abs(mags[1] - 6.0) > 0.1) {
  throw new Error(`Expected 1000Hz magnitude to be ~6.0dB, got ${mags[1]}dB`);
}

// Test process_block
const blockSize = 128;
const leftPtr = exp.allocate_f32_buffer(blockSize);
const rightPtr = exp.allocate_f32_buffer(blockSize);

const leftView = new Float32Array(exp.memory.buffer, leftPtr, blockSize);
const rightView = new Float32Array(exp.memory.buffer, rightPtr, blockSize);

for (let i = 0; i < blockSize; i++) {
  leftView[i] = 0.5;
  rightView[i] = 0.5;
}

exp.process_block(enginePtr, leftPtr, rightPtr, blockSize);

console.log(`Processed block of ${blockSize} samples. Sample 0: left=${leftView[0]}, right=${rightView[0]}`);

exp.deallocate_f64_buffer(freqsPtr, numFreqs);
exp.deallocate_f64_buffer(outPtr, numFreqs);
exp.deallocate_f32_buffer(leftPtr, blockSize);
exp.deallocate_f32_buffer(rightPtr, blockSize);
exp.destroy_engine(enginePtr);

console.log('🎉 Task 1.9 Node WASM smoke test PASSED!');
