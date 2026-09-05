//! Lookahead circular delay buffer for dry audio path per Task 1.5.
//!
//! Allows the gate detector to process incoming transients before they arrive at the output,
//! preventing clipping/attenuation of the transient's leading edge.

#[derive(Debug, Clone)]
pub struct LookaheadBuffer {
    buffer: Vec<f64>,
    capacity: usize,
    write_idx: usize,
    delay_samples: usize,
}

impl LookaheadBuffer {
    /// Creates a lookahead buffer supporting up to `max_lookahead_seconds` (default 0.010 = 10 ms).
    pub fn new(max_lookahead_seconds: f64, sample_rate: f64) -> Self {
        let capacity = ((max_lookahead_seconds.max(0.010) * sample_rate.max(1.0)).ceil() as usize + 32).max(64);
        Self {
            buffer: vec![0.0; capacity],
            capacity,
            write_idx: 0,
            delay_samples: 0,
        }
    }

    /// Sets lookahead delay in seconds. Clamped to [0.0, max_lookahead].
    pub fn set_lookahead(&mut self, lookahead_seconds: f64, sample_rate: f64) {
        let samples = (lookahead_seconds.max(0.0) * sample_rate).round() as usize;
        self.delay_samples = samples.min(self.capacity.saturating_sub(1));
    }

    /// Returns the exact lookahead delay in samples (latency reported to host).
    pub fn delay_samples(&self) -> usize {
        self.delay_samples
    }

    pub fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.write_idx = 0;
    }

    /// Pushes a sample in and reads the delayed sample out.
    /// If delay_samples == 0, returns input immediately.
    #[inline]
    pub fn process_sample(&mut self, input: f64) -> f64 {
        if self.delay_samples == 0 {
            return input;
        }

        self.buffer[self.write_idx] = input;

        let read_idx = if self.write_idx >= self.delay_samples {
            self.write_idx - self.delay_samples
        } else {
            self.capacity + self.write_idx - self.delay_samples
        };

        self.write_idx = (self.write_idx + 1) % self.capacity;
        self.buffer[read_idx]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::detector::{EnvelopeDetector, DetectorMode};
    use crate::gain_computer::downward_expander_gain;
    use crate::state_machine::BallisticsStateMachine;

    #[test]
    fn test_zero_lookahead_is_bit_identical() {
        let mut la = LookaheadBuffer::new(0.010, 48000.0);
        la.set_lookahead(0.0, 48000.0);

        for val in &[0.123456789, -0.987654321, 0.0, 1.0, -1.0] {
            let out = la.process_sample(*val);
            assert_eq!(out, *val, "Zero lookahead must be bit-identical");
        }
    }

    #[test]
    fn test_reported_latency_matches_lookahead_ms_times_sample_rate() {
        let sr = 48000.0;
        let mut la = LookaheadBuffer::new(0.010, sr);

        // 5ms at 48kHz = 240 samples
        la.set_lookahead(0.005, sr);
        assert_eq!(la.delay_samples(), 240);

        // 10ms at 48kHz = 480 samples
        la.set_lookahead(0.010, sr);
        assert_eq!(la.delay_samples(), 480);
    }

    #[test]
    fn test_transient_leading_edge_not_attenuated_when_lookahead_ge_attack() {
        let sample_rate = 44100.0;
        let attack_sec = 0.0005; // 0.5 ms attack time constant (22 samples)
        let hold_sec = 0.020;
        let release_sec = 0.050;
        let lookahead_sec = 0.005; // 5 ms lookahead (221 samples = 10 time constants)

        let mut detector = EnvelopeDetector::new(sample_rate, DetectorMode::Peak, 0.005);
        let mut sm = BallisticsStateMachine::new(sample_rate, attack_sec, hold_sec, release_sec);
        let mut lookahead = LookaheadBuffer::new(0.010, sample_rate);
        lookahead.set_lookahead(lookahead_sec, sample_rate);

        // Start in closed state with silence (-60 dB)
        sm.reset(-60.0);

        // Feed silence for 200 samples
        for _ in 0..200 {
            let s = 0.0;
            let det_db = detector.process_sample_db(s);
            let target_db = downward_expander_gain(det_db, -20.0, 10.0, -60.0, 0.0);
            sm.process_sample(target_db, det_db > -20.0);
            lookahead.process_sample(s);
        }

        // Now inject a step transient: instant 1.0 (0 dBFS, well above -20 dB threshold)
        // Process for lookahead delay samples until the transient pops out of the delay line
        let delay_samples = lookahead.delay_samples();
        let mut first_transient_output = 0.0;
        let mut first_transient_gain_db = 0.0;

        for _ in 0..=delay_samples {
            let s = 1.0; // dry step input
            // 1. Detector reads undelayed signal ahead of time
            let det_db = detector.process_sample_db(s);
            let target_db = downward_expander_gain(det_db, -20.0, 10.0, -60.0, 0.0);
            // 2. Ballistics open ahead of delayed audio
            let gain_db = sm.process_sample(target_db, det_db > -20.0);
            // 3. Delayed audio emerges
            let delayed_audio = lookahead.process_sample(s);

            if delayed_audio.abs() > 0.5 {
                first_transient_output = delayed_audio;
                first_transient_gain_db = gain_db;
                break;
            }
        }

        // When the delayed transient reaches the output, the gate must already be fully open (0 dB)
        assert_eq!(first_transient_output, 1.0);
        assert!(
            first_transient_gain_db.abs() < 0.01,
            "Leading edge must experience 0 dB attenuation (fully open), got {:.2} dB",
            first_transient_gain_db
        );
    }
}
