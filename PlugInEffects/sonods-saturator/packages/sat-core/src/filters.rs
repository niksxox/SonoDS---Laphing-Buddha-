//! Biquad and DC-blocking filters for tone shaping and coloration with denormal protection.

use std::f64::consts::PI;

#[inline(always)]
pub fn flush_denormal(val: f64) -> f64 {
    if val.abs() < 1e-15 {
        0.0
    } else {
        val
    }
}

/// Direct Form II Transposed Biquad Filter for numerical safety.
#[derive(Debug, Clone)]
pub struct Biquad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    pub s1: f64,
    pub s2: f64,
}

impl Default for Biquad {
    fn default() -> Self {
        Self::passthrough()
    }
}

impl Biquad {
    pub fn passthrough() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            s1: 0.0,
            s2: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }

    /// Audio EQ Cookbook High-Shelf filter.
    pub fn high_shelf(freq_hz: f64, gain_db: f64, sample_rate: f64) -> Self {
        if gain_db.abs() < 1e-4 {
            return Self::passthrough();
        }

        let a_gain = 10.0f64.powf(gain_db / 40.0);
        let omega = 2.0 * PI * (freq_hz / sample_rate).clamp(0.0001, 0.499);
        let cos_w = omega.cos();
        let sin_w = omega.sin();
        let q = 0.707;
        let alpha = sin_w / (2.0 * q);
        let two_sqrt_a_alpha = 2.0 * a_gain.sqrt() * alpha;

        let b0 = a_gain * ((a_gain + 1.0) + (a_gain - 1.0) * cos_w + two_sqrt_a_alpha);
        let b1 = -2.0 * a_gain * ((a_gain - 1.0) + (a_gain + 1.0) * cos_w);
        let b2 = a_gain * ((a_gain + 1.0) + (a_gain - 1.0) * cos_w - two_sqrt_a_alpha);
        let a0 = (a_gain + 1.0) - (a_gain - 1.0) * cos_w + two_sqrt_a_alpha;
        let a1 = 2.0 * ((a_gain - 1.0) - (a_gain + 1.0) * cos_w);
        let a2 = (a_gain + 1.0) - (a_gain - 1.0) * cos_w - two_sqrt_a_alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            s1: 0.0,
            s2: 0.0,
        }
    }

    /// Audio EQ Cookbook Low-Shelf filter (e.g. for Tape head bump).
    pub fn low_shelf(freq_hz: f64, gain_db: f64, sample_rate: f64) -> Self {
        if gain_db.abs() < 1e-4 {
            return Self::passthrough();
        }

        let a_gain = 10.0f64.powf(gain_db / 40.0);
        let omega = 2.0 * PI * (freq_hz / sample_rate).clamp(0.0001, 0.499);
        let cos_w = omega.cos();
        let sin_w = omega.sin();
        let q = 0.707;
        let alpha = sin_w / (2.0 * q);
        let two_sqrt_a_alpha = 2.0 * a_gain.sqrt() * alpha;

        let b0 = a_gain * ((a_gain + 1.0) - (a_gain - 1.0) * cos_w + two_sqrt_a_alpha);
        let b1 = 2.0 * a_gain * ((a_gain - 1.0) - (a_gain + 1.0) * cos_w);
        let b2 = a_gain * ((a_gain + 1.0) - (a_gain - 1.0) * cos_w - two_sqrt_a_alpha);
        let a0 = (a_gain + 1.0) + (a_gain - 1.0) * cos_w + two_sqrt_a_alpha;
        let a1 = -2.0 * ((a_gain - 1.0) + (a_gain + 1.0) * cos_w);
        let a2 = (a_gain + 1.0) + (a_gain - 1.0) * cos_w - two_sqrt_a_alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            s1: 0.0,
            s2: 0.0,
        }
    }

    /// Lowpass 1-pole for HF rolloff.
    pub fn lowpass_1pole(cutoff_hz: f64, sample_rate: f64) -> Self {
        let fc = (cutoff_hz / sample_rate).clamp(0.0001, 0.49);
        let costh = 2.0 - (2.0 * PI * fc).cos();
        let alpha = costh - (costh * costh - 1.0).sqrt();
        let b0 = 1.0 - alpha;
        Self {
            b0,
            b1: 0.0,
            b2: 0.0,
            a1: -alpha,
            a2: 0.0,
            s1: 0.0,
            s2: 0.0,
        }
    }

    #[inline(always)]
    pub fn process(&mut self, input: f64) -> f64 {
        let out = self.b0 * input + self.s1;
        self.s1 = flush_denormal(self.b1 * input - self.a1 * out + self.s2);
        self.s2 = flush_denormal(self.b2 * input - self.a2 * out);
        out
    }

    /// Update filter coefficients without resetting internal state.
    /// Prevents clicks/transients during real-time parameter changes.
    pub fn update_coeffs(&mut self, source: &Biquad) {
        self.b0 = source.b0;
        self.b1 = source.b1;
        self.b2 = source.b2;
        self.a1 = source.a1;
        self.a2 = source.a2;
        // s1, s2 intentionally preserved to avoid transient clicks
    }
}

/// 1-pole DC-blocking highpass filter (~8Hz).
#[derive(Debug, Clone)]
pub struct DcBlocker {
    r: f64,
    pub x1: f64,
    pub y1: f64,
}

impl Default for DcBlocker {
    fn default() -> Self {
        Self::new(44100.0)
    }
}

impl DcBlocker {
    pub fn new(sample_rate: f64) -> Self {
        let fc = 8.0;
        let r = 1.0 - (2.0 * PI * fc / sample_rate).clamp(0.0001, 0.1);
        Self {
            r,
            x1: 0.0,
            y1: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.y1 = 0.0;
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        let fc = 8.0;
        self.r = 1.0 - (2.0 * PI * fc / sample_rate).clamp(0.0001, 0.1);
    }

    #[inline(always)]
    pub fn process(&mut self, x: f64) -> f64 {
        let y = flush_denormal(x - self.x1 + self.r * self.y1);
        self.x1 = flush_denormal(x);
        self.y1 = y;
        y
    }
}
