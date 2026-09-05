//! Stereo correlation and vectorscope math reused from Imager plugin.

use crate::config::*;

/// Stereo correlation meter: ranges from -1.0 (fully anti-correlated)
/// to +1.0 (fully mono/correlated).
pub struct StereoCorrelation {
    pub sample_rate: f64,
    /// Running sum of L*R
    sum_lr: f64,
    /// Running sum of sqrt(L²*R²)
    sum_abs_lr: f64,
    /// Sample count
    count: u64,
}

impl StereoCorrelation {
    pub fn new(sample_rate: f64) -> Self {
        StereoCorrelation {
            sample_rate,
            sum_lr: 0.0,
            sum_abs_lr: 0.0,
            count: 0,
        }
    }

    pub fn reset(&mut self) {
        self.sum_lr = 0.0;
        self.sum_abs_lr = 0.0;
        self.count = 0;
    }

    #[inline]
    pub fn process(&mut self, left: f32, right: f32) {
        let l = left as f64;
        let r = right as f64;
        self.sum_lr += l * r;
        self.sum_abs_lr += (l * l * r * r).sqrt();
        self.count += 1;
    }

    /// Current correlation coefficient (Pearson-style for stereo).
    pub fn correlation(&self) -> f64 {
        if self.count == 0 || self.sum_abs_lr < 1e-20 {
            0.0
        } else {
            (self.sum_lr / self.sum_abs_lr).clamp(-1.0, 1.0)
        }
    }

    /// Compute Lissajous/vectorscope point coordinates for a single sample pair.
    /// Returns (x, y) where x = (L+R)/2, y = (L-R)/2.
    pub fn vectorscope_point(left: f32, right: f32) -> (f64, f64) {
        let l = left as f64;
        let r = right as f64;
        ((l + r) * 0.5, (l - r) * 0.5)
    }
}

