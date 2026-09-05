// types.ts
// Type definitions for @sonods/comp-engine

export type CompressorCharacterType = 'vca' | 'opto' | 'fet';

export interface CompressorState {
  threshold: number;      // -60.0 to 0.0 dB
  ratio: number;          // 1.0 to 30.0
  attack: number;         // 0.00005 to 0.5 s (50µs to 500ms)
  release: number;        // 0.005 to 2.5 s (5ms to 2.5s)
  knee: number;           // 0.0 to 24.0 dB
  link: number;           // 0.0 (dual mono) to 1.0 (100% linked)
  mix: number;            // 0.0 (dry) to 1.0 (wet)
  outputGain: number;     // -24.0 to +24.0 dB
  autoGain: number;       // 0.0 to 1.0
  sidechainHpf: number;   // 20.0 to 500.0 Hz
  lookahead: number;      // 0.0 to 0.010 s (0 to 10ms)
  character: CompressorCharacterType;
  sampleRate: number;
}

export interface CompressorTelemetryFrame {
  inputDb: number;
  detectedDb: number;
  outputDb: number;
  grDb: number;
}

export interface DspExports {
  memory: WebAssembly.Memory;
  create_compressor(sample_rate: number): number;
  destroy_compressor(ptr: number): void;
  set_sample_rate(ptr: number, sample_rate: number): void;
  set_threshold(ptr: number, threshold_db: number): void;
  set_ratio(ptr: number, ratio: number): void;
  set_attack(ptr: number, attack_s: number): void;
  set_release(ptr: number, release_s: number): void;
  set_knee(ptr: number, knee_db: number): void;
  set_stereo_link(ptr: number, link: number): void;
  set_mix(ptr: number, mix: number): void;
  set_output_gain(ptr: number, gain_db: number): void;
  set_auto_gain(ptr: number, amount: number): void;
  set_sidechain_hpf(ptr: number, cutoff_hz: number): void;
  set_lookahead(ptr: number, lookahead_s: number): void;
  set_character(ptr: number, char_id: number): void;
  get_gain_reduction_db(ptr: number): number;
  get_input_level_db(ptr: number): number;
  get_detected_level_db(ptr: number): number;
  get_output_level_db(ptr: number): number;
  get_telemetry_frame(ptr: number, out_ptr: number): void;
  process_block(ptr: number, left_ptr: number, right_ptr: number, len: number): void;
  allocate_f32_buffer(len: number): number;
  deallocate_f32_buffer(ptr: number, len: number): void;
}

export enum ParamId {
  Threshold = 0,
  Ratio = 1,
  Attack = 2,
  Release = 3,
  Knee = 4,
  Link = 5,
  Mix = 6,
  OutputGain = 7,
  AutoGain = 8,
  SidechainHpf = 9,
  Lookahead = 10,
  Character = 11,
}
