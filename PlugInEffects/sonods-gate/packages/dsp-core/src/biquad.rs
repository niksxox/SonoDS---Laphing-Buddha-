//! Direct Form II Transposed Biquad Filter for Sidechain HPF/LPF.

use crate::denormals::flush_denormal;
use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BiquadFilterType {
    HighPass,
    LowPass,
    Bypass,
}

#[derive(Debug, Clone)]
pub struct BiquadFilter {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    s1: f64,
    s2: f64,
    sample_rate: f64,
    filter_type: BiquadFilterType,
    cutoff_hz: f64,
    q: f64,
}

impl BiquadFilter {
    pub fn new(sample_rate: f64, filter_type: BiquadFilterType, cutoff_hz: f64, q: f64) -> Self {
        let mut filter = Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            s1: 0.0,
            s2: 0.0,
            sample_rate: sample_rate.max(1.0),
            filter_type,
            cutoff_hz,
            q: q.max(0.1),
        };
        filter.update_coefficients();
        filter
    }

    pub fn set_params(&mut self, filter_type: BiquadFilterType, cutoff_hz: f64, q: f64) {
        self.filter_type = filter_type;
        self.cutoff_hz = cutoff_hz.clamp(10.0, self.sample_rate * 0.49);
        self.q = q.max(0.1);
        self.update_coefficients();
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate.max(1.0);
        self.update_coefficients();
    }

    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }

    fn update_coefficients(&mut self) {
        if self.filter_type == BiquadFilterType::Bypass {
            self.b0 = 1.0;
            self.b1 = 0.0;
            self.b2 = 0.0;
            self.a1 = 0.0;
            self.a2 = 0.0;
            return;
        }

        let w0 = 2.0 * PI * (self.cutoff_hz / self.sample_rate).clamp(0.0001, 0.49);
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * self.q);

        let (b0, b1, b2, a0, a1, a2) = match self.filter_type {
            BiquadFilterType::HighPass => {
                let b0 = (1.0 + cos_w0) / 2.0;
                let b1 = -(1.0 + cos_w0);
                let b2 = (1.0 + cos_w0) / 2.0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadFilterType::LowPass => {
                let b0 = (1.0 - cos_w0) / 2.0;
                let b1 = 1.0 - cos_w0;
                let b2 = (1.0 - cos_w0) / 2.0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadFilterType::Bypass => (1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        };

        let a0_inv = 1.0 / a0;
        self.b0 = b0 * a0_inv;
        self.b1 = b1 * a0_inv;
        self.b2 = b2 * a0_inv;
        self.a1 = a1 * a0_inv;
        self.a2 = a2 * a0_inv;
    }

    #[inline(always)]
    pub fn process_sample(&mut self, input: f64) -> f64 {
        let out = self.b0 * input + self.s1;
        self.s1 = flush_denormal(self.b1 * input - self.a1 * out + self.s2);
        self.s2 = flush_denormal(self.b2 * input - self.a2 * out);
        flush_denormal(out)
    }
}
