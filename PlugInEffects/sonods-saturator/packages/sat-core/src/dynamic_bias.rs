//! Dynamic Bias and Tube Sag Envelope Follower.

#[derive(Debug, Clone)]
pub struct DynamicBiasTracker {
    envelope: f64,
    attack_coeff: f64,
    release_coeff: f64,
}

impl DynamicBiasTracker {
    pub fn new(sample_rate: f64) -> Self {
        let attack_ms = 5.0;
        let release_ms = 85.0;
        let attack_coeff = (-1.0 / (attack_ms * 0.001 * sample_rate)).exp();
        let release_coeff = (-1.0 / (release_ms * 0.001 * sample_rate)).exp();

        Self {
            envelope: 0.0,
            attack_coeff,
            release_coeff,
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        let attack_ms = 5.0;
        let release_ms = 85.0;
        self.attack_coeff = (-1.0 / (attack_ms * 0.001 * sample_rate)).exp();
        self.release_coeff = (-1.0 / (release_ms * 0.001 * sample_rate)).exp();
    }

    pub fn reset(&mut self) {
        self.envelope = 0.0;
    }

    /// Process input and return dynamic bias offset (tube grid sag & transformer flux drift).
    #[inline(always)]
    pub fn process_sample(&mut self, input: f64, drive: f64) -> f64 {
        let abs_x = input.abs();
        if abs_x > self.envelope {
            self.envelope = self.attack_coeff * self.envelope + (1.0 - self.attack_coeff) * abs_x;
        } else {
            self.envelope = self.release_coeff * self.envelope + (1.0 - self.release_coeff) * abs_x;
        }

        // Flush subnormals
        if self.envelope.abs() < 1e-15 {
            self.envelope = 0.0;
        }

        // Bias offset scaled with drive and envelope
        let sag_intensity = 0.08 * (drive / (1.0 + drive));
        -self.envelope * sag_intensity
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dynamic_bias_envelope_tracking() {
        let mut tracker = DynamicBiasTracker::new(48000.0);
        let drive = 0.8;

        // Feed transient bursts
        for _ in 0..500 {
            tracker.process_sample(1.0, drive);
        }

        let sag = tracker.process_sample(1.0, drive);
        assert!(sag < 0.0, "Dynamic sag must produce negative grid bias under load");
        assert!(sag > -0.2, "Sag must remain within physical boundary");
    }
}
