export enum Shape {
  Bell = 0,
  LowShelf = 1,
  HighShelf = 2,
  LowCut = 3,
  HighCut = 4,
}

export enum CutSlope {
  Db12 = 12,
  Db24 = 24,
  Db48 = 48,
  Db96 = 96,
}

export enum PhaseMode {
  ZeroLatency = 0,
  NaturalPhase = 1,
  LinearPhase = 2,
}

export enum ProcessingMode {
  Stereo = 0,
  Mid = 1,
  Side = 2,
  Left = 3,
  Right = 4,
}

export enum ParamId {
  Freq = 0,
  Gain = 1,
  Q = 2,
  Shape = 3,
  Slope = 4,
  Enabled = 5,
  Mode = 6,
  DynamicEnabled = 7,
  DynamicThreshold = 8,
  DynamicRange = 9,
}

export interface BandState {
  id: number;
  index: number;
  shape: Shape;
  slope: CutSlope;
  freq: number;
  gain: number;
  q: number;
  enabled: boolean;
  mode: ProcessingMode;
  dynamicEnabled: boolean;
  dynamicThreshold: number;
  dynamicRange: number;
}

export interface EqState {
  bands: BandState[];
  phaseMode: PhaseMode;
  sampleRate: number;
}

export interface DspExports {
  memory: WebAssembly.Memory;
  create_engine: (sampleRate: number) => number;
  destroy_engine: (ptr: number) => void;
  set_sample_rate: (ptr: number, sampleRate: number) => void;
  set_phase_mode: (ptr: number, mode: number) => void;
  set_band: (ptr: number, index: number, shape: number, freq: number, gain: number, q: number, enabled: number) => void;
  snap_band?: (ptr: number, index: number, shape: number, freq: number, gain: number, q: number, enabled: number) => void;
  clear_bands?: (ptr: number) => void;
  remove_band: (ptr: number, index: number) => void;
  set_band_param: (ptr: number, bandIndex: number, paramId: number, value: number) => void;
  process_block: (ptr: number, leftPtr: number, rightPtr: number, len: number) => void;
  get_magnitude_response: (ptr: number, freqsPtr: number, outPtr: number, len: number) => void;
  get_band_magnitude_response: (ptr: number, bandIndex: number, freqsPtr: number, outPtr: number, len: number) => void;
  get_latency_samples: (ptr: number) => number;
  allocate_f32_buffer: (len: number) => number;
  deallocate_f32_buffer: (ptr: number, len: number) => void;
  allocate_f64_buffer: (len: number) => number;
  deallocate_f64_buffer: (ptr: number, len: number) => void;
}

export const MAX_BANDS = 12;
export const PARAMS_PER_BAND = 10;
