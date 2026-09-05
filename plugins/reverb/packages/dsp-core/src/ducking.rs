/// Ducking — internal envelope follower on dry input that reduces wet reverb level
/// while the dry signal is present/loud, recovering afterward.
///
/// No external sidechain — follows the dry input directly, matching Pro-R's design.

use crate::SmoothedParam;

/// Envelope follower reused from the compressor pattern.
#[derive(Debug, Clone)]
struct EnvelopeFollower {
    level: f32,
    attack_coeff: f32,
    release_coeff: f32,
}

impl EnvelopeFollower {
    fn new(attack_ms: f32, release_ms: f32, sample_rate: f32) -> Self {
        Self {
            level: 0.0,
            attack_coeff: (-1.0 / (attack_ms * 0.001 * sample_rate)).exp(),
            release_coeff: (-1.0 / (release_ms * 0.001 * sample_rate)).exp(),
        }
    }

    #[inline]
    fn process(&mut self, input_abs: f32) -> f32 {
        let coeff = if input_abs > self.level {
            self.attack_coeff
        } else {
            self.release_coeff
        };
        self.level = input_abs + coeff * (self.level - input_abs);
        self.level
    }

    fn reset(&mut self) {
        self.level = 0.0;
    }
}

/// Ducking processor.
pub struct Ducking {
    /// Amount of ducking (0.0 = off, 1.0 = full ducking)
    amount: SmoothedParam,
    /// Envelope follower on the dry input
    envelope: EnvelopeFollower,
    /// Threshold above which ducking engages (linear)
    threshold: f32,
    sample_rate: f32,
}

impl Ducking {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            amount: SmoothedParam::new(0.0, 0.02, sample_rate),
            envelope: EnvelopeFollower::new(2.0, 200.0, sample_rate),
            threshold: 0.01, // -40dB
            sample_rate,
        }
    }

    /// Set the ducking amount (0.0–1.0).
    pub fn set_amount(&mut self, value: f32) {
        self.amount.set_target(value.clamp(0.0, 1.0));
    }

    /// Feed the dry input level and get the wet gain reduction.
    /// Call this with the dry input signal; it returns the gain to apply to the wet signal.
    #[inline]
    pub fn process(&mut self, dry_l: f32, dry_r: f32) -> f32 {
        let amount = self.amount.next();
        if amount < 0.001 {
            return 1.0;
        }

        let dry_level = (dry_l.abs() + dry_r.abs()) * 0.5;
        let env = self.envelope.process(dry_level);

        // Compute gain reduction
        if env > self.threshold {
            let over = (env / self.threshold).min(10.0);
            let reduction = 1.0 / over; // Inversely proportional to input level
            // Blend with amount
            1.0 - amount * (1.0 - reduction)
        } else {
            1.0
        }
    }

    pub fn reset(&mut self) {
        self.envelope.reset();
    }

    pub fn snap_params(&mut self) {
        self.amount.snap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ducking_off_no_reduction() {
        let sr = 44100.0;
        let mut duck = Ducking::new(sr);
        duck.set_amount(0.0);
        duck.snap_params();

        let gain = duck.process(0.8, 0.8);
        assert!(
            (gain - 1.0).abs() < 0.01,
            "Ducking off should not reduce gain"
        );
    }

    #[test]
    fn test_ducking_reduces_during_loud_input() {
        let sr = 44100.0;
        let mut duck = Ducking::new(sr);
        duck.set_amount(1.0);
        duck.snap_params();

        // Feed loud input for a while to let envelope settle
        let mut min_gain = 1.0f32;
        for _ in 0..4410 {
            let gain = duck.process(0.8, 0.8);
            min_gain = min_gain.min(gain);
        }

        assert!(
            min_gain < 0.5,
            "Ducking should reduce wet gain during loud input, min_gain={}",
            min_gain
        );
    }

    #[test]
    fn test_ducking_recovers_after_input_stops() {
        let sr = 44100.0;
        let mut duck = Ducking::new(sr);
        duck.set_amount(1.0);
        duck.snap_params();

        // Feed loud input
        for _ in 0..4410 {
            duck.process(0.8, 0.8);
        }

        // Stop input — gain should recover toward 1.0
        let mut last_gain = 0.0f32;
        for _ in 0..44100 {
            last_gain = duck.process(0.0, 0.0);
        }

        assert!(
            last_gain > 0.9,
            "Ducking should recover after input stops, last_gain={}",
            last_gain
        );
    }
}
