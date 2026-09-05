/// Single-band Width control using Mid/Side matrix balancing.
///
/// Math:
///   1. Encode L/R to Mid/Side:
///        Mid  = 0.5 * (Left + Right)
///        Side = 0.5 * (Left - Right)
///   2. Scale Side channel by `width`:
///        Side_adj = Side * width
///   3. Decode back to L/R:
///        Left_out  = Mid + Side_adj
///        Right_out = Mid - Side_adj
///
/// Behavior per width value:
///   width = 0.0 : Side is completely removed. Left_out == Right_out == Mid (100% Mono).
///   width = 1.0 : Original unmodified stereo signal.
///   width > 1.0 : Side channel is boosted up to max limit (e.g., 2.0), enhancing stereo width.

use crate::ms_matrix::{decode_sample, encode_sample};

/// Maximum safe width boost factor (2.0 = +6dB side boost).
pub const MAX_WIDTH: f32 = 2.0;

/// Process a single stereo sample pair with the specified width control.
#[inline]
pub fn apply_width_sample(left: f32, right: f32, width: f32) -> (f32, f32) {
    let width_clamped = width.clamp(0.0, MAX_WIDTH);
    let (mid, side) = encode_sample(left, right);
    let side_adj = side * width_clamped;
    decode_sample(mid, side_adj)
}

/// Process stereo sample buffers with width control in-place.
pub fn apply_width_in_place(left: &mut [f32], right: &mut [f32], width: f32) {
    let width_clamped = width.clamp(0.0, MAX_WIDTH);
    let len = left.len().min(right.len());
    for i in 0..len {
        let (mid, side) = encode_sample(left[i], right[i]);
        let side_adj = side * width_clamped;
        let (l_out, r_out) = decode_sample(mid, side_adj);
        left[i] = l_out;
        right[i] = r_out;
    }
}

/// Process stereo sample buffers into separate output buffers with width control.
pub fn apply_width_buffers(
    left: &[f32],
    right: &[f32],
    out_left: &mut [f32],
    out_right: &mut [f32],
    width: f32,
) {
    let width_clamped = width.clamp(0.0, MAX_WIDTH);
    let len = left.len().min(right.len()).min(out_left.len()).min(out_right.len());
    for i in 0..len {
        let (mid, side) = encode_sample(left[i], right[i]);
        let side_adj = side * width_clamped;
        let (l_out, r_out) = decode_sample(mid, side_adj);
        out_left[i] = l_out;
        out_right[i] = r_out;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::correlation::compute_block_correlation;

    #[test]
    fn test_width_zero_produces_perfect_mono() {
        let len = 1000;
        let mut left: Vec<f32> = (0..len).map(|i| (i as f32 * 0.1).sin()).collect();
        let mut right: Vec<f32> = (0..len).map(|i| (i as f32 * 0.15 + 0.5).cos()).collect();

        apply_width_in_place(&mut left, &mut right, 0.0);

        for i in 0..len {
            assert!(
                (left[i] - right[i]).abs() < 1e-7,
                "Sample {} differed between L ({}) and R ({}) at width=0",
                i,
                left[i],
                right[i]
            );
        }

        let corr = compute_block_correlation(&left, &right);
        assert!((corr - 1.0).abs() < 1e-5, "Correlation at width=0 was {}, expected +1.0", corr);
    }

    #[test]
    fn test_width_one_produces_unmodified_signal() {
        let len = 1000;
        let left_orig: Vec<f32> = (0..len).map(|i| (i as f32 * 0.1).sin()).collect();
        let right_orig: Vec<f32> = (0..len).map(|i| (i as f32 * 0.15 + 0.5).cos()).collect();

        let mut left = left_orig.clone();
        let mut right = right_orig.clone();

        apply_width_in_place(&mut left, &mut right, 1.0);

        for i in 0..len {
            assert!(
                (left[i] - left_orig[i]).abs() < 1e-6,
                "Left sample {} changed at width=1",
                i
            );
            assert!(
                (right[i] - right_orig[i]).abs() < 1e-6,
                "Right sample {} changed at width=1",
                i
            );
        }
    }

    #[test]
    fn test_width_boost_increases_side_energy_and_lowers_correlation() {
        let len = 4410;
        let left_orig: Vec<f32> = (0..len).map(|i| (i as f32 * 0.05).sin() + 0.3 * (i as f32 * 0.12).cos()).collect();
        let right_orig: Vec<f32> = (0..len).map(|i| (i as f32 * 0.05).sin() - 0.3 * (i as f32 * 0.12).cos()).collect();

        // Measure original at width=1.0
        let mut l_1 = left_orig.clone();
        let mut r_1 = right_orig.clone();
        apply_width_in_place(&mut l_1, &mut r_1, 1.0);
        let corr_1 = compute_block_correlation(&l_1, &r_1);

        // Measure side energy at width=1.0
        let side_energy_1: f32 = l_1.iter().zip(r_1.iter()).map(|(&l, &r)| (l - r) * (l - r)).sum();

        // Measure widened at width=1.8
        let mut l_widened = left_orig.clone();
        let mut r_widened = right_orig.clone();
        apply_width_in_place(&mut l_widened, &mut r_widened, 1.8);
        let corr_widened = compute_block_correlation(&l_widened, &r_widened);

        let side_energy_widened: f32 = l_widened
            .iter()
            .zip(r_widened.iter())
            .map(|(&l, &r)| (l - r) * (l - r))
            .sum();

        // Side channel energy must be significantly higher
        assert!(
            side_energy_widened > side_energy_1 * 2.0,
            "Side energy widened ({}) was not > 2x original ({})",
            side_energy_widened,
            side_energy_1
        );

        // Phase correlation must decrease when widened
        assert!(
            corr_widened < corr_1,
            "Widened correlation ({}) was not less than original correlation ({})",
            corr_widened,
            corr_1
        );
    }
}
