use std::f64::consts::PI;
use crate::biquad::{Biquad, BiquadCoeffs};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Shape {
    Bell,
    LowShelf,
    HighShelf,
    LowCut,  // High Pass
    HighCut, // Low Pass
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CutSlope {
    Db12, // 1 section (2nd order)
    Db24, // 2 sections (4th order)
    Db48, // 4 sections (8th order)
    Db96, // 8 sections (16th order)
}

impl CutSlope {
    pub fn num_sections(&self) -> usize {
        match self {
            CutSlope::Db12 => 1,
            CutSlope::Db24 => 2,
            CutSlope::Db48 => 4,
            CutSlope::Db96 => 8,
        }
    }

    pub fn from_db_per_oct(slope_db: i32) -> Self {
        match slope_db {
            12 => CutSlope::Db12,
            24 => CutSlope::Db24,
            48 => CutSlope::Db48,
            96 => CutSlope::Db96,
            _ => CutSlope::Db12,
        }
    }
}

/// Bell (peaking) filter biquad coefficients
pub fn bell(freq_hz: f64, sample_rate: f64, gain_db: f64, q: f64) -> BiquadCoeffs {
    let freq_clamped = freq_hz.clamp(10.0, sample_rate * 0.499);
    let q_clamped = q.clamp(0.05, 40.0);
    let w0 = 2.0 * PI * freq_clamped / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q_clamped);
    let a = 10f64.powf(gain_db / 40.0);

    let b0 = 1.0 + alpha * a;
    let b1 = -2.0 * cos_w0;
    let b2 = 1.0 - alpha * a;
    let a0 = 1.0 + alpha / a;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha / a;

    BiquadCoeffs::from_raw(b0, b1, b2, a0, a1, a2)
}

/// Low shelf filter biquad coefficients
pub fn low_shelf(freq_hz: f64, sample_rate: f64, gain_db: f64, shelf_slope: f64) -> BiquadCoeffs {
    let freq_clamped = freq_hz.clamp(10.0, sample_rate * 0.499);
    let s = shelf_slope.clamp(0.1, 2.0);
    let w0 = 2.0 * PI * freq_clamped / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let a = 10f64.powf(gain_db / 40.0);

    let beta = ((a + 1.0 / a) * (1.0 / s - 1.0) + 2.0).max(0.0).sqrt();
    let alpha = sin_w0 / 2.0 * beta;
    let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

    let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
    let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
    let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
    let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
    let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
    let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

    BiquadCoeffs::from_raw(b0, b1, b2, a0, a1, a2)
}

/// High shelf filter biquad coefficients
pub fn high_shelf(freq_hz: f64, sample_rate: f64, gain_db: f64, shelf_slope: f64) -> BiquadCoeffs {
    let freq_clamped = freq_hz.clamp(10.0, sample_rate * 0.499);
    let s = shelf_slope.clamp(0.1, 2.0);
    let w0 = 2.0 * PI * freq_clamped / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let a = 10f64.powf(gain_db / 40.0);

    let beta = ((a + 1.0 / a) * (1.0 / s - 1.0) + 2.0).max(0.0).sqrt();
    let alpha = sin_w0 / 2.0 * beta;
    let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

    let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
    let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
    let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
    let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
    let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
    let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

    BiquadCoeffs::from_raw(b0, b1, b2, a0, a1, a2)
}

/// Single high-pass biquad section (12 dB/oct) with specified Q
pub fn high_pass_section(freq_hz: f64, sample_rate: f64, q: f64) -> BiquadCoeffs {
    let freq_clamped = freq_hz.clamp(10.0, sample_rate * 0.499);
    let q_clamped = q.clamp(0.05, 40.0);
    let w0 = 2.0 * PI * freq_clamped / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q_clamped);

    let b0 = (1.0 + cos_w0) / 2.0;
    let b1 = -(1.0 + cos_w0);
    let b2 = (1.0 + cos_w0) / 2.0;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    BiquadCoeffs::from_raw(b0, b1, b2, a0, a1, a2)
}

/// Single low-pass biquad section (12 dB/oct) with specified Q
pub fn low_pass_section(freq_hz: f64, sample_rate: f64, q: f64) -> BiquadCoeffs {
    let freq_clamped = freq_hz.clamp(10.0, sample_rate * 0.499);
    let q_clamped = q.clamp(0.05, 40.0);
    let w0 = 2.0 * PI * freq_clamped / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q_clamped);

    let b0 = (1.0 - cos_w0) / 2.0;
    let b1 = 1.0 - cos_w0;
    let b2 = (1.0 - cos_w0) / 2.0;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    BiquadCoeffs::from_raw(b0, b1, b2, a0, a1, a2)
}

/// Butterworth Q values for an N-th order cascaded filter (N 2nd-order sections)
pub fn butterworth_q_values(num_sections: usize) -> &'static [f64] {
    match num_sections {
        1 => &[0.7071067811865476],
        2 => &[0.541196100146197, 1.3065629648763765],
        3 => &[0.5176380902050415, 0.7071067811865476, 1.9318516525781364],
        4 => &[0.5097955791041591, 0.6013448869350453, 0.8999761750050858, 2.5629154477415055],
        _ => &[0.7071067811865476],
    }
}

/// Cascaded filter chain for steep cut filters
#[derive(Debug, Clone)]
pub struct FilterChain {
    pub sections: Vec<Biquad>,
}

impl FilterChain {
    pub fn new() -> Self {
        Self {
            sections: Vec::new(),
        }
    }

    pub fn high_pass(freq_hz: f64, sample_rate: f64, slope: CutSlope) -> Self {
        let num_sec = slope.num_sections();
        let qs = butterworth_q_values(num_sec);
        let sections = qs
            .iter()
            .map(|&q| Biquad::new(high_pass_section(freq_hz, sample_rate, q)))
            .collect();
        Self { sections }
    }

    pub fn low_pass(freq_hz: f64, sample_rate: f64, slope: CutSlope) -> Self {
        let num_sec = slope.num_sections();
        let qs = butterworth_q_values(num_sec);
        let sections = qs
            .iter()
            .map(|&q| Biquad::new(low_pass_section(freq_hz, sample_rate, q)))
            .collect();
        Self { sections }
    }

    pub fn update_high_pass(&mut self, freq_hz: f64, sample_rate: f64, slope: CutSlope) {
        let num_sec = slope.num_sections();
        let qs = butterworth_q_values(num_sec);
        if self.sections.len() != num_sec {
            self.sections = qs
                .iter()
                .map(|&q| Biquad::new(high_pass_section(freq_hz, sample_rate, q)))
                .collect();
        } else {
            for (sec, &q) in self.sections.iter_mut().zip(qs) {
                sec.set_coeffs(high_pass_section(freq_hz, sample_rate, q));
            }
        }
    }

    pub fn update_low_pass(&mut self, freq_hz: f64, sample_rate: f64, slope: CutSlope) {
        let num_sec = slope.num_sections();
        let qs = butterworth_q_values(num_sec);
        if self.sections.len() != num_sec {
            self.sections = qs
                .iter()
                .map(|&q| Biquad::new(low_pass_section(freq_hz, sample_rate, q)))
                .collect();
        } else {
            for (sec, &q) in self.sections.iter_mut().zip(qs) {
                sec.set_coeffs(low_pass_section(freq_hz, sample_rate, q));
            }
        }
    }

    #[inline(always)]
    pub fn process_sample(&mut self, mut x: f64) -> f64 {
        for sec in &mut self.sections {
            x = sec.process_sample(x);
        }
        x
    }

    pub fn magnitude_db(&self, freq_hz: f64, sample_rate: f64) -> f64 {
        self.sections
            .iter()
            .map(|sec| sec.coeffs.magnitude_db(freq_hz, sample_rate))
            .sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bell_filter_frequency_response() {
        let sample_rate = 48000.0;
        let freq_hz = 1000.0;
        let gain_db = 6.0;
        let q = 1.0;

        let coeffs = bell(freq_hz, sample_rate, gain_db, q);

        // Center frequency magnitude should be within 0.1 dB of +6 dB
        let mag_center = coeffs.magnitude_db(freq_hz, sample_rate);
        assert!(
            (mag_center - 6.0).abs() < 0.1,
            "Expected ~6.0 dB at center, got {}",
            mag_center
        );

        // Far away frequencies should be close to 0 dB
        let mag_20hz = coeffs.magnitude_db(20.0, sample_rate);
        assert!(
            mag_20hz.abs() < 0.1,
            "Expected ~0 dB at 20Hz, got {}",
            mag_20hz
        );

        let mag_20khz = coeffs.magnitude_db(20000.0, sample_rate);
        assert!(
            mag_20khz.abs() < 0.1,
            "Expected ~0 dB at 20kHz, got {}",
            mag_20khz
        );
    }

    #[test]
    fn shelf_filter_frequency_response() {
        let sample_rate = 48000.0;
        let freq_hz = 200.0;
        let gain_db = 8.0;
        let slope = 1.0;

        let low = low_shelf(freq_hz, sample_rate, gain_db, slope);
        // Well below corner frequency (e.g. 20 Hz), low shelf should reach plateau gain ~+8 dB
        let mag_20hz = low.magnitude_db(20.0, sample_rate);
        assert!(
            (mag_20hz - 8.0).abs() < 0.3,
            "Low shelf low plateau: expected ~8.0 dB, got {}",
            mag_20hz
        );
        // Well above corner frequency (e.g. 10 kHz), should be ~0 dB
        let mag_10khz = low.magnitude_db(10000.0, sample_rate);
        assert!(
            mag_10khz.abs() < 0.1,
            "Low shelf high end: expected ~0 dB, got {}",
            mag_10khz
        );

        let high = high_shelf(4000.0, sample_rate, gain_db, slope);
        let high_mag_20khz = high.magnitude_db(20000.0, sample_rate);
        assert!(
            (high_mag_20khz - 8.0).abs() < 0.3,
            "High shelf high plateau: expected ~8.0 dB, got {}",
            high_mag_20khz
        );
        let high_mag_100hz = high.magnitude_db(100.0, sample_rate);
        assert!(
            high_mag_100hz.abs() < 0.1,
            "High shelf low end: expected ~0 dB, got {}",
            high_mag_100hz
        );
    }

    #[test]
    fn cascaded_butterworth_cut_slopes() {
        let sample_rate = 48000.0;
        let cutoff = 1000.0;

        // High pass 24 dB/oct
        let hp24 = FilterChain::high_pass(cutoff, sample_rate, CutSlope::Db24);
        // Cutoff magnitude is ~ -3 dB for Butterworth
        let mag_cutoff = hp24.magnitude_db(cutoff, sample_rate);
        assert!(
            (mag_cutoff - -3.01).abs() < 0.5,
            "HP24 cutoff: expected ~ -3 dB, got {}",
            mag_cutoff
        );

        // One octave below cutoff (500 Hz), 24 dB/oct should drop by ~24 dB from passband (-24 dB)
        let mag_one_oct_down = hp24.magnitude_db(500.0, sample_rate);
        assert!(
            (mag_one_oct_down - -24.0).abs() < 3.0,
            "HP24 1-octave down: expected ~ -24 dB, got {}",
            mag_one_oct_down
        );

        // Low pass 48 dB/oct
        let lp48 = FilterChain::low_pass(cutoff, sample_rate, CutSlope::Db48);
        // One octave above cutoff (2000 Hz), 48 dB/oct should drop by ~48 dB
        let mag_one_oct_up = lp48.magnitude_db(2000.0, sample_rate);
        assert!(
            (mag_one_oct_up - -48.0).abs() < 3.0,
            "LP48 1-octave up: expected ~ -48 dB, got {}",
            mag_one_oct_up
        );
    }
}
