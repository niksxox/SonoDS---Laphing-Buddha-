//! Lookahead ring-delay buffer for the dry audio path.
//!
//! Architecture note per Engineering Spec §1.5:
//! Detector reads the signal BEFORE the delay so the gain reduction envelope
//! can begin ramping ahead of the delayed audio transient.
//!
//! Max lookahead: 10ms (at 192 kHz, max 1920 samples). Default is 0.0ms (true zero latency).

#[derive(Debug, Clone)]
pub struct LookaheadBuffer {
    buffer: Vec<f64>,
    capacity: usize,
    write_idx: usize,
    delay_samples: usize,
}

impl LookaheadBuffer {
    /// Creates a lookahead buffer supporting up to `max_lookahead_seconds` (default 0.010 = 10ms).
    pub fn new(max_lookahead_seconds: f64, sample_rate: f64) -> Self {
        let capacity = ((max_lookahead_seconds * sample_rate).ceil() as usize + 8).max(16);
        Self {
            buffer: vec![0.0; capacity],
            capacity,
            write_idx: 0,
            delay_samples: 0,
        }
    }

    /// Sets the lookahead delay in seconds. Clamped to [0, max_lookahead].
    pub fn set_lookahead(&mut self, lookahead_seconds: f64, sample_rate: f64) {
        let samples = (lookahead_seconds.max(0.0) * sample_rate).round() as usize;
        self.delay_samples = samples.min(self.capacity - 1);
    }

    pub fn delay_samples(&self) -> usize {
        self.delay_samples
    }

    pub fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.write_idx = 0;
    }

    /// Pushes a sample in and reads the delayed sample out.
    /// If delay_samples == 0, returns the input sample immediately (bit-identical passthrough).
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
    fn test_lookahead_delay_timing() {
        let sr = 48000.0;
        let mut la = LookaheadBuffer::new(0.010, sr);
        let delay_ms = 0.002; // 2ms = 96 samples
        la.set_lookahead(delay_ms, sr);
        assert_eq!(la.delay_samples(), 96);

        // Feed silence then a single impulse 1.0
        let mut impulse_out_index: Option<usize> = None;
        for i in 0..200 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            let out = la.process_sample(input);
            if out.abs() > 0.5 && impulse_out_index.is_none() {
                impulse_out_index = Some(i);
            }
        }

        assert_eq!(
            impulse_out_index,
            Some(96),
            "Impulse should emerge after exactly 96 samples"
        );
    }
}
