/// Asymmetry / Balance Control.
///
/// Post M/S processing L/R gain trim applied after the width processing chain.
/// Kept conceptually and computationally separate from Mid/Side matrix operations so that
/// balance changes never alter the underlying stereo width or phase correlation.
///
/// Parameter Range:
///   asymmetry = -1.0 : 100% Left  (Left gain = 1.0, Right gain = 0.0)
///   asymmetry =  0.0 : Center     (Left gain = 1.0, Right gain = 1.0, 0dB trim)
///   asymmetry = +1.0 : 100% Right (Left gain = 0.0, Right gain = 1.0)

#[derive(Debug, Clone, Copy)]
pub struct AsymmetryControl {
    asymmetry: f32, // -1.0 to +1.0
}

impl AsymmetryControl {
    pub fn new(asymmetry: f32) -> Self {
        Self {
            asymmetry: asymmetry.clamp(-1.0, 1.0),
        }
    }

    pub fn asymmetry(&self) -> f32 {
        self.asymmetry
    }

    pub fn set_asymmetry(&mut self, asymmetry: f32) {
        self.asymmetry = asymmetry.clamp(-1.0, 1.0);
    }

    /// Calculate independent Left and Right gain multipliers.
    #[inline]
    pub fn gains(&self) -> (f32, f32) {
        if self.asymmetry <= 0.0 {
            (1.0, 1.0 + self.asymmetry)
        } else {
            (1.0 - self.asymmetry, 1.0)
        }
    }

    /// Apply balance gain trim to a stereo sample pair.
    #[inline]
    pub fn process_sample(&self, left: f32, right: f32) -> (f32, f32) {
        let (gain_l, gain_r) = self.gains();
        (left * gain_l, right * gain_r)
    }

    /// Apply balance gain trim to stereo sample buffers in place.
    pub fn process_buffers(&self, left: &mut [f32], right: &mut [f32]) {
        let (gain_l, gain_r) = self.gains();
        let len = left.len().min(right.len());
        for i in 0..len {
            left[i] *= gain_l;
            right[i] *= gain_r;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::correlation::compute_block_correlation;

    #[test]
    fn test_asymmetry_changes_gain_balance_without_altering_correlation() {
        let len = 44100;
        let mut seed: u64 = 0x55555555;

        // Generate stereo signal with specific known correlation
        let mut left_orig = vec![0.0f32; len];
        let mut right_orig = vec![0.0f32; len];

        for i in 0..len {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let noise_l = (((seed >> 32) as f64 / 4294967295.0) * 2.0 - 1.0) as f32;
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let noise_r = (((seed >> 32) as f64 / 4294967295.0) * 2.0 - 1.0) as f32;

            left_orig[i] = noise_l * 0.7 + noise_r * 0.3;
            right_orig[i] = noise_l * 0.3 + noise_r * 0.7;
        }

        let orig_corr = compute_block_correlation(&left_orig, &right_orig);

        // Apply Asymmetry = -0.6 (panned left)
        let asym = AsymmetryControl::new(-0.6);
        let mut left_panned = left_orig.clone();
        let mut right_panned = right_orig.clone();
        asym.process_buffers(&mut left_panned, &mut right_panned);

        let panned_corr = compute_block_correlation(&left_panned, &right_panned);

        // Calculate RMS energies
        let left_rms_orig: f32 = (left_orig.iter().map(|&x| x * x).sum::<f32>() / len as f32).sqrt();
        let right_rms_orig: f32 = (right_orig.iter().map(|&x| x * x).sum::<f32>() / len as f32).sqrt();

        let left_rms_panned: f32 = (left_panned.iter().map(|&x| x * x).sum::<f32>() / len as f32).sqrt();
        let right_rms_panned: f32 = (right_panned.iter().map(|&x| x * x).sum::<f32>() / len as f32).sqrt();

        // 1. Left RMS unchanged (gain=1.0), Right RMS reduced to 40% (gain=0.4)
        assert!((left_rms_panned - left_rms_orig).abs() < 1e-5);
        assert!((right_rms_panned - (right_rms_orig * 0.4)).abs() < 1e-4);

        // 2. Correlation remains IDENTICAL (within numerical precision)
        assert!(
            (panned_corr - orig_corr).abs() < 1e-5,
            "Correlation changed from {} to {} when panning",
            orig_corr,
            panned_corr
        );
    }
}
