//! Configuration constants for ITU-R BS.1770-4 compliance.

/// BS.1770-4 reference: a full-scale 1 kHz sine tone at 0 dBFS
/// (peak amplitude = 1.0) must report approximately -3.01 LUFS.
pub const SINE_CALIBRATION_LUFS: f64 = -3.01;

/// Momentary loudness window in samples at 48 kHz (0.4 s).
pub const MOMENTARY_WINDOW_SAMPLES_48: usize = 1920;

/// Short-term loudness window in samples at 48 kHz (3.0 s).
pub const SHORT_TERM_WINDOW_SAMPLES_48: usize = 14400;

/// Gating block size in samples at 48 kHz (0.4 s).
pub const GATE_BLOCK_SAMPLES_48: usize = 1920;

/// Step interval for updating momentary / short-term windows (100 ms at 48 kHz).
pub const GATE_STEP_SAMPLES_48: usize = 480;

/// Absolute gate threshold: -70 LUFS (BS.1770-4 §3.3).
pub const ABSOLUTE_GATE_LUFS: f64 = -70.0;

/// Relative gate offset: 10 LU below the gated mean (BS.1770-4 §3.4).
pub const RELATIVE_GATE_OFFSET_LU: f64 = -10.0;

/// LRA absolute gate threshold: -70 LUFS.
pub const LRA_ABSOLUTE_GATE_LUFS: f64 = -70.0;

/// LRA relative gate offset: 20 LU below the gated mean.
pub const LRA_RELATIVE_GATE_OFFSET_LU: f64 = -20.0;

/// LRA low-frequency percentile.
pub const LRA_PERCENTILE_LOW: f64 = 10.0;

/// LRA high-frequency percentile.
pub const LRA_PERCENTILE_HIGH: f64 = 95.0;

/// True-peak oversampling factor per BS.1770-4 Annex 2.
pub const TRUE_PEAK_OSR: usize = 4;

/// BS.1770-4 loudness conversion constant: -0.691 + 10*log10(mean_square).
pub const LUFS_OFFSET: f64 = -0.691;

/// Decibels-to-amplitude constant for K-weighting high-shelf.
/// Stage 1 boost: +4.34 dB at high frequencies.
pub const KWEIGHT_HIGHSHELF_DB: f64 = 4.34;

/// K-weighting Stage 1 high-shelf cutoff (Hz).
pub const KWEIGHT_HIGHSHELF_FC: f64 = 1681.17;

/// K-weighting Stage 1 high-shelf Q.
pub const KWEIGHT_HIGHSHELF_Q: f64 = 0.093;

/// K-weighting Stage 2 high-pass ("RLB weight").
/// Cutoff: —14.56 dB at 38 Hz and below, Q = 0.561.
pub const KWEIGHT_HIGHPASS_FC: f64 = 38.135;

/// K-weighting Stage 2 high-pass Q.
pub const KWEIGHT_HIGHPASS_Q: f64 = 0.561;

/// Default sample rate for coefficient derivation.
pub const DEFAULT_SAMPLE_RATE: f64 = 48000.0;

/// Minimum representable loudness floor (for silent input display).
pub const SILENCE_FLOOR_LUFS: f64 = -70.0;

