//! Gain Computer for Gate and Downward Expander per Task 1.3.
//!
//! Acts below threshold to attenuate quiet signals down to the Range floor.
//! Supports adjustable soft knee and continuous expansion ratio.

/// Computes the downward expander gain in dB (negative or zero).
///
/// * `level_db`: Current detected level in dBFS
/// * `threshold`: Gate threshold in dBFS (e.g. -24.0 dB)
/// * `ratio`: Expansion ratio (1.0 = no-op 1:1, 2.0 = 1:2 expansion, 100.0+ = hard gate)
/// * `range_db`: Maximum attenuation floor in dB (negative value, e.g. -60.0 dB)
/// * `knee_width`: Soft knee width in dB (>= 0.0)
pub fn downward_expander_gain(
    level_db: f64,
    threshold: f64,
    ratio: f64,
    range_db: f64,
    knee_width: f64,
) -> f64 {
    // 1:1 ratio is exact no-op
    if ratio <= 1.0000001 {
        return 0.0;
    }

    let delta = level_db - threshold;
    let knee = knee_width.max(0.0);

    let raw_reduction = if knee < 1e-4 {
        // Hard knee
        if delta >= 0.0 {
            0.0
        } else {
            delta * (1.0 - 1.0 / ratio)
        }
    } else {
        // Soft knee: transition band between [threshold - knee/2, threshold + knee/2]
        if 2.0 * delta > knee {
            // Above threshold + knee/2: 0 dB reduction
            0.0
        } else if 2.0 * delta.abs() <= knee {
            // Inside soft knee: smooth quadratic transition from 0 dB down to linear expansion slope
            let x = delta - knee / 2.0;
            -(1.0 - 1.0 / ratio) * x.powi(2) / (2.0 * knee)
        } else {
            // Below threshold - knee/2: full linear downward expansion
            delta * (1.0 - 1.0 / ratio)
        }
    };

    // Ensure range_db is negative (e.g. -60.0 dB)
    let min_gain = -range_db.abs();
    raw_reduction.max(min_gain)
}

/// Computes upward expander gain in dB (positive or zero boost above threshold).
///
/// * `level_db`: Current detected level in dBFS
/// * `threshold`: Expansion threshold in dBFS (e.g. -24.0 dB)
/// * `ratio`: Expansion ratio (1.0 = no-op 1:1, 1.5 = 1:1.5 expansion, 2.0 = 1:2 expansion)
/// * `range_db`: Maximum boost ceiling in dB (positive value, e.g. +24.0 dB)
/// * `knee_width`: Soft knee width in dB (>= 0.0)
pub fn upward_expander_gain(
    level_db: f64,
    threshold: f64,
    ratio: f64,
    range_db: f64,
    knee_width: f64,
) -> f64 {
    // 1:1 ratio is exact no-op
    if ratio <= 1.0000001 {
        return 0.0;
    }

    let delta = level_db - threshold;
    let knee = knee_width.max(0.0);
    let slope = ratio - 1.0;

    let raw_boost = if knee < 1e-4 {
        // Hard knee
        if delta <= 0.0 {
            0.0
        } else {
            delta * slope
        }
    } else {
        // Soft knee: transition band between [threshold - knee/2, threshold + knee/2]
        if 2.0 * delta < -knee {
            // Below threshold - knee/2: 0 dB boost
            0.0
        } else if 2.0 * delta.abs() <= knee {
            // Inside soft knee: smooth quadratic transition from 0 dB up to linear boost slope
            let x = delta + knee / 2.0;
            slope * x.powi(2) / (2.0 * knee)
        } else {
            // Above threshold + knee/2: full linear upward expansion
            delta * slope
        }
    };

    let max_boost = range_db.abs();
    raw_boost.min(max_boost)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unity_ratio_is_exact_noop() {
        for level in &[-60.0, -40.0, -20.0, -10.0, 0.0, 6.0] {
            let gain = downward_expander_gain(*level, -20.0, 1.0, -60.0, 6.0);
            assert_eq!(gain, 0.0, "Ratio 1.0 must produce 0.0 dB gain reduction everywhere");

            let up_gain = upward_expander_gain(*level, -20.0, 1.0, 24.0, 6.0);
            assert_eq!(up_gain, 0.0, "Ratio 1.0 upward must produce 0.0 dB boost everywhere");
        }
    }

    #[test]
    fn test_upward_expansion_below_and_above_threshold() {
        let threshold = -20.0;
        let ratio = 1.5; // slope = 0.5
        let range = 24.0;
        let knee = 0.0; // hard knee

        // 1. Below threshold: zero boost
        assert_eq!(upward_expander_gain(-30.0, threshold, ratio, range, knee), 0.0);
        assert_eq!(upward_expander_gain(-20.0, threshold, ratio, range, knee), 0.0);

        // 2. Above threshold: linear boost
        // Level = -10 dB (delta = +10 dB) -> boost = 10 * 0.5 = +5 dB
        let g1 = upward_expander_gain(-10.0, threshold, ratio, range, knee);
        assert!((g1 - 5.0).abs() < 1e-6);

        // Level = 0 dB (delta = +20 dB) -> boost = 20 * 0.5 = +10 dB
        let g2 = upward_expander_gain(0.0, threshold, ratio, range, knee);
        assert!((g2 - 10.0).abs() < 1e-6);

        // 3. Clamping at range ceiling
        // Level = +40 dB (delta = +60 dB) -> raw boost = 30 dB -> clamped to +24 dB
        let g3 = upward_expander_gain(40.0, threshold, ratio, range, knee);
        assert_eq!(g3, 24.0);
    }

    #[test]
    fn test_upward_expansion_soft_knee() {
        let threshold = -20.0;
        let ratio = 2.0; // slope = 1.0
        let range = 24.0;
        let knee = 6.0; // band: -23.0 dB to -17.0 dB

        let bot_knee = threshold - knee / 2.0; // -23.0 dB
        let mid_knee = threshold; // -20.0 dB
        let top_knee = threshold + knee / 2.0; // -17.0 dB

        let g_bot = upward_expander_gain(bot_knee, threshold, ratio, range, knee);
        let g_mid = upward_expander_gain(mid_knee, threshold, ratio, range, knee);
        let g_top = upward_expander_gain(top_knee, threshold, ratio, range, knee);

        assert_eq!(g_bot, 0.0, "Bottom of upward knee must be 0 dB");
        assert!(g_mid > 0.0 && g_mid < g_top, "Mid knee should be between bot and top");
        assert!((g_top - 3.0).abs() < 1e-6, "Top of upward knee matches linear slope: delta=+3 dB, boost=+3 dB");
    }

    #[test]
    fn test_above_threshold_produces_zero_reduction() {
        let threshold = -20.0;
        let knee = 6.0;
        // Level well above threshold + knee/2 = -17.0 dB
        let level = -10.0;
        let gain = downward_expander_gain(level, threshold, 4.0, -60.0, knee);
        assert_eq!(gain, 0.0);
    }

    #[test]
    fn test_linear_expansion_below_knee() {
        let threshold = -20.0;
        let ratio = 2.0; // slope factor = (1 - 1/2) = 0.5
        let knee = 0.0; // hard knee
        let range = -60.0;

        // Level = -30 dB (delta = -10 dB)
        // Reduction = -10 * 0.5 = -5 dB
        let gain = downward_expander_gain(-30.0, threshold, ratio, range, knee);
        assert!((gain - -5.0).abs() < 1e-6);

        // Level = -40 dB (delta = -20 dB)
        // Reduction = -20 * 0.5 = -10 dB
        let gain2 = downward_expander_gain(-40.0, threshold, ratio, range, knee);
        assert!((gain2 - -10.0).abs() < 1e-6);
    }

    #[test]
    fn test_range_floor_clamping() {
        let threshold = -20.0;
        let ratio = 10.0; // aggressive gate
        let range = -40.0; // max 40 dB attenuation floor
        let knee = 0.0;

        // Level = -60 dB (delta = -40 dB)
        // raw reduction = -40 * 0.9 = -36 dB
        let gain1 = downward_expander_gain(-60.0, threshold, ratio, range, knee);
        assert!((gain1 - -36.0).abs() < 1e-6);

        // Level = -80 dB (delta = -60 dB)
        // raw reduction = -60 * 0.9 = -54 dB -> clamped to -40 dB
        let gain2 = downward_expander_gain(-80.0, threshold, ratio, range, knee);
        assert_eq!(gain2, -40.0);
    }

    #[test]
    fn test_soft_knee_smoothness_and_continuity() {
        let threshold = -20.0;
        let ratio = 4.0;
        let range = -60.0;
        let knee = 6.0; // band: -23.0 dB to -17.0 dB

        let top_of_knee = threshold + knee / 2.0; // -17.0 dB
        let mid_of_knee = threshold; // -20.0 dB
        let bot_of_knee = threshold - knee / 2.0; // -23.0 dB

        let g_top = downward_expander_gain(top_of_knee, threshold, ratio, range, knee);
        let g_mid = downward_expander_gain(mid_of_knee, threshold, ratio, range, knee);
        let g_bot = downward_expander_gain(bot_of_knee, threshold, ratio, range, knee);

        assert!((g_top - 0.0).abs() < 1e-6, "Top of knee should be 0 dB");
        assert!(g_mid < 0.0 && g_mid > g_bot, "Mid knee should be smoothly between top and bottom");
        assert!((g_bot - (-3.0 * (1.0 - 1.0 / 4.0))).abs() < 1e-6, "Bottom of knee matches linear expansion");
    }
}
