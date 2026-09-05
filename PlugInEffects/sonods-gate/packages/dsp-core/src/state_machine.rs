//! Attack / Hold / Release State Machine for Gate/Expander per Task 1.4.
//!
//! Tracks gate states: Closed, Attacking, Open, Holding, Releasing.
//! Implements a precise sample-counted Hold timer and smooth exponential dB smoothing.

use crate::denormals::flush_denormal;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateState {
    Closed,
    Attacking,
    Open,
    Holding,
    Releasing,
}

#[derive(Debug, Clone)]
pub struct BallisticsStateMachine {
    state: GateState,
    current_gain_db: f64,
    sample_rate: f64,
    attack_sec: f64,
    hold_sec: f64,
    release_sec: f64,
    attack_alpha: f64,
    release_alpha: f64,
    hold_samples_total: usize,
    hold_samples_remaining: usize,
}

impl BallisticsStateMachine {
    pub fn new(sample_rate: f64, attack_sec: f64, hold_sec: f64, release_sec: f64) -> Self {
        let sr = sample_rate.max(1.0);
        let att = attack_sec.max(1e-5);
        let rel = release_sec.max(1e-5);
        let hold = hold_sec.max(0.0);

        let attack_alpha = (-1.0 / (sr * att)).exp();
        let release_alpha = (-1.0 / (sr * rel)).exp();
        let hold_samples_total = (sr * hold).round() as usize;

        Self {
            state: GateState::Closed,
            current_gain_db: -60.0, // starts fully closed
            sample_rate: sr,
            attack_sec: att,
            hold_sec: hold,
            release_sec: rel,
            attack_alpha,
            release_alpha,
            hold_samples_total,
            hold_samples_remaining: 0,
        }
    }

    pub fn set_times(&mut self, attack_sec: f64, hold_sec: f64, release_sec: f64) {
        self.attack_sec = attack_sec.max(1e-5);
        self.hold_sec = hold_sec.max(0.0);
        self.release_sec = release_sec.max(1e-5);

        self.attack_alpha = (-1.0 / (self.sample_rate * self.attack_sec)).exp();
        self.release_alpha = (-1.0 / (self.sample_rate * self.release_sec)).exp();
        self.hold_samples_total = (self.sample_rate * self.hold_sec).round() as usize;
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate.max(1.0);
        self.set_times(self.attack_sec, self.hold_sec, self.release_sec);
    }

    pub fn reset(&mut self, initial_gain_db: f64) {
        self.current_gain_db = initial_gain_db;
        self.hold_samples_remaining = 0;
        self.state = if initial_gain_db >= -0.01 {
            GateState::Open
        } else {
            GateState::Closed
        };
    }

    pub fn state(&self) -> GateState {
        self.state
    }

    pub fn current_gain_db(&self) -> f64 {
        self.current_gain_db
    }

    /// Process a single sample step:
    /// * `target_gain_db`: Instantaneous desired gain from gain computer (0 dB if above threshold, < 0 dB if below)
    /// * `is_above_threshold`: Boolean indicating whether current level is above threshold (gate opening condition)
    pub fn process_sample(&mut self, target_gain_db: f64, is_above_threshold: bool) -> f64 {
        if is_above_threshold {
            // Signal is loud / above threshold: Open gate
            self.hold_samples_remaining = 0; // cancel any hold timer

            if (self.current_gain_db - 0.0).abs() < 0.01 {
                self.current_gain_db = 0.0;
                self.state = GateState::Open;
            } else {
                self.state = GateState::Attacking;
                // Smooth upward toward 0 dB target
                self.current_gain_db = flush_denormal(
                    self.attack_alpha * self.current_gain_db + (1.0 - self.attack_alpha) * 0.0,
                );
                if self.current_gain_db >= -0.05 {
                    self.current_gain_db = 0.0;
                    self.state = GateState::Open;
                }
            }
        } else {
            // Signal is quiet / below threshold
            match self.state {
                GateState::Open => {
                    if self.hold_samples_total > 0 {
                        self.state = GateState::Holding;
                        self.hold_samples_remaining = self.hold_samples_total.saturating_sub(1);
                        self.current_gain_db = 0.0;
                    } else {
                        self.state = GateState::Releasing;
                        self.current_gain_db = flush_denormal(
                            self.release_alpha * self.current_gain_db + (1.0 - self.release_alpha) * target_gain_db,
                        );
                    }
                }
                GateState::Holding => {
                    if self.hold_samples_remaining > 0 {
                        self.current_gain_db = 0.0; // held open
                        self.hold_samples_remaining -= 1;
                    } else {
                        // Hold timer expired on this sample: transition to Releasing and start releasing
                        self.state = GateState::Releasing;
                        self.current_gain_db = flush_denormal(
                            self.release_alpha * self.current_gain_db + (1.0 - self.release_alpha) * target_gain_db,
                        );
                    }
                }
                GateState::Releasing => {
                    self.current_gain_db = flush_denormal(
                        self.release_alpha * self.current_gain_db + (1.0 - self.release_alpha) * target_gain_db,
                    );
                    if (self.current_gain_db - target_gain_db).abs() < 0.05 {
                        self.current_gain_db = target_gain_db;
                        self.state = GateState::Closed;
                    }
                }
                GateState::Attacking => {
                    // Still opening, but dropped below threshold: start releasing or holding
                    if self.hold_samples_total > 0 && self.current_gain_db >= -0.5 {
                        self.state = GateState::Holding;
                        self.hold_samples_remaining = self.hold_samples_total.saturating_sub(1);
                    } else {
                        self.state = GateState::Releasing;
                        self.current_gain_db = flush_denormal(
                            self.release_alpha * self.current_gain_db + (1.0 - self.release_alpha) * target_gain_db,
                        );
                    }
                }
                GateState::Closed => {
                    self.current_gain_db = target_gain_db;
                }
            }
        }

        self.current_gain_db
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hold_timer_preserves_open_state_during_short_gap() {
        let sample_rate = 44100.0;
        let attack_sec = 0.001; // 1 ms
        let hold_sec = 0.050; // 50 ms hold timer
        let release_sec = 0.100; // 100 ms release

        let mut sm = BallisticsStateMachine::new(sample_rate, attack_sec, hold_sec, release_sec);
        sm.reset(-60.0);

        // 1. Trigger open with a loud signal for 500 samples (over 10 time constants)
        for _ in 0..500 {
            sm.process_sample(0.0, true);
        }
        assert_eq!(sm.state(), GateState::Open);
        assert_eq!(sm.current_gain_db(), 0.0);

        // 2. Drop below threshold for 30 ms (shorter than 50 ms hold_sec)
        let gap_samples = (sample_rate * 0.030) as usize; // ~1323 samples
        for _ in 0..gap_samples {
            sm.process_sample(-60.0, false);
            // Must stay in Holding state with gain exactly 0 dB!
            assert_eq!(sm.state(), GateState::Holding);
            assert_eq!(sm.current_gain_db(), 0.0, "Gain must remain at 0 dB during hold window");
        }

        // 3. Signal rises above threshold again: returns to Open immediately
        sm.process_sample(0.0, true);
        assert_eq!(sm.state(), GateState::Open);
        assert_eq!(sm.current_gain_db(), 0.0);
    }

    #[test]
    fn test_release_begins_after_hold_timer_expires() {
        let sample_rate = 44100.0;
        let attack_sec = 0.001;
        let hold_sec = 0.020; // 20 ms hold (882 samples)
        let release_sec = 0.050; // 50 ms release

        let mut sm = BallisticsStateMachine::new(sample_rate, attack_sec, hold_sec, release_sec);
        sm.reset(0.0); // start fully open

        let hold_samples = (sample_rate * hold_sec) as usize;

        // Process quiet signal for hold_samples
        for _ in 0..hold_samples {
            sm.process_sample(-60.0, false);
        }
        assert_eq!(sm.current_gain_db(), 0.0);

        // Next sample -> hold expires, transitions to Releasing and begins releasing
        sm.process_sample(-60.0, false);
        assert_eq!(sm.state(), GateState::Releasing);
        assert!(sm.current_gain_db() < 0.0, "Gain reduction must begin dropping after hold expires");

        // Process for 400 ms (8 time constants) -> reaches target -60 dB
        for _ in 0..(sample_rate * 0.400) as usize {
            sm.process_sample(-60.0, false);
        }
        assert!(
            (sm.current_gain_db() - -60.0).abs() < 0.1,
            "Expected ~ -60.0 dB, got {:.2} dB",
            sm.current_gain_db()
        );
    }
}
