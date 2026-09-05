//! Biquad filter coefficients and a two-stage K-weighting filter.
//!
//! Implements the exact BS.1770-4 pre-filter: Stage 1 is a high-shelf
//! boost (+4.34 dB above ~1681 Hz) and Stage 2 is a high-pass (RLB weighting,
//! ~38 Hz, Q = 0.561). Coefficients are recomputed for the target sample
//! rate — never hardcoded to 48 kHz.

use crate::config::*;

/// A single biquad section (Direct Form I, transposed).
#[derive(Clone, Copy)]
pub struct Biquad {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
    pub x1: f32,
    pub x2: f32,
    pub y1: f32,
    pub y2: f32,
}

impl Biquad {
    pub fn new() -> Self {
        Biquad {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    pub fn set_coeffs(&mut self, b0: f32, b1: f32, b2: f32, a1: f32, a2: f32) {
        self.b0 = b0;
        self.b1 = b1;
        self.b2 = b2;
        self.a1 = a1;
        self.a2 = a2;
    }

    /// Reset state to zero (required for deterministic replay).
    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }

    /// Process one sample through the biquad (Direct Form I, transposed).
    pub fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

/// Coefficients for a high-shelf filter (RBJ Audio EQ Cookbook "high-shelf" recipe).
///
/// `db` is the gain at the shelf, `f0` the transition frequency, `q` the Q.
pub fn high_shelf_coeffs(sample_rate: f64, db: f64, f0: f64, q: f64) -> (f32, f32, f32, f32, f32) {
    let a_db = 10f64.powf(db / 40.0);
    let omega = 2.0 * core::f64::consts::PI * f0 / sample_rate;
    let sin = f64::sin(omega);
    let cos = f64::cos(omega);
    let alpha = sin / (2.0 * q);
    let a_plus1 = a_db + 1.0;
    let a_minus1 = a_db - 1.0;
    let two_sqrt_a = 2.0 * a_db.sqrt();
    let denom = a_plus1 - a_minus1 * cos;

    let b0 = (a_plus1 + a_minus1 * cos + two_sqrt_a * alpha) / denom;
    let b1 = 2.0 * (a_minus1 - a_plus1 * cos) / denom;
    let b2 = (a_plus1 + a_minus1 * cos - two_sqrt_a * alpha) / denom;
    let a1 = 2.0 * (a_minus1 - a_plus1 * cos) / denom;
    let a2 = (a_plus1 + a_minus1 * cos - two_sqrt_a * alpha) / denom / denom;
    let norm = 1.0 / denom;

    // Normalize so a0 = 1
    (
        (b0 * norm) as f32,
        (b1 * norm) as f32,
        (b2 * norm) as f32,
        (a1 * norm) as f32,
        (a2 * norm) as f32,
    )
}

/// Coefficients for a high-pass filter (RBJ Audio EQ Cookbook "high-pass" recipe).
pub fn high_pass_coeffs(sample_rate: f64, f0: f64, q: f64) -> (f32, f32, f32, f32, f32) {
    let omega = 2.0 * core::f64::consts::PI * f0 / sample_rate;
    let sin = f64::sin(omega);
    let cos = f64::cos(omega);
    let alpha = sin / (2.0 * q);
    let denom = 1.0 + alpha;

    let b0 = ((1.0 + cos) * 0.5) as f32;
    let b1 = (-(1.0 + cos)) as f32;
    let b2 = ((1.0 + cos) * 0.5) as f32;
    let a0 = denom as f32;

    (
        b0 / a0,
        b1 / a0,
        b2 / a0,
        (2.0 * (1.0 - cos) / denom) as f32,
        ((1.0 - alpha) / denom) as f32,
    )
}

/// The two-stage K-weighting pre-filter per BS.1770-4.
///
/// Stage 1: high-shelf boost (Stage 1 of the RLB weighting).
/// Stage 2: high-pass at ~38 Hz (Stage 2 / "RLB" weighting).
#[derive(Clone)]
pub struct KWeighting {
    pub stage1: Biquad,
    pub stage2: Biquad,
    pub sample_rate: f64,
}

impl KWeighting {
    pub fn new(sample_rate: f64) -> Self {
        let mut kw = KWeighting {
            stage1: Biquad::new(),
            stage2: Biquad::new(),
            sample_rate,
        };
        kw.recalculate(sample_rate);
        kw
    }

    pub fn recalculate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate;
        let (b0, b1, b2, a1, a2) = high_shelf_coeffs(
            sample_rate,
            KWEIGHT_HIGHSHELF_DB,
            KWEIGHT_HIGHSHELF_FC,
            KWEIGHT_HIGHSHELF_Q,
        );
        self.stage1.set_coeffs(b0, b1, b2, a1, a2);

        let (b0, b1, b2, a1, a2) = high_pass_coeffs(
            sample_rate,
            KWEIGHT_HIGHPASS_FC,
            KWEIGHT_HIGHPASS_Q,
        );
        self.stage2.set_coeffs(b0, b1, b2, a1, a2);
    }

    pub fn reset(&mut self) {
        self.stage1.reset();
        self.stage2.reset();
    }

    /// Process a single sample through both stages.
    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        let s1 = self.stage1.process(x);
        self.stage2.process(s1)
    }

    /// Process a slice in-place.
    pub fn process_slice(&mut self, buf: &mut [f32]) {
        for s in buf.iter_mut() {
            *s = self.process(*s);
        }
    }
}

