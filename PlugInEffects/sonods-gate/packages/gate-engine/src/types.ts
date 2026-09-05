// types.ts for @sonods/gate-engine

export type GateCharacterStyle = 'classic' | 'clean' | 'vocal' | 'guitar';
export type GateProcessingMode = 'gate' | 'upward' | 'ducking';
export type GateDetectorType = 'peak' | 'rms';
export type GateSidechainSource = 'internal' | 'external';
export type GateRoutingMode = 'stereo' | 'midside' | 'leftright';

export interface GateState {
  threshold: number;      // -60.0 to 0.0 dB
  range: number;          // -60.0 to +24.0 dB
  ratio: number;          // 1.0 to 100.0
  knee: number;           // 0.0 to 24.0 dB
  attack: number;         // in seconds (e.g. 0.002 = 2ms)
  hold: number;           // in seconds (e.g. 0.020 = 20ms)
  release: number;        // in seconds (e.g. 0.150 = 150ms)
  lookahead: number;      // in seconds (0.0 to 0.010 = 0 to 10ms)
  style: GateCharacterStyle;
  mode: GateProcessingMode;
  detectorMode: GateDetectorType;
  sidechainSource: GateSidechainSource;
  sidechainListen: boolean;
  sidechainHpf: number;   // 10.0 to 20000.0 Hz
  sidechainLpf: number;   // 10.0 to 20000.0 Hz
  stereoLink: number;     // 0.0 to 1.0
  routingMode: GateRoutingMode;
  mix: number;            // 0.0 to 1.0
  outputGain: number;     // -24.0 to +24.0 dB
  midiForceOpen: boolean;
}

export interface GateTelemetryFrame {
  inputDb: number;
  detectedDb: number;
  outputDb: number;
  grDb: number;
  state: 'closed' | 'attacking' | 'open' | 'holding' | 'releasing';
}

export interface GateDspExports {
  gate_core_version: () => number;
  create_gate: (sampleRate: number) => number;
  destroy_gate: (ptr: number) => void;
  set_sample_rate: (ptr: number, sampleRate: number) => void;
  set_threshold: (ptr: number, thresholdDb: number) => void;
  set_range: (ptr: number, rangeDb: number) => void;
  set_ratio: (ptr: number, ratio: number) => void;
  set_knee: (ptr: number, kneeDb: number) => void;
  set_attack: (ptr: number, attackS: number) => void;
  set_hold: (ptr: number, holdS: number) => void;
  set_release: (ptr: number, releaseS: number) => void;
  set_lookahead: (ptr: number, lookaheadS: number) => void;
  set_style: (ptr: number, styleId: number) => void;
  set_mode: (ptr: number, modeId: number) => void;
  set_detector_mode: (ptr: number, modeId: number) => void;
  set_sidechain_source: (ptr: number, sourceId: number) => void;
  set_sidechain_listen: (ptr: number, listen: number) => void;
  set_sidechain_hpf: (ptr: number, freqHz: number) => void;
  set_sidechain_lpf: (ptr: number, freqHz: number) => void;
  set_stereo_link: (ptr: number, link: number) => void;
  set_mix: (ptr: number, mix: number) => void;
  set_output_gain: (ptr: number, gainDb: number) => void;
  set_midi_force_open: (ptr: number, force: number) => void;
  get_latency_samples: (ptr: number) => number;
  get_telemetry_frame: (ptr: number, outPtr: number) => void;
  process_block: (ptr: number, leftPtr: number, rightPtr: number, scLeftPtr: number, scRightPtr: number, len: number) => void;
  allocate_f32_buffer: (len: number) => number;
  deallocate_f32_buffer: (ptr: number, len: number) => void;
}
