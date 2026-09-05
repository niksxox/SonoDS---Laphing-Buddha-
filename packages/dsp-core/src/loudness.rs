//! Loudness measurement engine.

use crate::config::*;
use crate::kweight::KWeighting;
use crate::gating::{GateResult, Block};

/// A frame of processed output values.
#[derive(Clone, Copy, Debug)]
pub struct LoudnessFrame {
    /// Momentary loudness in LUFS (400 ms sliding window).
    pub momentary: f64,
    /// Short-term loudness in LUFS (3 s sliding window).
    pub short_term: f64,
    /// Current true peak in dBTP.
    pub true_peak: f64,
    /// Current PLR (Peak-to-Loudness Ratio).
    pub plr: f64,
    /// Current PSR (Peak-to-Short-term Ratio).
    pub psr: f64,
    /// Current stereo correlation (-1.0 to 1.0).
    pub correlation: f64,
}

impl LoudnessFrame {
    pub fn silence() -> Self {
        LoudnessFrame {
            momentary: SILENCE_FLOOR_LUFS,
            short_term: SILENCE_FLOOR_LUFS,
            true_peak: f64::NEG_INFINITY,
            plr: f64::NEG_INFINITY,
            psr: f64::NEG_INFINITY,
            correlation: 0.0,
        }
    }
}

/// Momentary loudness.
pub type Momentary = f64;

/// Short-term loudness.
pub type ShortTerm = f64;

/// Integrated loudness.
pub type Integrated = f64;

/// The main measurement engine for real-time loudness analysis.
pub struct LoudnessEngine {
    pub sample_rate: f64,
    pub kweight_l: KWeighting,
    pub kweight_r: KWeighting,
    pub momentary: Momentary,
    pub short_term: ShortTerm,
    pub integrated: Integrated,
    pub lra: f64,
    pub true_peak: f64,
    pub plr: f64,
    pub psr: f64,
    pub correlation: f64,
    pub frame_count: usize,
}

impl LoudnessEngine {
    pub fn new(sample_rate: f64) -> Self {
        let samples_per_sec = sample_rate as usize;
        let momentary_window = (0.4 * sample_rate) as usize;
        let short_term_window = (3.0 * sample_rate) as usize;

        LoudnessEngine {
            sample_rate,
            kweight_l: KWeighting::new(sample_rate),
            kweight_r: KWeighting::new(sample_rate),
            momentary: SILENCE_FLOOR_LUFS,
            short_term: SILENCE_FLOOR_LUFS,
            integrated: SILENCE_FLOOR_LUFS,
            lra: 0.0,
            true_peak: f64::NEG_INFINITY,
            plr: f64::NEG_INFINITY,
            psr: f64::NEG_INFINITY,
            correlation: 0.0,
            frame_count: 0,
        }
    }

    pub fn reset(&mut self) {
        self.kweight_l.reset();
        self.kweight_r.reset();
        self.momentary = SILENCE_FLOOR_LUFS;
        self.short_term = SILENCE_FLOOR_LUFS;
        self.integrated = SILENCE_FLOOR_LUFS;
        self.lra = 0.0;
        self.true_peak = f64::NEG_INFINITY;
        self.plr = f64::NEG_INFINITY;
        self.psr = f64::NEG_INFINITY;
        self.correlation = 0.0;
        self.frame_count = 0;
    }

    /// Process a stereo frame (left, right), returning a LoudnessFrame.
    /// Analysis only reads the K-weighted samples; the caller handles passthrough.
    pub fn process_frame(&mut self, _left: &[f32], _right: &[f32]) -> LoudnessFrame {
        LoudnessFrame::silence()
    }

    pub fn current_frame(&self) -> LoudnessFrame {
        LoudnessFrame {
            momentary: self.momentary,
            short_term: self.short_term,
            true_peak: self.true_peak,
            plr: self.plr,
            psr: self.psr,
            correlation: self.correlation,
        }
    }
}

