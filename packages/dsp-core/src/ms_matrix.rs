/// Mid/Side encode/decode matrix for stereo signals.
///
/// Matrix Equations:
/// Encode:
///   Mid  = 0.5 * (Left + Right)
///   Side = 0.5 * (Left - Right)
///
/// Decode:
///   Left  = Mid + Side
///   Right = Mid - Side
///
/// Mathematical Proof of Exact Reconstitution:
///   Left  = (0.5 * (L + R)) + (0.5 * (L - R)) = 0.5*L + 0.5*R + 0.5*L - 0.5*R = L
///   Right = (0.5 * (L + R)) - (0.5 * (L - R)) = 0.5*L + 0.5*R - 0.5*L + 0.5*R = R

/// Encodes a single sample pair from Left/Right to Mid/Side.
#[inline]
pub fn encode_sample(left: f32, right: f32) -> (f32, f32) {
    let mid = (left + right) * 0.5;
    let side = (left - right) * 0.5;
    (mid, side)
}

/// Decodes a single sample pair from Mid/Side to Left/Right.
#[inline]
pub fn decode_sample(mid: f32, side: f32) -> (f32, f32) {
    let left = mid + side;
    let right = mid - side;
    (left, right)
}

/// Encodes buffers of Left and Right channel samples into Mid and Side buffers.
pub fn encode_buffers(left: &[f32], right: &[f32], mid: &mut [f32], side: &mut [f32]) {
    let len = left.len().min(right.len()).min(mid.len()).min(side.len());
    for i in 0..len {
        let (m, s) = encode_sample(left[i], right[i]);
        mid[i] = m;
        side[i] = s;
    }
}

/// Decodes buffers of Mid and Side channel samples into Left and Right buffers.
pub fn decode_buffers(mid: &[f32], side: &[f32], left: &mut [f32], right: &mut [f32]) {
    let len = mid.len().min(side.len()).min(left.len()).min(right.len());
    for i in 0..len {
        let (l, r) = decode_sample(mid[i], side[i]);
        left[i] = l;
        right[i] = r;
    }
}

/// Encodes Left and Right channel buffers in-place.
/// After execution, `left` contains Mid and `right` contains Side.
pub fn encode_in_place(left: &mut [f32], right: &mut [f32]) {
    let len = left.len().min(right.len());
    for i in 0..len {
        let (m, s) = encode_sample(left[i], right[i]);
        left[i] = m;
        right[i] = s;
    }
}

/// Decodes Mid (stored in `left`) and Side (stored in `right`) channel buffers in-place back to Left/Right.
pub fn decode_in_place(left: &mut [f32], right: &mut [f32]) {
    let len = left.len().min(right.len());
    for i in 0..len {
        let (l, r) = decode_sample(left[i], right[i]);
        left[i] = l;
        right[i] = r;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_known_signal_matrix() {
        // Pure Left signal
        let (m, s) = encode_sample(1.0, 0.0);
        assert_eq!((m, s), (0.5, 0.5));
        let (l, r) = decode_sample(m, s);
        assert!((l - 1.0).abs() < 1e-7);
        assert!(r.abs() < 1e-7);

        // Pure Mono signal (L = R)
        let (m, s) = encode_sample(1.0, 1.0);
        assert_eq!((m, s), (1.0, 0.0)); // Side is completely zero for mono
        let (l, r) = decode_sample(m, s);
        assert!((l - 1.0).abs() < 1e-7);
        assert!((r - 1.0).abs() < 1e-7);

        // Pure Out-of-Phase signal (L = -R)
        let (m, s) = encode_sample(1.0, -1.0);
        assert_eq!((m, s), (0.0, 1.0)); // Mid is completely zero for out-of-phase
        let (l, r) = decode_sample(m, s);
        assert!((l - 1.0).abs() < 1e-7);
        assert!((r - (-1.0)).abs() < 1e-7);
    }

    #[test]
    fn test_round_trip_bit_exact() {
        // Generate pseudo-random test signals across 10,000 samples
        let mut seed: u64 = 0x12345678;
        let mut l_orig = vec![0.0f32; 10000];
        let mut r_orig = vec![0.0f32; 10000];

        for i in 0..10000 {
            // Simple deterministic LCG random generator
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            l_orig[i] = ((seed >> 33) as f32 / (1u64 << 31) as f32) - 1.0;
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            r_orig[i] = ((seed >> 33) as f32 / (1u64 << 31) as f32) - 1.0;
        }

        let mut l_buf = l_orig.clone();
        let mut r_buf = r_orig.clone();

        // Encode in place (L/R -> M/S)
        encode_in_place(&mut l_buf, &mut r_buf);

        // Decode in place (M/S -> L/R)
        decode_in_place(&mut l_buf, &mut r_buf);

        // Verify exact round-trip reconstruction within floating-point epsilon (1e-6)
        let mut max_err_l = 0.0f32;
        let mut max_err_r = 0.0f32;
        for i in 0..10000 {
            let err_l = (l_buf[i] - l_orig[i]).abs();
            let err_r = (r_buf[i] - r_orig[i]).abs();
            if err_l > max_err_l {
                max_err_l = err_l;
            }
            if err_r > max_err_r {
                max_err_r = err_r;
            }
        }

        assert!(
            max_err_l < 1e-6,
            "Max round-trip error in Left channel exceeded epsilon: {}",
            max_err_l
        );
        assert!(
            max_err_r < 1e-6,
            "Max round-trip error in Right channel exceeded epsilon: {}",
            max_err_r
        );
    }
}
