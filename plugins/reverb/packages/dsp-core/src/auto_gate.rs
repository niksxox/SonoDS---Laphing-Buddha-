// SonoDS Reverb - Auto Gate Module
// Task 1.8: Auto Gate for muting reverb decay when dry signal stops or drops below threshold.

use std::f32;

#[derive(Debug, Clone)]
pub struct AutoGate {
    threshold_db: f32,
    attack_secs: f32,
    release_secs: f32,
    hold_secs: f32,
    enabled: bool,
    sample_rate: f32,

    // Internal state
    envelope: f32,
    gate_gain: f32,
    hold_timer: f32,
}

impl AutoGate {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            threshold_db: -40.0,
            attack_secs: 0.005,  // 5ms
            release_secs: 0.1,   // 100ms
            hold_secs: 0.05,     // 50ms
            enabled: false,
            sample_rate,
            envelope: 0.0,
            gate_gain: 1.0,
            hold_timer: 0.0,
        }
    }

    pub fn set_threshold_db(&mut self, threshold_db: f32) {
        self.threshold_db = threshold_db.clamp(-80.0, 0.0);
    }

    pub fn set_attack(&mut self, attack_secs: f32) {
        self.attack_secs = attack_secs.max(0.0001);
    }

    pub fn set_release(&mut self, release_secs: f32) {
        self.release_secs = release_secs.max(0.001);
    }

    pub fn set_hold(&mut self, hold_secs: f32) {
        self.hold_secs = hold_secs.max(0.0);
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        if !enabled {
            self.gate_gain = 1.0;
            self.envelope = 0.0;
            self.hold_timer = 0.0;
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Process a stereo sample pair.
    /// `sidechain_l` & `sidechain_r` are the dry input signal (or trigger source).
    /// `wet_l` & `wet_r` are the wet reverb signal to be gated.
    pub fn process(&mut self, sidechain_l: f32, sidechain_r: f32, wet_l: f32, wet_r: f32) -> (f32, f32) {
        if !self.enabled {
            return (wet_l, wet_r);
        }

        // Peak detector on dry signal
        let input_peak = sidechain_l.abs().max(sidechain_r.abs());

        // Fast envelope follow
        let env_coeff = 0.01;
        self.envelope += env_coeff * (input_peak - self.envelope);

        // Convert threshold dB to linear
        let threshold_lin = 10.0f32.powf(self.threshold_db / 20.0);

        let target_gain = if self.envelope >= threshold_lin {
            self.hold_timer = self.hold_secs;
            1.0
        } else if self.hold_timer > 0.0 {
            self.hold_timer -= 1.0 / self.sample_rate;
            1.0
        } else {
            0.0
        };

        // Smooth gate gain with attack / release time constants
        let dt = 1.0 / self.sample_rate;
        let time_const = if target_gain > self.gate_gain {
            self.attack_secs
        } else {
            self.release_secs
        };

        let alpha = (-dt / time_const).exp();
        self.gate_gain = target_gain + alpha * (self.gate_gain - target_gain);

        (wet_l * self.gate_gain, wet_r * self.gate_gain)
    }

    pub fn gate_gain(&self) -> f32 {
        self.gate_gain
    }

    pub fn reset(&mut self) {
        self.envelope = 0.0;
        self.gate_gain = if self.enabled { 0.0 } else { 1.0 };
        self.hold_timer = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auto_gate_disabled() {
        let mut gate = AutoGate::new(44100.0);
        gate.set_enabled(false);

        let (out_l, out_r) = gate.process(0.0, 0.0, 0.8, 0.8);
        assert_eq!(out_l, 0.8);
        assert_eq!(out_r, 0.8);
    }

    #[test]
    fn test_auto_gate_passes_above_threshold() {
        let mut gate = AutoGate::new(44100.0);
        gate.set_threshold_db(-20.0); // 0.1 linear
        gate.set_attack(0.001);
        gate.set_enabled(true);

        // Feed strong signal for 100 samples to let envelope and attack open gate
        for _ in 0..100 {
            gate.process(0.5, 0.5, 1.0, 1.0);
        }

        let (out_l, out_r) = gate.process(0.5, 0.5, 1.0, 1.0);
        assert!(out_l > 0.9, "Gate should be fully open: got {}", out_l);
        assert!(out_r > 0.9, "Gate should be fully open: got {}", out_r);
    }

    #[test]
    fn test_auto_gate_closes_below_threshold() {
        let mut gate = AutoGate::new(44100.0);
        gate.set_threshold_db(-20.0); // 0.1 linear
        gate.set_hold(0.001); // 1ms hold
        gate.set_release(0.005); // 5ms release
        gate.set_enabled(true);

        // First open gate
        for _ in 0..200 {
            gate.process(0.5, 0.5, 1.0, 1.0);
        }

        // Now feed silence for 1 second (44100 samples)
        let mut last_out = 1.0;
        for _ in 0..44100 {
            let (out_l, _) = gate.process(0.0, 0.0, 1.0, 1.0);
            last_out = out_l;
        }

        assert!(last_out < 0.01, "Gate should close when signal drops below threshold: got {}", last_out);
    }
}
