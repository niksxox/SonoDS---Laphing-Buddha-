import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadWasmModule, ImagerEngineWasm } from '../src/loader';

describe('WASM DSP Core Module Loader (Task 2.1)', () => {
  beforeAll(async () => {
    // Read local WASM binary from pkg directory
    const wasmPath = path.resolve(__dirname, '../pkg/dsp_core_bg.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);
    await loadWasmModule(wasmBuffer);
  });

  it('loads WASM module and instantiates ImagerEngineWasm', () => {
    const engine = new ImagerEngineWasm(44100.0);
    expect(engine).toBeDefined();

    // Call exported telemetry function
    const corr = engine.overall_correlation();
    expect(corr).toBe(1.0);
  });

  it('configures per-band controls on WASM engine', () => {
    const engine = new ImagerEngineWasm(48000.0);
    engine.set_num_bands(4);
    engine.set_crossovers(140.0, 1500.0, 6000.0);
    engine.set_band_width(0, 0.0); // Mono bass
    engine.set_band_width(1, 1.5); // Widened mid

    expect(engine.band_width(0)).toBe(0.0);
    expect(engine.band_width(1)).toBe(1.5);
  });
});
