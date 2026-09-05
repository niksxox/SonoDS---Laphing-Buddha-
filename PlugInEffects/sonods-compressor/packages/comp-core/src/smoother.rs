//! Decoupled attack/release envelope smoother.
//!
//! Crucial architecture note per Engineering Spec §1.3 & Global Fixed Decisions:
//! Smoothing is applied to the GAIN-REDUCTION value in dB (not to the input level).
//!
//! Direction convention:
//! Gain reduction is represented as positive dB (0.0 = no reduction, >0.0 = reduction).
//! - When raw_gr > previous_smoothed_gr: gain reduction is INCREASING (compressor is "digging in")
//!   -> use alpha_attack.
//! - When raw_gr <= previous_smoothed_gr: gain reduction is DECREASING (compressor is "releasing")
//!   -> use alpha_release.

#[derive(Debug, Clone)]
pub struct EnvelopeSmoother {
    alpha_attack: f64,
    alpha_release: f64,
    attack_time_s: f64,
    release_time_s: f64,
    sample_rate: f64,
    smoothed_gr_db: f64,
}

impl EnvelopeSmoother {
    pub fn new(attack_time_s: f64, release_time_s: f64, sample_rate: f64) -> Self {
        let mut s = Self {
            alpha_attack: 0.0,
            alpha_release: 0.0,
            attack_time_s: attack_time_s.max(1e-6),
            release_time_s: release_time_s.max(1e-6),
            sample_rate: sample_rate.max(1.0),
            smoothed_gr_db: 0.0,
        };
        s.recalc_coeffs();
        s
    }

    fn recalc_coeffs(&mut self) {
        // Standard one-pole analog time-constant formula:
        // alpha = exp(-1.0 / (sample_rate * time_seconds))
        self.alpha_attack = (-1.0 / (self.sample_rate * self.attack_time_s)).exp();
        self.alpha_release = (-1.0 / (self.sample_rate * self.release_time_s)).exp();
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate.max(1.0);
        self.recalc_coeffs();
    }

    pub fn set_attack_time(&mut self, attack_time_s: f64) {
        self.attack_time_s = attack_time_s.max(1e-6);
        self.alpha_attack = (-1.0 / (self.sample_rate * self.attack_time_s)).exp();
    }

    pub fn set_release_time(&mut self, release_time_s: f64) {
        self.release_time_s = release_time_s.max(1e-6);
        self.alpha_release = (-1.0 / (self.sample_rate * self.release_time_s)).exp();
    }

    pub fn reset(&mut self) {
        self.smoothed_gr_db = 0.0;
    }

    /// Process one sample of raw gain reduction (in positive dB)
    /// and return the smoothed gain reduction (in positive dB).
    #[inline]
    pub fn process_sample(&mut self, raw_gr_db: f64) -> f64 {
        let alpha = if raw_gr_db > self.smoothed_gr_db {
            self.alpha_attack
        } else {
            self.alpha_release
        };

        self.smoothed_gr_db = alpha * self.smoothed_gr_db + (1.0 - alpha) * raw_gr_db;

        // Denormal protection
        if self.smoothed_gr_db < 1e-12 {
            self.smoothed_gr_db = 0.0;
        }

        self.smoothed_gr_db
    }

    #[inline]
    pub fn current_smoothed_db(&self) -> f64 {
        self.smoothed_gr_db
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_attack_and_release_time_constants() {
        let sr = 48000.0;
        let attack_s = 0.020; // 20ms
        let release_s = 0.100; // 100ms
        let mut smoother = EnvelopeSmoother::new(attack_s, release_s, sr);

        // Step input from 0.0 dB to 10.0 dB (sudden heavy compression)
        let target_gr = 10.0;
        let attack_samples = (sr * attack_s) as usize;

        for _ in 0..attack_samples {
            smoother.process_sample(target_gr);
        }

        // At exactly one time constant t = attack_s, exponential reaches 1 - e^-1 ~= 0.63212
        // Expected value: 10.0 * 0.63212 ~= 6.32 dB
        let val_at_attack = smoother.current_smoothed_db();
        let expected_attack = target_gr * (1.0 - (-1.0_f64).exp());
        assert!(
            (val_at_attack - expected_attack).abs() < 0.1,
            "Attack failed: expected ~{:.2} dB, got {:.2} dB",
            expected_attack,
            val_at_attack
        );

        // Run until fully settled near 10.0 dB
        for _ in 0..(attack_samples * 5) {
            smoother.process_sample(target_gr);
        }
        assert!((smoother.current_smoothed_db() - target_gr).abs() < 0.05);

        // Now step input back down to 0.0 dB (return to silence/release)
        let release_samples = (sr * release_s) as usize;
        for _ in 0..release_samples {
            smoother.process_sample(0.0);
        }

        // At one release time constant, remaining value should decay by factor of e^-1 ~= 0.36788
        // Expected value: 10.0 * 0.36788 ~= 3.68 dB
        let val_at_release = smoother.current_smoothed_db();
        let expected_release = target_gr * (-1.0_f64).exp();
        assert!(
            (val_at_release - expected_release).abs() < 0.1,
            "Release failed: expected ~{:.2} dB, got {:.2} dB",
            expected_release,
            val_at_release
        );
    }

    #[test]
    fn test_short_gaps_do_not_fully_release_or_chatter() {
        let sr = 48000.0;
        let mut smoother = EnvelopeSmoother::new(0.010, 0.200, sr); // 10ms attack, 200ms release

        // Settle at 8 dB reduction
        for _ in 0..(sr * 0.05) as usize {
            smoother.process_sample(8.0);
        }
        let settled_gr = smoother.current_smoothed_db();
        assert!((settled_gr - 8.0).abs() < 0.1);

        // 3ms brief silence gap (like between drum hits or syllables)
        let gap_samples = (sr * 0.003) as usize;
        for _ in 0..gap_samples {
            smoother.process_sample(0.0);
        }

        // With 200ms release, in 3ms the reduction should barely drop (< 5% drop)
        let gr_after_gap = smoother.current_smoothed_db();
        assert!(
            gr_after_gap > 7.5,
            "Compressor should hold compression through short 3ms gap (musical glue), got {}",
            gr_after_gap
        );
    }
}
