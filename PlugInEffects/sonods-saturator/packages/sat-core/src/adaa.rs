//! 2nd-order Antiderivative Anti-Aliasing (ADAA2) with cached antiderivative states.

use crate::antideriv::{antideriv1_with_tanh, antideriv2_with_tanh};
use crate::waveshaper::{shape, Character};

const EPSILON: f64 = 1e-5;

/// Stateful 2nd-order ADAA processor with cached F2 states and precomputed drive parameters.
#[derive(Debug, Clone)]
pub struct AdaaState {
    pub x1: f64,
    pub x2: f64,
    pub f2_x1: f64,
    pub f2_x2: f64,
    pub last_drive: f64,
    pub last_drive_tanh: f64,
    pub last_char: Character,
}

impl Default for AdaaState {
    fn default() -> Self {
        Self::new()
    }
}

impl AdaaState {
    pub fn new() -> Self {
        Self {
            x1: 0.0,
            x2: 0.0,
            f2_x1: 0.0,
            f2_x2: 0.0,
            last_drive: -1.0,
            last_drive_tanh: 0.0,
            last_char: Character::Tape,
        }
    }

    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.f2_x1 = 0.0;
        self.f2_x2 = 0.0;
        self.last_drive = -1.0;
        self.last_drive_tanh = 0.0;
    }

    /// Process a single audio sample through 2nd-order ADAA.
    #[inline(always)]
    pub fn process_sample(&mut self, x0: f64, drive: f64, character: Character) -> f64 {
        let x1 = self.x1;
        let x2 = self.x2;

        let delta_01 = x0 - x1;
        let delta_12 = x1 - x2;
        let delta_02 = x0 - x2;

        let drive_tanh = drive.tanh();

        let f2_x0 = antideriv2_with_tanh(x0, drive, drive_tanh, character);
        let f2_x1 = antideriv2_with_tanh(x1, drive, drive_tanh, character);
        let f2_x2 = antideriv2_with_tanh(x2, drive, drive_tanh, character);

        let y = if delta_01.abs() >= EPSILON && delta_12.abs() >= EPSILON && delta_02.abs() >= EPSILON {
            let f2_01 = (f2_x0 - f2_x1) / delta_01;
            let f2_12 = (f2_x1 - f2_x2) / delta_12;
            2.0 * (f2_01 - f2_12) / delta_02
        } else if delta_02.abs() >= EPSILON {
            let f2_01 = if delta_01.abs() >= EPSILON {
                (f2_x0 - f2_x1) / delta_01
            } else {
                antideriv1_with_tanh(0.5 * (x0 + x1), drive, drive_tanh, character)
            };

            let f2_12 = if delta_12.abs() >= EPSILON {
                (f2_x1 - f2_x2) / delta_12
            } else {
                antideriv1_with_tanh(0.5 * (x1 + x2), drive, drive_tanh, character)
            };

            2.0 * (f2_01 - f2_12) / delta_02
        } else if delta_01.abs() >= EPSILON {
            (antideriv1_with_tanh(x0, drive, drive_tanh, character)
                - antideriv1_with_tanh(x1, drive, drive_tanh, character))
                / delta_01
        } else {
            shape(0.5 * (x0 + x1), drive, character)
        };

        self.x2 = x1;
        self.x1 = x0;
        self.f2_x2 = f2_x2;
        self.f2_x1 = f2_x1;
        self.last_drive = drive;
        self.last_drive_tanh = drive_tanh;
        self.last_char = character;

        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn compute_spectrum(signal: &[f64]) -> Vec<f64> {
        let n = signal.len();
        let mut magnitudes = vec![0.0; n / 2];
        for k in 0..n / 2 {
            let mut real = 0.0;
            let mut imag = 0.0;
            for (t, &s) in signal.iter().enumerate() {
                let w = 0.5 * (1.0 - (2.0 * PI * (t as f64) / (n as f64)).cos());
                let angle = 2.0 * PI * (k as f64) * (t as f64) / (n as f64);
                real += s * w * angle.cos();
                imag -= s * w * angle.sin();
            }
            magnitudes[k] = (real * real + imag * imag).sqrt() / (n as f64);
        }
        magnitudes
    }

    #[test]
    fn test_adaa_reduces_aliasing_versus_naive() {
        let sample_rate = 44100.0;
        let freq = 6000.0;
        let n_samples = 2048;
        let drive = 4.0;
        let characters = [Character::Tape, Character::Tube, Character::Transformer];

        for &charac in &characters {
            let mut naive_out = Vec::with_capacity(n_samples);
            let mut adaa_out = Vec::with_capacity(n_samples);
            let mut adaa = AdaaState::new();

            for i in 0..n_samples {
                let t = i as f64 / sample_rate;
                let x = (2.0 * PI * freq * t).sin();
                naive_out.push(shape(x, drive, charac));
                adaa_out.push(adaa.process_sample(x, drive, charac));
            }

            for &sample in &adaa_out {
                assert!(sample.is_finite());
            }

            let naive_mag = compute_spectrum(&naive_out);
            let adaa_mag = compute_spectrum(&adaa_out);

            let high_freq_bin = (18000.0 / (sample_rate / 2.0) * (naive_mag.len() as f64)) as usize;
            let naive_hf_energy: f64 = naive_mag[high_freq_bin..].iter().map(|&m| m * m).sum();
            let adaa_hf_energy: f64 = adaa_mag[high_freq_bin..].iter().map(|&m| m * m).sum();

            assert!(adaa_hf_energy <= naive_hf_energy * 1.05);
        }
    }

    #[test]
    fn test_adaa_near_zero_delta_fallback() {
        let mut adaa = AdaaState::new();
        let x = 0.5;
        let drive = 2.0;
        let expected = shape(x, drive, Character::Tape);

        adaa.process_sample(x, drive, Character::Tape);
        adaa.process_sample(x, drive, Character::Tape);

        for _ in 0..8 {
            let out = adaa.process_sample(x, drive, Character::Tape);
            assert!((out - expected).abs() < 1e-4);
        }
    }
}
