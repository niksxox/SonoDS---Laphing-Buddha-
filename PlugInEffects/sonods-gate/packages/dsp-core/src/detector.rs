//! Level detector (Peak / RMS, dB domain) per Task 1.2.
//!
//! Floor convention: -60.0 dB for signals <= 1e-5 (or clean log10 conversion).

use crate::denormals::flush_denormal;

pub const DB_FLOOR: f64 = -60.0;
pub const LINEAR_FLOOR: f64 = 1e-5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DetectorMode {
    Peak,
    Rms,
}

#[derive(Debug, Clone)]
pub struct EnvelopeDetector {
    mode: DetectorMode,
    sample_rate: f64,
    rms_alpha: f64,
    rms_mean_sq: f64,
}

impl EnvelopeDetector {
    /// Creates a new EnvelopeDetector with sample rate, detector mode, and window length in seconds.
    pub fn new(sample_rate: f64, mode: DetectorMode, window_seconds: f64) -> Self {
        let alpha = (-1.0 / (sample_rate * window_seconds.max(1e-5))).exp();
        Self {
            mode,
            sample_rate: sample_rate.max(1.0),
            rms_alpha: alpha,
            rms_mean_sq: 0.0,
        }
    }

    pub fn set_mode(&mut self, mode: DetectorMode) {
        self.mode = mode;
    }

    pub fn mode(&self) -> DetectorMode {
        self.mode
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64, window_seconds: f64) {
        self.sample_rate = sample_rate.max(1.0);
        self.rms_alpha = (-1.0 / (self.sample_rate * window_seconds.max(1e-5))).exp();
    }

    pub fn reset(&mut self) {
        self.rms_mean_sq = 0.0;
    }

    /// Converts linear amplitude to dB with standard -60 dB floor.
    #[inline(always)]
    pub fn linear_to_db(level_linear: f64) -> f64 {
        if level_linear > LINEAR_FLOOR {
            20.0 * level_linear.log10()
        } else {
            DB_FLOOR
        }
    }

    /// Process a single sample and return the detected level in linear domain.
    #[inline]
    pub fn process_sample_linear(&mut self, sample: f64) -> f64 {
        match self.mode {
            DetectorMode::Peak => sample.abs(),
            DetectorMode::Rms => {
                let sq = sample * sample;
                self.rms_mean_sq = flush_denormal(self.rms_alpha * self.rms_mean_sq + (1.0 - self.rms_alpha) * sq);
                self.rms_mean_sq.sqrt()
            }
        }
    }

    /// Process a single sample and return detected level in dB domain.
    #[inline]
    pub fn process_sample_db(&mut self, sample: f64) -> f64 {
        let linear = self.process_sample_linear(sample);
        Self::linear_to_db(linear)
    }

    /// Process a block of samples and return the detected block level in dB domain.
    pub fn process_block_db(&mut self, block: &[f64]) -> f64 {
        if block.is_empty() {
            return DB_FLOOR;
        }

        match self.mode {
            DetectorMode::Peak => {
                let mut peak = 0.0f64;
                for &s in block {
                    let abs = s.abs();
                    if abs > peak {
                        peak = abs;
                    }
                }
                Self::linear_to_db(peak)
            }
            DetectorMode::Rms => {
                let mut sum_sq = 0.0f64;
                for &s in block {
                    sum_sq += s * s;
                }
                let rms = (sum_sq / block.len() as f64).sqrt();
                Self::linear_to_db(rms)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_sine_peak_level_reading() {
        let sample_rate = 44100.0;
        let mut detector = EnvelopeDetector::new(sample_rate, DetectorMode::Peak, 0.010);

        // Sine wave at 1000 Hz with peak amplitude 0.5 (-6.0206 dB)
        let amp = 0.5;
        let freq = 1000.0;
        let block_size = 512;
        let mut block = vec![0.0f64; block_size];
        for (i, sample) in block.iter_mut().enumerate() {
            *sample = amp * (2.0 * PI * freq * (i as f64) / sample_rate).sin();
        }

        let db = detector.process_block_db(&block);
        let expected_db = 20.0 * amp.log10(); // -6.0205999...
        assert!(
            (db - expected_db).abs() < 0.1,
            "Expected ~{:.2} dB, got {:.2} dB",
            expected_db,
            db
        );
    }

    #[test]
    fn test_sine_rms_level_reading() {
        let sample_rate = 44100.0;
        let mut detector = EnvelopeDetector::new(sample_rate, DetectorMode::Rms, 0.010);

        // Pure sine wave with amplitude 1.0 (0 dB Peak) -> RMS is 1.0 / sqrt(2) = 0.7071 (-3.0103 dB)
        let amp = 1.0;
        let freq = 1000.0;
        // Take integer number of cycles: 44.1 samples per cycle -> 4410 samples = 100 cycles
        let total_samples = 4410;
        let mut block = vec![0.0f64; total_samples];
        for (i, sample) in block.iter_mut().enumerate() {
            *sample = amp * (2.0 * PI * freq * (i as f64) / sample_rate).sin();
        }

        let db = detector.process_block_db(&block);
        let expected_db = 20.0 * (amp / 2.0f64.sqrt()).log10(); // -3.0103 dB
        assert!(
            (db - expected_db).abs() < 0.1,
            "Expected ~{:.2} dB, got {:.2} dB",
            expected_db,
            db
        );
    }

    #[test]
    fn test_silence_clamps_to_db_floor() {
        let mut detector = EnvelopeDetector::new(44100.0, DetectorMode::Peak, 0.010);
        let block = vec![0.0f64; 128];
        let db = detector.process_block_db(&block);
        assert_eq!(db, DB_FLOOR);
    }
}
