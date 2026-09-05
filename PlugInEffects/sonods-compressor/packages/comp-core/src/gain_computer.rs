//! Static gain computer implementing the soft-knee compressor curve.
//! Reference: Giannoulis, Massberg & Reiss,
//! "Digital Dynamic Range Compressor Design — A Tutorial and Analysis",
//! JAES vol. 60 no. 6, 2012.

/// Computes the gain reduction in dB for a given signal level in dBFS.
///
/// Returns a non-negative value (0.0 means no compression, >0 means gain reduction).
/// The actual gain multiplier in linear domain will be `10.0^(-gain_reduction_db / 20.0)`.
pub fn gain_reduction_db(level_db: f64, threshold_db: f64, ratio: f64, knee_width_db: f64) -> f64 {
    // If ratio is 1.0 (unity), it's an exact no-op regardless of level/threshold
    if (ratio - 1.0).abs() < 1e-9 {
        return 0.0;
    }

    let overshoot = level_db - threshold_db;
    let half_knee = knee_width_db * 0.5;

    // Case 1: Below knee boundary -> no reduction
    if overshoot <= -half_knee {
        return 0.0;
    }

    let slope = 1.0 - 1.0 / ratio;

    // Case 2: Above knee boundary -> standard linear ratio reduction
    if overshoot >= half_knee {
        return overshoot * slope;
    }

    // Case 3: Inside quadratic soft knee
    // Giannoulis formula: yG = xG + ((1/R - 1) * (xG - T + W/2)^2) / (2W)
    // Gain reduction GR_dB = xG - yG = (1 - 1/R) * (overshoot + W/2)^2 / (2W)
    let k = overshoot + half_knee;
    (slope * k * k) / (2.0 * knee_width_db)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unity_ratio_is_exact_noop() {
        for level in &[-60.0, -20.0, -6.0, 0.0, 6.0, 20.0] {
            assert_eq!(gain_reduction_db(*level, -12.0, 1.0, 6.0), 0.0);
        }
    }

    #[test]
    fn test_below_knee_is_zero() {
        let threshold = -10.0;
        let knee = 6.0;
        // Below threshold - 3dB (i.e. <= -13dB)
        assert_eq!(gain_reduction_db(-20.0, threshold, 4.0, knee), 0.0);
        assert_eq!(gain_reduction_db(-13.0, threshold, 4.0, knee), 0.0);
    }

    #[test]
    fn test_above_knee_is_linear_slope() {
        let threshold = -10.0;
        let knee = 6.0;
        let ratio = 4.0;
        let _slope = 1.0 - 1.0 / ratio; // 0.75

        // Above threshold + 3dB (i.e. >= -7dB)
        // At level = 0dB: overshoot = 10dB, expected GR = 10 * 0.75 = 7.5 dB
        let gr = gain_reduction_db(0.0, threshold, ratio, knee);
        assert!((gr - 7.5).abs() < 1e-9);

        // At level = +10dB: overshoot = 20dB, expected GR = 20 * 0.75 = 15.0 dB
        let gr2 = gain_reduction_db(10.0, threshold, ratio, knee);
        assert!((gr2 - 15.0).abs() < 1e-9);
    }

    #[test]
    fn test_knee_continuity_and_smoothness() {
        let threshold = -12.0;
        let knee = 8.0;
        let ratio = 4.0;
        let half_knee = knee * 0.5; // 4.0

        let lower_boundary = threshold - half_knee; // -16.0
        let upper_boundary = threshold + half_knee; // -8.0

        let eps = 1e-6;

        // Continuity at lower boundary
        let val_below = gain_reduction_db(lower_boundary - eps, threshold, ratio, knee);
        let val_at = gain_reduction_db(lower_boundary, threshold, ratio, knee);
        let val_above = gain_reduction_db(lower_boundary + eps, threshold, ratio, knee);

        assert_eq!(val_below, 0.0);
        assert_eq!(val_at, 0.0);
        assert!(val_above >= 0.0 && val_above < 1e-6);

        // Continuity at upper boundary
        let val_in_knee = gain_reduction_db(upper_boundary - eps, threshold, ratio, knee);
        let val_at_upper = gain_reduction_db(upper_boundary, threshold, ratio, knee);
        let val_above_upper = gain_reduction_db(upper_boundary + eps, threshold, ratio, knee);

        assert!((val_in_knee - val_at_upper).abs() < 1e-4);
        assert!((val_above_upper - val_at_upper).abs() < 1e-4);

        // Derivative continuity check (numerical slope match at upper boundary)
        let slope_inside = (val_at_upper - val_in_knee) / eps;
        let slope_outside = (val_above_upper - val_at_upper) / eps;
        assert!((slope_inside - slope_outside).abs() < 1e-3);
    }

    #[test]
    fn test_monotonically_increasing_above_threshold() {
        let threshold = -15.0;
        let knee = 6.0;
        let ratio = 3.0;

        let mut prev_gr = 0.0;
        for i in -20..=20 {
            let lvl = i as f64;
            let gr = gain_reduction_db(lvl, threshold, ratio, knee);
            assert!(gr >= prev_gr, "GR must be monotonic: gr={} < prev={}", gr, prev_gr);
            prev_gr = gr;
        }
    }
}
