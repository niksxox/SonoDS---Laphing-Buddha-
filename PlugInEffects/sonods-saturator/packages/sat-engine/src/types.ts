// types.ts

export type CharacterType = 'tape' | 'tube' | 'transformer';
export type QualityType = 'standard' | 'high';

export interface SaturatorState {
  drive: number;        // 0.0 to 1.0 (mapped to 0..10.0 in DSP)
  tone: number;         // -12.0 to +12.0 dB
  character: CharacterType;
  mix: number;          // 0.0 (dry) to 1.0 (wet)
  outputGain: number;   // -24.0 to +24.0 dB
  autoGain: boolean;
  quality: QualityType;
  sampleRate: number;
}

export interface DspExports {
  memory: WebAssembly.Memory;
  create_saturator(sample_rate: number): number;
  destroy_saturator(ptr: number): void;
  set_sample_rate(ptr: number, sample_rate: number): void;
  set_drive(ptr: number, drive: number): void;
  set_tone(ptr: number, tone_db: number): void;
  set_character(ptr: number, char_id: number): void;
  set_mix(ptr: number, mix: number): void;
  set_output_gain(ptr: number, gain_db: number): void;
  set_auto_gain(ptr: number, enabled_val: number): void;
  set_quality(ptr: number, quality_id: number): void;
  get_latency_samples(ptr: number): number;
  process_block(ptr: number, left_ptr: number, right_ptr: number, len: number): void;
  get_transfer_curve(ptr: number, in_ptr: number, out_ptr: number, len: number): void;
  allocate_f32_buffer(len: number): number;
  deallocate_f32_buffer(ptr: number, len: number): void;
  allocate_f64_buffer(len: number): number;
  deallocate_f64_buffer(ptr: number, len: number): void;
}

export enum ParamId {
  Drive = 0,
  Tone = 1,
  Character = 2,
  Mix = 3,
  OutputGain = 4,
  AutoGain = 5,
  Quality = 6,
}
