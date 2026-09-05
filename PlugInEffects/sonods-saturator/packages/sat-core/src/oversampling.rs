//! Polyphase FIR oversampler (2x and 4x factors) combined with 2nd-order ADAA.

use crate::adaa::AdaaState;
use crate::waveshaper::Character;
use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quality {
    Standard, // 2x oversampling + ADAA2
    High,     // 4x oversampling + ADAA2
}

const TAPS_LEN: usize = 43; // 43 taps halfband FIR (M = 21)
const HALF_M: usize = 21;
const BUFFER_LEN: usize = 64;
const BUFFER_MASK: usize = 63;
const DOWN_BUFFER_LEN: usize = 128;
const DOWN_BUFFER_MASK: usize = 127;

fn bessel_i0(x: f64) -> f64 {
    let mut sum = 1.0;
    let mut term = 1.0;
    let x_half = x / 2.0;
    for k in 1..25 {
        term *= (x_half / k as f64) * (x_half / k as f64);
        sum += term;
        if term < 1e-15 * sum {
            break;
        }
    }
    sum
}

fn compute_halfband_taps() -> [f64; TAPS_LEN] {
    let mut taps = [0.0; TAPS_LEN];
    let beta = 9.0;
    let i0_beta = bessel_i0(beta);
    let m = HALF_M as f64;

    for i in 0..TAPS_LEN {
        let n = i as f64 - m;
        let r = n / m;
        let w = if r.abs() <= 1.0 {
            let val = (1.0 - r * r).max(0.0).sqrt();
            bessel_i0(beta * val) / i0_beta
        } else {
            0.0
        };

        if i == HALF_M {
            taps[i] = 0.5;
        } else if (i as isize - HALF_M as isize) % 2 == 0 {
            taps[i] = 0.0;
        } else {
            let sinc = (PI * n * 0.5).sin() / (PI * n);
            taps[i] = sinc * w;
        }
    }

    let sum: f64 = taps.iter().sum();
    for tap in &mut taps {
        *tap /= sum;
    }
    taps
}

/// Polyphase 2x Half-band Interpolator and Decimator.
#[derive(Debug, Clone)]
pub struct HalfBand2x {
    center_tap: f64,
    even_taps: [(usize, f64); 22],
    pub up_buf: [f64; BUFFER_LEN],
    up_pos: usize,
    pub down_buf: [f64; DOWN_BUFFER_LEN],
    down_pos: usize,
}

impl Default for HalfBand2x {
    fn default() -> Self {
        Self::new()
    }
}

impl HalfBand2x {
    pub fn new() -> Self {
        let taps = compute_halfband_taps();
        let mut even_taps = [(0, 0.0); 22];
        let mut idx = 0;

        for (i, &coef) in taps.iter().enumerate() {
            if i % 2 == 0 && idx < 22 {
                even_taps[idx] = (i, coef);
                idx += 1;
            }
        }

        Self {
            center_tap: taps[HALF_M],
            even_taps,
            up_buf: [0.0; BUFFER_LEN],
            up_pos: 0,
            down_buf: [0.0; DOWN_BUFFER_LEN],
            down_pos: 0,
        }
    }

    pub fn reset(&mut self) {
        self.up_buf.fill(0.0);
        self.up_pos = 0;
        self.down_buf.fill(0.0);
        self.down_pos = 0;
    }

    pub fn latency_samples_1x(&self) -> usize {
        HALF_M / 2
    }

    /// 2x Upsample 1 input sample into 2 oversampled samples.
    #[inline(always)]
    pub fn upsample_2x(&mut self, input: f64) -> (f64, f64) {
        self.up_buf[self.up_pos] = input;

        let delay_idx = (self.up_pos + BUFFER_LEN - (HALF_M / 2)) & BUFFER_MASK;
        let s1 = self.up_buf[delay_idx];

        let mut s0 = 0.0;
        let up_p = self.up_pos + BUFFER_LEN;
        for &(i, coef) in &self.even_taps {
            let k = i / 2;
            let buf_idx = (up_p - k) & BUFFER_MASK;
            s0 += self.up_buf[buf_idx] * (coef * 2.0);
        }

        self.up_pos = (self.up_pos + 1) & BUFFER_MASK;
        (s0, s1)
    }

    /// 2x Downsample 2 oversampled samples into 1 output sample.
    #[inline(always)]
    pub fn downsample_2x(&mut self, s0: f64, s1: f64) -> f64 {
        self.down_buf[self.down_pos] = s0;
        let next_pos = (self.down_pos + 1) & DOWN_BUFFER_MASK;
        self.down_buf[next_pos] = s1;

        let p = next_pos + DOWN_BUFFER_LEN;
        let mut out = self.down_buf[(p - HALF_M) & DOWN_BUFFER_MASK] * self.center_tap;

        for &(i, coef) in &self.even_taps {
            let idx = (p - i) & DOWN_BUFFER_MASK;
            out += self.down_buf[idx] * coef;
        }

        self.down_pos = (next_pos + 1) & DOWN_BUFFER_MASK;
        out
    }
}

/// Unified Saturator Stage with ADAA2 and switchable 2x/4x Oversampling.
#[derive(Debug, Clone)]
pub struct OversampledSaturator {
    pub stage1: HalfBand2x,
    pub stage2: HalfBand2x,
    pub adaa: AdaaState,
}

impl Default for OversampledSaturator {
    fn default() -> Self {
        Self::new()
    }
}

impl OversampledSaturator {
    pub fn new() -> Self {
        Self {
            stage1: HalfBand2x::new(),
            stage2: HalfBand2x::new(),
            adaa: AdaaState::new(),
        }
    }

    pub fn reset(&mut self) {
        self.stage1.reset();
        self.stage2.reset();
        self.adaa.reset();
    }

    pub fn latency_samples(&self, quality: Quality) -> usize {
        match quality {
            Quality::Standard => self.stage1.latency_samples_1x() * 2,
            Quality::High => (self.stage1.latency_samples_1x() + self.stage2.latency_samples_1x() / 2) * 2,
        }
    }

    #[inline(always)]
    pub fn process_sample(
        &mut self,
        input: f64,
        drive: f64,
        character: Character,
        quality: Quality,
    ) -> f64 {
        match quality {
            Quality::Standard => {
                let (u0, u1) = self.stage1.upsample_2x(input);
                let y0 = self.adaa.process_sample(u0, drive, character);
                let y1 = self.adaa.process_sample(u1, drive, character);
                self.stage1.downsample_2x(y0, y1)
            }
            Quality::High => {
                let (u0, u1) = self.stage1.upsample_2x(input);
                let (u00, u01) = self.stage2.upsample_2x(u0);
                let (u10, u11) = self.stage2.upsample_2x(u1);

                let y00 = self.adaa.process_sample(u00, drive, character);
                let y01 = self.adaa.process_sample(u01, drive, character);
                let y10 = self.adaa.process_sample(u10, drive, character);
                let y11 = self.adaa.process_sample(u11, drive, character);

                let d0 = self.stage2.downsample_2x(y00, y01);
                let d1 = self.stage2.downsample_2x(y10, y11);
                self.stage1.downsample_2x(d0, d1)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compute_fft_db(signal: &[f64]) -> Vec<f64> {
        let n = signal.len();
        let mut dbs = vec![-140.0; n / 2];
        for k in 0..n / 2 {
            let mut real = 0.0;
            let mut imag = 0.0;
            for (t, &s) in signal.iter().enumerate() {
                let a0 = 0.35875;
                let a1 = 0.48829;
                let a2 = 0.14128;
                let a3 = 0.01168;
                let theta = 2.0 * PI * (t as f64) / (n as f64);
                let w = a0 - a1 * theta.cos() + a2 * (2.0 * theta).cos() - a3 * (3.0 * theta).cos();
                let angle = 2.0 * PI * (k as f64) * (t as f64) / (n as f64);
                real += s * w * angle.cos();
                imag -= s * w * angle.sin();
            }
            let mag = (real * real + imag * imag).sqrt() / (n as f64);
            dbs[k] = 20.0 * (mag.max(1e-12)).log10();
        }
        dbs
    }

    #[test]
    fn test_halfband_filter_stopband_rejection() {
        let mut filter = HalfBand2x::new();
        let n = 2048;
        let mut out = Vec::with_capacity(n);

        for i in 0..n {
            let s0 = (2.0 * PI * 0.48 * (2.0 * i as f64)).sin();
            let s1 = (2.0 * PI * 0.48 * (2.0 * i as f64 + 1.0)).sin();
            out.push(filter.downsample_2x(s0, s1));
        }

        let steady_out = &out[100..];
        let max_amp = steady_out.iter().map(|s| s.abs()).fold(0.0f64, f64::max);
        assert!(max_amp < 1.5);
    }

    #[test]
    fn test_two_tone_alias_suppression_50db() {
        let sample_rate = 44100.0;
        let f1 = 7000.0;
        let f2 = 8000.0;
        let drive = 5.0;
        let n_samples = 4096;

        for &quality in &[Quality::Standard, Quality::High] {
            for &character in &[Character::Tape, Character::Tube, Character::Transformer] {
                let mut sat = OversampledSaturator::new();
                let mut output = Vec::with_capacity(n_samples);

                for i in 0..n_samples {
                    let t = i as f64 / sample_rate;
                    let x = 0.5 * (2.0 * PI * f1 * t).sin() + 0.5 * (2.0 * PI * f2 * t).sin();
                    let y = sat.process_sample(x, drive, character, quality);
                    output.push(y);
                }

                let steady_signal = &output[512..];
                let spectrum_db = compute_fft_db(steady_signal);

                let fund_bin1 = ((f1 / (sample_rate / 2.0)) * (spectrum_db.len() as f64)).round() as usize;
                let fund_bin2 = ((f2 / (sample_rate / 2.0)) * (spectrum_db.len() as f64)).round() as usize;
                let fund_level = spectrum_db[fund_bin1].max(spectrum_db[fund_bin2]);

                let alias_bin = ((16100.0 / (sample_rate / 2.0)) * (spectrum_db.len() as f64)).round() as usize;
                let alias_level = spectrum_db[alias_bin - 2..=alias_bin + 2]
                    .iter()
                    .cloned()
                    .fold(-140.0f64, f64::max);

                let rejection = fund_level - alias_level;
                assert!(
                    rejection >= 50.0,
                    "Alias rejection failed for {:?} at {:?}: got {:.2} dB (fund={:.2} dB, alias={:.2} dB), expected >= 50.0 dB",
                    character,
                    quality,
                    rejection,
                    fund_level,
                    alias_level
                );
            }
        }
    }
}
