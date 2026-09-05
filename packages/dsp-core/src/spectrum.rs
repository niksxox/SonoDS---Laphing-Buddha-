//! Spectrum analysis (FFT magnitude) reused from EQ/Reverb pattern.

use crate::config::*;

const FFT_SIZE: usize = 4096;

/// A simple real-FFT spectrum analyzer producing log-magnitude bins.
pub struct SpectrumAnalyzer {
    pub sample_rate: f64,
    pub fft_size: usize,
    pub window: Vec<f32>,
    pub overlap: usize,
}

impl SpectrumAnalyzer {
    pub fn new(sample_rate: f64) -> Self {
        let fft_size = FFT_SIZE;
        let mut window = Vec::with_capacity(fft_size);
        for i in 0..fft_size {
            // Hann window
            let w = 0.5 * (1.0 - f64::cos(2.0 * core::f64::consts::PI * i as f64 / (fft_size as f64 - 1.0)));
            window.push(w as f32);
        }
        SpectrumAnalyzer {
            sample_rate,
            fft_size,
            window,
            overlap: fft_size / 2,
        }
    }

    /// Compute magnitude spectrum (in dB) from a stereo frame.
    pub fn compute_spectrum(&self, left: &[f32], right: &[f32]) -> Vec<f32> {
        if left.len() < self.fft_size {
            return vec![0.0; self.fft_size / 2 + 1];
        }
        let mut buf = vec![0.0f32; self.fft_size];
        for i in 0..self.fft_size {
            let avg = (left[i] + right[i]) * 0.5;
            buf[i] = avg * self.window[i];
        }
        // Naive DFT (will be replaced with proper FFT)
        let n_bins = self.fft_size / 2 + 1;
        let mut spectrum = vec![0.0f32; n_bins];
        for k in 0..n_bins {
            let mut sum_re = 0.0f64;
            let mut sum_im = 0.0f64;
            for n in 0..self.fft_size {
                let phase = -2.0 * core::f64::consts::PI * (k as f64) * (n as f64) / self.fft_size as f64;
                sum_re += buf[n] as f64 * f64::cos(phase);
                sum_im += buf[n] as f64 * f64::sin(phase);
            }
            let mag = (sum_re * sum_re + sum_im * sum_im).sqrt() / (self.fft_size as f64 / 2.0);
            spectrum[k] = if mag > 1e-10 {
                (20.0 * f64::log10(mag)) as f32
            } else {
                -100.0
            };
        }
        spectrum
    }
}

