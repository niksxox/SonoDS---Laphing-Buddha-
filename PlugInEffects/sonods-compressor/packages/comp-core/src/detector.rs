//! Level detectors: Peak, RMS, and linear-blended detector.
//!
//! Important design rule per Engineering Spec §1.2:
//! Blending Peak and RMS must happen in the LINEAR domain before conversion to dB.
//! Blending post-dB-conversion produces audibly distorted/wrong results at extreme settings.

/// Instantaneous absolute peak level detector with instantaneous response.
#[derive(Debug, Clone, Default)]
pub struct PeakDetector;

impl PeakDetector {
    pub fn new() -> Self {
        Self
    }

    #[inline]
    pub fn process_sample(&mut self, sample: f64) -> f64 {
        sample.abs()
    }
}

/// Running windowed RMS detector using a one-pole leaky integrator on x[n]^2.
///
/// mean_sq[n] = alpha * mean_sq[n-1] + (1 - alpha) * x[n]^2
#[derive(Debug, Clone)]
pub struct RmsDetector {
    alpha: f64,
    mean_sq: f64,
}

impl RmsDetector {
    /// Creates an RMS detector with a given window time constant in seconds (default ~10ms = 0.010s).
    pub fn new(window_seconds: f64, sample_rate: f64) -> Self {
        let alpha = (-1.0 / (sample_rate * window_seconds.max(1e-5))).exp();
        Self {
            alpha,
            mean_sq: 0.0,
        }
    }

    pub fn set_window(&mut self, window_seconds: f64, sample_rate: f64) {
        self.alpha = (-1.0 / (sample_rate * window_seconds.max(1e-5))).exp();
    }

    pub fn reset(&mut self) {
        self.mean_sq = 0.0;
    }

    #[inline]
    pub fn process_sample(&mut self, sample: f64) -> f64 {
        let sq = sample * sample;
        self.mean_sq = crate::denormals::flush_denormal(self.alpha * self.mean_sq + (1.0 - self.alpha) * sq);
        self.mean_sq.sqrt()
    }

    #[inline]
    pub fn mean_sq(&self) -> f64 {
        self.mean_sq
    }
}

/// Blended detector combining Peak and RMS in the linear domain before dB conversion.
///
/// `peak_rms_blend`: 0.0 = pure RMS, 1.0 = pure Peak.
#[derive(Debug, Clone)]
pub struct BlendedDetector {
    peak: PeakDetector,
    rms: RmsDetector,
    blend: f64,
}

impl BlendedDetector {
    pub fn new(window_seconds: f64, sample_rate: f64, blend: f64) -> Self {
        Self {
            peak: PeakDetector::new(),
            rms: RmsDetector::new(window_seconds, sample_rate),
            blend: blend.clamp(0.0, 1.0),
        }
    }

    pub fn set_blend(&mut self, blend: f64) {
        self.blend = blend.clamp(0.0, 1.0);
    }

    pub fn reset(&mut self) {
        self.rms.reset();
    }

    /// Processes a sample, blending in the linear domain, and returns the level in dBFS.
    #[inline]
    pub fn process_sample_db(&mut self, sample: f64) -> f64 {
        let peak_lin = self.peak.process_sample(sample);
        let rms_lin = self.rms.process_sample(sample);

        // Linear domain blend: (1 - blend)*RMS + blend*Peak
        let blended_lin = (1.0 - self.blend) * rms_lin + self.blend * peak_lin;

        // Convert linear amplitude to dBFS with epsilon protection
        20.0 * (blended_lin + 1e-12).log10()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_peak_detector_impulse_response() {
        let mut peak = PeakDetector::new();
        // A single impulse of 0.8
        let out = peak.process_sample(0.8);
        assert_eq!(out, 0.8);
        // Negative impulse
        let out_neg = peak.process_sample(-0.5);
        assert_eq!(out_neg, 0.5);
        // Returns to 0 immediately
        assert_eq!(peak.process_sample(0.0), 0.0);
    }

    #[test]
    fn test_rms_detector_step_response() {
        let sample_rate = 44100.0;
        let window_s = 0.010; // 10ms
        let mut rms = RmsDetector::new(window_s, sample_rate);

        // Feed constant DC signal of 1.0
        let samples_to_test = (sample_rate * window_s) as usize;
        let mut last_val = 0.0;
        for _ in 0..samples_to_test {
            last_val = rms.process_sample(1.0);
        }

        // At 1 time constant (10ms), leaky integrator reaches 1 - e^-1 ~= 0.6321 in power,
        // and sqrt(0.6321) ~= 0.795
        assert!((last_val - 0.795).abs() < 0.02, "Expected ~0.795, got {}", last_val);

        // After 5 time constants, it should be very close to 1.0
        for _ in 0..(samples_to_test * 4) {
            last_val = rms.process_sample(1.0);
        }
        assert!((last_val - 1.0).abs() < 0.01, "Expected ~1.0, got {}", last_val);
    }

    #[test]
    fn test_blend_happens_in_linear_domain_before_db() {
        let sample_rate = 48000.0;
        let mut detector = BlendedDetector::new(0.010, sample_rate, 0.5);

        // Test with a sample of amplitude 0.5
        // At blend = 0.5: linear blend of peak (0.5) and rms (start 0.0) is (0.5 * 0.5) = 0.25
        // 20*log10(0.25) ~= -12.04 dB
        let db = detector.process_sample_db(0.5);
        let expected_linear = 0.5 * 0.5 + 0.5 * (0.5 * 0.5 * (1.0 - (-1.0 / (48000.0 * 0.010_f64)).exp())).sqrt();
        let expected_db = 20.0 * expected_linear.log10();
        assert!((db - expected_db).abs() < 0.05);

        // If blend were in dB domain:
        // peak_db = 20*log10(0.5) ~= -6.02 dB
        // rms_db ~= very negative dB
        // (peak_db + rms_db)/2 would be wildly negative, not ~ -12 dB!
        assert!(db > -25.0, "Linear blend must not drop to deep negative dB: {}", db);
    }
}
