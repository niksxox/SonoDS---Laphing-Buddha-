/// Ring-buffer delay line with fractional (interpolated) read support.
/// Used by the FDN, early reflections, and predelay.

#[derive(Debug, Clone)]
pub struct DelayLine {
    buffer: Vec<f32>,
    write_pos: usize,
    length: usize,
}

impl DelayLine {
    /// Create a new delay line with a maximum length in samples.
    pub fn new(max_length: usize) -> Self {
        Self {
            buffer: vec![0.0; max_length],
            write_pos: 0,
            length: max_length,
        }
    }

    /// Get the maximum length of this delay line.
    pub fn max_length(&self) -> usize {
        self.length
    }

    /// Write a sample into the delay line and advance the write pointer.
    #[inline]
    pub fn write(&mut self, sample: f32) {
        self.buffer[self.write_pos] = sample;
        self.write_pos = (self.write_pos + 1) % self.length;
    }

    /// Read from the delay line at an integer delay (in samples).
    #[inline]
    pub fn read(&self, delay_samples: usize) -> f32 {
        let delay = delay_samples.min(self.length - 1);
        let read_pos = (self.write_pos + self.length - 1 - delay) % self.length;
        self.buffer[read_pos]
    }

    /// Read from the delay line at a fractional delay (in samples) using linear interpolation.
    /// This is essential for smooth, click-free delay-length changes during Space interpolation.
    #[inline]
    pub fn read_interpolated(&self, delay_samples: f32) -> f32 {
        let delay_clamped = delay_samples.max(0.0).min((self.length - 1) as f32);
        let delay_int = delay_clamped as usize;
        let frac = delay_clamped - delay_int as f32;

        let sample_a = self.read(delay_int);
        let sample_b = self.read(delay_int + 1);

        // Linear interpolation
        sample_a + frac * (sample_b - sample_a)
    }

    /// Clear the delay line buffer (fill with zeros).
    pub fn clear(&mut self) {
        self.buffer.fill(0.0);
        self.write_pos = 0;
    }

    /// Read the current buffer energy (RMS) — useful for diagnostics/tests.
    pub fn energy(&self) -> f32 {
        let sum_sq: f32 = self.buffer.iter().map(|s| s * s).sum();
        (sum_sq / self.length as f32).sqrt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_delay_line_basic() {
        let mut dl = DelayLine::new(4);

        // Write samples 1, 2, 3, 4
        dl.write(1.0);
        dl.write(2.0);
        dl.write(3.0);
        dl.write(4.0);

        // Read at delay=0 should be the most recent sample
        assert_eq!(dl.read(0), 4.0);
        // delay=1 should be the previous sample
        assert_eq!(dl.read(1), 3.0);
        assert_eq!(dl.read(2), 2.0);
        assert_eq!(dl.read(3), 1.0);
    }

    #[test]
    fn test_delay_line_wrapping() {
        let mut dl = DelayLine::new(4);

        // Write 6 samples (wraps around)
        for i in 1..=6 {
            dl.write(i as f32);
        }

        assert_eq!(dl.read(0), 6.0);
        assert_eq!(dl.read(1), 5.0);
        assert_eq!(dl.read(2), 4.0);
        assert_eq!(dl.read(3), 3.0);
    }

    #[test]
    fn test_delay_line_interpolated() {
        let mut dl = DelayLine::new(8);

        dl.write(0.0);
        dl.write(1.0);
        dl.write(2.0);
        dl.write(4.0);

        // Fractional read — midpoint between delay=1 (4.0) and delay=2 (2.0)
        let val = dl.read_interpolated(1.5);
        assert!((val - 1.5).abs() < 1e-6, "Expected 1.5, got {}", val);
    }

    #[test]
    fn test_delay_line_clear() {
        let mut dl = DelayLine::new(4);
        dl.write(1.0);
        dl.write(2.0);
        dl.clear();

        assert_eq!(dl.read(0), 0.0);
        assert_eq!(dl.read(1), 0.0);
    }
}
