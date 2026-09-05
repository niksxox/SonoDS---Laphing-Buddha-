/**
 * @sonods/reverb-engine
 *
 * TypeScript engine layer for the SonoDS Reverb plugin.
 * Handles WASM loading, AudioWorklet integration, tempo sync,
 * preset management, MIDI Learn, and telemetry.
 */

export const ENGINE_VERSION = '0.1.0';

export { ReverbEngine } from './ReverbEngine';
export type { ReverbPreset } from './ReverbEngine';

export { FACTORY_PRESETS, exportPresetToJson, importPresetFromJson, searchPresets } from './presets';
export { TelemetryStream } from './telemetry';
export type { TelemetryData, TelemetryListener } from './telemetry';
export { MidiLearn } from './midi';
export type { MidiCcMapping, MidiLearnOptions } from './midi';
