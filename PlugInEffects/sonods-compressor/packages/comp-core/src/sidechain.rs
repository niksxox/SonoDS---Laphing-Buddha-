//! Sidechain High-Pass Filter and Stereo Linking.
//!
//! Important design rule per Engineering Spec §1.4:
//! The sidechain HPF is on the DETECTOR path ONLY.
//! It must NEVER touch or alter the frequency spectrum of the main processed audio.

use std::f64::consts::PI;

/// Gentle 6 dB/octave (one-pole) high-pass filter for the sidechain detection path.
///
/// H(s) = s / (s + omega_c)
#[derive(Debug, Clone)]
pub struct SidechainHpf {
    cutoff_hz: f64,
    sample_rate: f64,
    alpha: f64,
    prev_x: f64,
    prev_y: f64,
}

impl SidechainHpf {
    pub fn new(cutoff_hz: f64, sample_rate: f64) -> Self {
        let mut f = Self {
            cutoff_hz: cutoff_hz.clamp(20.0, 500.0),
            sample_rate: sample_rate.max(1.0),
            alpha: 0.0,
            prev_x: 0.0,
            prev_y: 0.0,
        };
        f.recalc();
        f
    }

    fn recalc(&mut self) {
        // One-pole high-pass discrete coefficient:
        // rc = 1.0 / (2 * pi * fc)
        // alpha = rc / (rc + dt)
        let dt = 1.0 / self.sample_rate;
        let rc = 1.0 / (2.0 * PI * self.cutoff_hz);
        self.alpha = rc / (rc + dt);
    }

    pub fn set_cutoff(&mut self, cutoff_hz: f64) {
        self.cutoff_hz = cutoff_hz.clamp(20.0, 500.0);
        self.recalc();
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate.max(1.0);
        self.recalc();
    }

    pub fn reset(&mut self) {
        self.prev_x = 0.0;
        self.prev_y = 0.0;
    }

    /// Processes a sample through the HPF.
    /// y[n] = alpha * (y[n-1] + x[n] - x[n-1])
    #[inline]
    pub fn process_sample(&mut self, x: f64) -> f64 {
        let y = self.alpha * (self.prev_y + x - self.prev_x);
        self.prev_x = x;
        self.prev_y = if y.abs() < 1e-12 { 0.0 } else { y };
        self.prev_y
    }
}

/// Computes stereo-linked gain reduction values for Left and Right channels.
///
/// `link_amount`: 0.0 = completely unlinked (independent L and R),
///                1.0 = 100% linked (louder channel governs both channels).
#[inline]
pub fn apply_stereo_linking(gr_left_db: f64, gr_right_db: f64, link_amount: f64) -> (f64, f64) {
    let link = link_amount.clamp(0.0, 1.0);
    let max_gr = gr_left_db.max(gr_right_db);

    let final_l = (1.0 - link) * gr_left_db + link * max_gr;
    let final_r = (1.0 - link) * gr_right_db + link * max_gr;

    (final_l, final_r)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sidechain_hpf_attenuates_low_freq_and_passes_high_freq() {
        let sr = 48000.0;
        let mut hpf = SidechainHpf::new(150.0, sr); // 150 Hz cutoff

        // Test 40 Hz sine wave (below cutoff)
        let f_low = 40.0;
        let mut max_out_low = 0.0_f64;
        for i in 0..4800 {
            let t = i as f64 / sr;
            let s = (2.0 * PI * f_low * t).sin();
            let y = hpf.process_sample(s);
            if i > 2400 {
                max_out_low = max_out_low.max(y.abs());
            }
        }

        hpf.reset();

        // Test 1000 Hz sine wave (well above cutoff)
        let f_high = 1000.0;
        let mut max_out_high = 0.0_f64;
        for i in 0..4800 {
            let t = i as f64 / sr;
            let s = (2.0 * PI * f_high * t).sin();
            let y = hpf.process_sample(s);
            if i > 2400 {
                max_out_high = max_out_high.max(y.abs());
            }
        }

        assert!(
            max_out_low < 0.4,
            "40 Hz signal should be substantially attenuated by 150 Hz HPF, got peak amplitude {}",
            max_out_low
        );
        assert!(
            max_out_high > 0.95,
            "1000 Hz signal should pass almost unattenuated, got peak amplitude {}",
            max_out_high
        );
    }

    #[test]
    fn test_stereo_linking() {
        let gr_left = 6.0;  // 6 dB reduction
        let gr_right = 2.0; // 2 dB reduction

        // Fully unlinked (0.0): independent
        let (l0, r0) = apply_stereo_linking(gr_left, gr_right, 0.0);
        assert_eq!(l0, 6.0);
        assert_eq!(r0, 2.0);

        // Fully linked (1.0): louder channel governs both
        let (l1, r1) = apply_stereo_linking(gr_left, gr_right, 1.0);
        assert_eq!(l1, 6.0);
        assert_eq!(r1, 6.0);

        // 50% linked: L gets 6.0, R gets (0.5 * 2.0 + 0.5 * 6.0) = 4.0
        let (l_half, r_half) = apply_stereo_linking(gr_left, gr_right, 0.5);
        assert_eq!(l_half, 6.0);
        assert_eq!(r_half, 4.0);
    }
}
