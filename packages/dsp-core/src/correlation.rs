/// Running phase-correlation meter for stereo signals.
///
/// Phase Correlation Coefficient Definition:
///   correlation = sum(L * R) / sqrt( sum(L^2) * sum(R^2) )
///
/// Output Range:
///   +1.0 : Perfect in-phase mono (L == R). Fully mono-compatible.
///    0.0 : Completely decorrelated / orthogonal stereo channels.
///   -1.0 : Perfect out-of-phase (L == -R). Folds to silence in mono.

/// Calculates exact phase correlation for a block of samples.
pub fn compute_block_correlation(left: &[f32], right: &[f32]) -> f32 {
    let len = left.len().min(right.len());
    if len == 0 {
        return 1.0;
    }

    let mut sum_lr = 0.0f64;
    let mut sum_l2 = 0.0f64;
    let mut sum_r2 = 0.0f64;

    for i in 0..len {
        let l = left[i] as f64;
        let r = right[i] as f64;
        sum_lr += l * r;
        sum_l2 += l * l;
        sum_r2 += r * r;
    }

    let denom = (sum_l2 * sum_r2).sqrt();
    if denom < 1e-12 {
        1.0 // Default for silence
    } else {
        ((sum_lr / denom) as f32).clamp(-1.0, 1.0)
    }
}

/// Rolling phase correlation meter with ballistic smoothing (approx. 300ms window).
#[derive(Debug, Clone)]
pub struct CorrelationMeter {
    sum_lr: f64,
    sum_l2: f64,
    sum_r2: f64,
    alpha: f64, // Exponential smoothing coefficient
}

impl CorrelationMeter {
    /// Creates a new CorrelationMeter.
    /// `sample_rate`: e.g. 44100.0 or 48000.0
    /// `time_constant_sec`: ballistics window duration in seconds (e.g. 0.3 for 300ms)
    pub fn new(sample_rate: f32, time_constant_sec: f32) -> Self {
        let dt = 1.0 / sample_rate as f64;
        let tau = time_constant_sec.max(0.001) as f64;
        let alpha = (-dt / tau).exp();
        Self {
            sum_lr: 0.0,
            sum_l2: 0.0,
            sum_r2: 0.0,
            alpha,
        }
    }

    /// Reset internal state.
    pub fn reset(&mut self) {
        self.sum_lr = 0.0;
        self.sum_l2 = 0.0;
        self.sum_r2 = 0.0;
    }

    /// Process a single sample pair and update running state.
    pub fn process_sample(&mut self, left: f32, right: f32) {
        let l = left as f64;
        let r = right as f64;

        let one_minus_alpha = 1.0 - self.alpha;
        self.sum_lr = self.alpha * self.sum_lr + one_minus_alpha * (l * r);
        self.sum_l2 = self.alpha * self.sum_l2 + one_minus_alpha * (l * l);
        self.sum_r2 = self.alpha * self.sum_r2 + one_minus_alpha * (r * r);
    }

    /// Process a block of audio samples.
    pub fn process_block(&mut self, left: &[f32], right: &[f32]) {
        let len = left.len().min(right.len());
        for i in 0..len {
            self.process_sample(left[i], right[i]);
        }
    }

    /// Returns current running correlation value in range [-1.0, +1.0].
    pub fn correlation(&self) -> f32 {
        let denom = (self.sum_l2 * self.sum_r2).sqrt();
        if denom < 1e-12 {
            1.0
        } else {
            ((self.sum_lr / denom) as f32).clamp(-1.0, 1.0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_in_phase_mono_doubled_signal() {
        // Perfectly in-phase L = R signal -> correlation must be +1.0
        let len = 4410;
        let left: Vec<f32> = (0..len).map(|i| (i as f32 * 0.05).sin()).collect();
        let right = left.clone();

        let block_corr = compute_block_correlation(&left, &right);
        assert!(
            (block_corr - 1.0).abs() < 1e-5,
            "Block correlation for mono signal was {}, expected +1.0",
            block_corr
        );

        let mut meter = CorrelationMeter::new(44100.0, 0.3);
        meter.process_block(&left, &right);
        assert!(
            (meter.correlation() - 1.0).abs() < 1e-4,
            "Meter correlation for mono signal was {}, expected +1.0",
            meter.correlation()
        );
    }

    #[test]
    fn test_inverted_phase_signal() {
        // Perfectly inverted phase L = -R -> correlation must be -1.0
        let len = 4410;
        let left: Vec<f32> = (0..len).map(|i| (i as f32 * 0.05).sin()).collect();
        let right: Vec<f32> = left.iter().map(|&s| -s).collect();

        let block_corr = compute_block_correlation(&left, &right);
        assert!(
            (block_corr - (-1.0)).abs() < 1e-5,
            "Block correlation for inverted signal was {}, expected -1.0",
            block_corr
        );

        let mut meter = CorrelationMeter::new(44100.0, 0.3);
        meter.process_block(&left, &right);
        assert!(
            (meter.correlation() - (-1.0)).abs() < 1e-4,
            "Meter correlation for inverted signal was {}, expected -1.0",
            meter.correlation()
        );
    }

    #[test]
    fn test_decorrelated_noise_signal() {
        // Independent zero-mean random noise on L and R -> correlation must be ≈ 0.0
        let len = 44100; // 1 second of noise
        let mut seed_l: u64 = 0xDEADC0DE;
        let mut seed_r: u64 = 0xCAFEBABE;

        let mut left = vec![0.0f32; len];
        let mut right = vec![0.0f32; len];

        for i in 0..len {
            seed_l = seed_l.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            left[i] = (((seed_l >> 32) as f64 / 4294967295.0) * 2.0 - 1.0) as f32;
            seed_r = seed_r.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            right[i] = (((seed_r >> 32) as f64 / 4294967295.0) * 2.0 - 1.0) as f32;
        }

        let block_corr = compute_block_correlation(&left, &right);
        assert!(
            block_corr.abs() < 0.05,
            "Block correlation for decorrelated noise was {}, expected ≈ 0.0",
            block_corr
        );

        let mut meter = CorrelationMeter::new(44100.0, 0.3);
        meter.process_block(&left, &right);
        assert!(
            meter.correlation().abs() < 0.05,
            "Meter correlation for decorrelated noise was {}, expected ≈ 0.0",
            meter.correlation()
        );
    }
}
