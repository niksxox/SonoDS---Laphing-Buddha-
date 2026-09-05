/// Stereo Width — M/S encode-decode with continuous width control.
///
/// Mono (0%) → True stereo (50%) → Decorrelated/multi-mono (100%) → Hyper-wide (120%+)
/// Implemented via mid/side encoding with a side-signal gain curve.

use crate::SmoothedParam;

/// Encode a stereo pair to mid/side.
#[inline]
pub fn encode_ms(left: f32, right: f32) -> (f32, f32) {
    let mid = (left + right) * 0.5;
    let side = (left - right) * 0.5;
    (mid, side)
}

/// Decode mid/side back to stereo.
#[inline]
pub fn decode_ms(mid: f32, side: f32) -> (f32, f32) {
    let left = mid + side;
    let right = mid - side;
    (left, right)
}

/// Stereo Width processor.
pub struct StereoWidth {
    /// Width parameter: 0.0=mono, 0.5=natural stereo, 1.0=wide, >1.0=hyper-wide
    width: SmoothedParam,
    sample_rate: f32,
}

impl StereoWidth {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            width: SmoothedParam::new(1.0, 0.02, sample_rate), // Default: natural stereo (100% = 1.0 in our mapping)
            sample_rate,
        }
    }

    /// Set the width (0.0–1.2+). UI maps 0%–120% to 0.0–1.2.
    /// 0.0 = mono, 0.5 = natural/true stereo, 1.0 = full decorrelated, 1.2 = hyper-wide.
    pub fn set_width(&mut self, value: f32) {
        self.width.set_target(value.clamp(0.0, 2.0));
    }

    /// Process a stereo sample pair.
    #[inline]
    pub fn process_sample(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let w = self.width.next();

        let (mid, side) = encode_ms(input_l, input_r);

        // Width controls the side gain:
        // w=0.0 → side_gain=0.0 (mono)
        // w=0.5 → side_gain=0.5 (reduced stereo)
        // w=1.0 → side_gain=1.0 (natural stereo, the FDN's output as-is)
        // w>1.0 → side_gain>1.0 (boosted side = hyper-wide)
        let side_gain = w;

        decode_ms(mid, side * side_gain)
    }

    pub fn snap_params(&mut self) {
        self.width.snap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_width_zero_is_mono() {
        let sr = 44100.0;
        let mut sw = StereoWidth::new(sr);
        sw.set_width(0.0);
        sw.snap_params();

        let (l, r) = sw.process_sample(0.5, -0.3);
        assert!(
            (l - r).abs() < 1e-6,
            "Width=0 should produce mono output: L={}, R={}",
            l, r
        );
    }

    #[test]
    fn test_width_one_preserves_stereo() {
        let sr = 44100.0;
        let mut sw = StereoWidth::new(sr);
        sw.set_width(1.0);
        sw.snap_params();

        let (l, r) = sw.process_sample(0.8, 0.2);
        // Should be very close to input (side preserved at 1.0)
        assert!(
            (l - 0.8).abs() < 1e-5 && (r - 0.2).abs() < 1e-5,
            "Width=1.0 should preserve natural stereo: L={}, R={}",
            l, r
        );
    }

    #[test]
    fn test_stereo_correlation_decreases_with_width() {
        let sr = 44100.0;

        // Generate some stereo content
        let n = 4410;
        let mut samples_l = Vec::with_capacity(n);
        let mut samples_r = Vec::with_capacity(n);
        for i in 0..n {
            samples_l.push((i as f32 * 0.1).sin() * 0.5 + (i as f32 * 0.3).cos() * 0.3);
            samples_r.push((i as f32 * 0.1).sin() * 0.5 - (i as f32 * 0.3).cos() * 0.3);
        }

        // Measure correlation at width=0 (mono → correlation ≈ 1.0)
        let mut sw_mono = StereoWidth::new(sr);
        sw_mono.set_width(0.0);
        sw_mono.snap_params();

        let mut sum_lr = 0.0f32;
        let mut sum_ll = 0.0f32;
        let mut sum_rr = 0.0f32;
        for i in 0..n {
            let (l, r) = sw_mono.process_sample(samples_l[i], samples_r[i]);
            sum_lr += l * r;
            sum_ll += l * l;
            sum_rr += r * r;
        }
        let corr_mono = sum_lr / (sum_ll.sqrt() * sum_rr.sqrt() + 1e-10);

        // Measure correlation at width=1.5 (hyper-wide → lower correlation)
        let mut sw_wide = StereoWidth::new(sr);
        sw_wide.set_width(1.5);
        sw_wide.snap_params();

        sum_lr = 0.0;
        sum_ll = 0.0;
        sum_rr = 0.0;
        for i in 0..n {
            let (l, r) = sw_wide.process_sample(samples_l[i], samples_r[i]);
            sum_lr += l * r;
            sum_ll += l * l;
            sum_rr += r * r;
        }
        let corr_wide = sum_lr / (sum_ll.sqrt() * sum_rr.sqrt() + 1e-10);

        assert!(
            corr_mono > corr_wide,
            "Correlation should decrease with width: mono={:.4}, wide={:.4}",
            corr_mono, corr_wide
        );

        // Mono correlation should be very close to 1.0
        assert!(
            corr_mono > 0.99,
            "Mono (width=0) should have correlation ≈ 1.0, got {:.4}",
            corr_mono
        );
    }
}
