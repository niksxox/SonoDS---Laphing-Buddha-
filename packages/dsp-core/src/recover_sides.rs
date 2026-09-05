/// Recover Sides (Ozone Imager-style side-energy recovery during narrowing).
///
/// Math:
///   When width $W < 1.0$:
///     $S_{orig} = 0.5 * (Left - Right)$
///     $S_{narrow} = S_{orig} * W$
///     $S_{removed} = S_{orig} * (1.0 - W)$
///     $S_{recovered} = S_{narrow} + (RecoverAmount * S_{removed})$
///
///   When width $W >= 1.0$:
///     $S_{recovered} = S_{orig} * W$ (Recovery only acts during narrowing).
///
/// Safety Contract:
///   If Width == 0.0 AND RecoverAmount == 0.0, output is 100% MONO ($S_{recovered} == 0.0$).
///   Recover Sides never overrides an explicit mono setting when RecoverAmount == 0.0.

use crate::ms_matrix::{decode_sample, encode_sample};

#[derive(Debug, Clone, Copy)]
pub struct RecoverSidesControl {
    recover_amount: f32, // 0.0 to 1.0
}

impl RecoverSidesControl {
    pub fn new(recover_amount: f32) -> Self {
        Self {
            recover_amount: recover_amount.clamp(0.0, 1.0),
        }
    }

    pub fn recover_amount(&self) -> f32 {
        self.recover_amount
    }

    pub fn set_recover_amount(&mut self, amount: f32) {
        self.recover_amount = amount.clamp(0.0, 1.0);
    }

    /// Process a single stereo sample pair with width and recover-sides blend.
    #[inline]
    pub fn process_sample(&self, left: f32, right: f32, width: f32) -> (f32, f32) {
        let (mid, side_orig) = encode_sample(left, right);

        let side_out = if width < 1.0 {
            let side_narrow = side_orig * width.max(0.0);
            let side_removed = side_orig * (1.0 - width.max(0.0));
            side_narrow + (self.recover_amount * side_removed)
        } else {
            side_orig * width.min(2.0)
        };

        decode_sample(mid, side_out)
    }

    /// Process stereo sample buffers in place with width and recover-sides blend.
    pub fn process_buffers(&self, left: &mut [f32], right: &mut [f32], width: f32) {
        let len = left.len().min(right.len());
        for i in 0..len {
            let (l_out, r_out) = self.process_sample(left[i], right[i], width);
            left[i] = l_out;
            right[i] = r_out;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::correlation::compute_block_correlation;

    #[test]
    fn test_recover_sides_zero_amount_with_zero_width_is_perfect_mono() {
        let recover = RecoverSidesControl::new(0.0);
        let len = 1000;
        let mut left: Vec<f32> = (0..len).map(|i| (i as f32 * 0.1).sin()).collect();
        let mut right: Vec<f32> = (0..len).map(|i| (i as f32 * 0.15 + 0.4).cos()).collect();

        recover.process_buffers(&mut left, &mut right, 0.0);

        for i in 0..len {
            assert!(
                (left[i] - right[i]).abs() < 1e-7,
                "Sample {} differed when width=0 and recover=0",
                i
            );
        }

        let corr = compute_block_correlation(&left, &right);
        assert!((corr - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_recover_sides_reintroduces_side_energy_during_narrowing() {
        let len = 4410;
        let left_orig: Vec<f32> = (0..len).map(|i| (i as f32 * 0.05).sin() + 0.4 * (i as f32 * 0.12).cos()).collect();
        let right_orig: Vec<f32> = (0..len).map(|i| (i as f32 * 0.05).sin() - 0.4 * (i as f32 * 0.12).cos()).collect();

        // 1. Process narrowed with Width = 0.2, Recover = 0.0
        let rec_off = RecoverSidesControl::new(0.0);
        let mut l_off = left_orig.clone();
        let mut r_off = right_orig.clone();
        rec_off.process_buffers(&mut l_off, &mut r_off, 0.2);

        let side_energy_off: f32 = l_off.iter().zip(r_off.iter()).map(|(&l, &r)| (l - r) * (l - r)).sum();

        // 2. Process narrowed with Width = 0.2, Recover = 0.5
        let rec_on = RecoverSidesControl::new(0.5);
        let mut l_on = left_orig.clone();
        let mut r_on = right_orig.clone();
        rec_on.process_buffers(&mut l_on, &mut r_on, 0.2);

        let side_energy_on: f32 = l_on.iter().zip(r_on.iter()).map(|(&l, &r)| (l - r) * (l - r)).sum();

        // Recover sides must measurably increase side energy relative to width alone
        assert!(
            side_energy_on > side_energy_off * 3.0,
            "Side energy with recovery ({}) was not > 3x without recovery ({})",
            side_energy_on,
            side_energy_off
        );
    }
}
