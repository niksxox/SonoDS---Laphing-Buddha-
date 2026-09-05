/// Early reflections generator and Distance control.
///
/// Implements a tapped-delay-line early-reflection generator using
/// per-room-model tap patterns from room_models.rs.
///
/// Distance control adjusts the balance and timing between
/// direct/early-reflection energy and the diffuse late-reverb tail.

use crate::delay_line::DelayLine;
use crate::room_models::{ROOM_MODELS, interpolate_space};
use crate::SmoothedParam;

/// Maximum number of early reflection taps supported.
const MAX_ER_TAPS: usize = 8;

/// Maximum early reflection delay in samples (~200ms at 48kHz).
const MAX_ER_DELAY: usize = 9600;

/// Early reflections processor.
pub struct EarlyReflections {
    delay_line_l: DelayLine,
    delay_line_r: DelayLine,
    /// Current tap delays in samples (smoothed for crossfade)
    tap_delays: [SmoothedParam; MAX_ER_TAPS],
    /// Current tap gains (smoothed)
    tap_gains: [SmoothedParam; MAX_ER_TAPS],
    /// Number of active taps
    active_taps: usize,
    /// Distance control (0.0–1.0): closer = more early energy, farther = more late
    distance: SmoothedParam,
    sample_rate: f32,
}

impl EarlyReflections {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            delay_line_l: DelayLine::new(MAX_ER_DELAY),
            delay_line_r: DelayLine::new(MAX_ER_DELAY),
            tap_delays: core::array::from_fn(|_| SmoothedParam::new(0.0, 0.05, sample_rate)),
            tap_gains: core::array::from_fn(|_| SmoothedParam::new(0.0, 0.02, sample_rate)),
            active_taps: 0,
            distance: SmoothedParam::new(0.5, 0.02, sample_rate),
            sample_rate,
        }
    }

    /// Load taps from a room model, blending between two models based on crossfade.
    pub fn set_from_space(&mut self, space: f32) {
        let interp = interpolate_space(space);
        let model_a = &ROOM_MODELS[interp.model_a_index];
        let model_b = &ROOM_MODELS[interp.model_b_index];
        let frac = interp.crossfade;

        // Determine active taps as max of both models
        let taps_a = model_a.early_taps.len().min(MAX_ER_TAPS);
        let taps_b = model_b.early_taps.len().min(MAX_ER_TAPS);
        self.active_taps = taps_a.max(taps_b);

        for i in 0..MAX_ER_TAPS {
            if i < self.active_taps {
                let (delay_a, gain_a) = if i < taps_a {
                    (model_a.early_taps[i].delay_secs, model_a.early_taps[i].gain)
                } else {
                    // Extrapolate from last tap of model_a
                    let last = &model_a.early_taps[taps_a - 1];
                    (last.delay_secs * 1.2, last.gain * 0.5)
                };

                let (delay_b, gain_b) = if i < taps_b {
                    (model_b.early_taps[i].delay_secs, model_b.early_taps[i].gain)
                } else {
                    let last = &model_b.early_taps[taps_b - 1];
                    (last.delay_secs * 1.2, last.gain * 0.5)
                };

                // Interpolate between models
                let delay_secs = delay_a + frac * (delay_b - delay_a);
                let gain = gain_a + frac * (gain_b - gain_a);

                let delay_samples = delay_secs * self.sample_rate;
                self.tap_delays[i].set_target(delay_samples);
                self.tap_gains[i].set_target(gain);
            } else {
                self.tap_delays[i].set_target(0.0);
                self.tap_gains[i].set_target(0.0);
            }
        }
    }

    /// Set the Distance control (0.0 = close/prominent ERs, 1.0 = far/diffuse).
    pub fn set_distance(&mut self, distance: f32) {
        self.distance.set_target(distance.clamp(0.0, 1.0));
    }

    /// Process a stereo sample pair through the early reflections.
    /// Returns (er_left, er_right) — the early reflection signal only.
    /// The caller is responsible for mixing this with the FDN output
    /// according to the Distance control.
    #[inline]
    pub fn process_sample(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        // Write input into ER delay lines
        self.delay_line_l.write(input_l);
        self.delay_line_r.write(input_r);

        let mut out_l = 0.0f32;
        let mut out_r = 0.0f32;

        for i in 0..self.active_taps {
            let delay = self.tap_delays[i].next();
            let gain = self.tap_gains[i].next();

            if delay > 0.0 && gain.abs() > 1e-8 {
                out_l += self.delay_line_l.read_interpolated(delay) * gain;
                // Slight stereo spread: odd taps are slightly offset for R channel
                let r_delay = if i % 2 == 1 { delay * 1.07 } else { delay * 0.93 };
                out_r += self.delay_line_r.read_interpolated(r_delay) * gain;
            }
        }

        (out_l, out_r)
    }

    /// Get the current distance value (for use in mixing ER vs late tail).
    /// Returns (er_gain, late_gain) — the mixing coefficients.
    /// Distance 0.0 → er_gain=1.0, late_gain=0.6 (close: prominent ERs)
    /// Distance 1.0 → er_gain=0.3, late_gain=1.0 (far: diffuse tail dominates)
    #[inline]
    pub fn get_distance_mix(&mut self) -> (f32, f32) {
        let d = self.distance.next();
        // Equal-power-ish crossfade between ER and late
        let er_gain = 1.0 - d * 0.7;    // 1.0 → 0.3
        let late_gain = 0.6 + d * 0.4;  // 0.6 → 1.0
        (er_gain, late_gain)
    }

    /// Clear all delay lines.
    pub fn clear(&mut self) {
        self.delay_line_l.clear();
        self.delay_line_r.clear();
    }

    /// Snap all smoothed parameters.
    pub fn snap_params(&mut self) {
        for sp in &mut self.tap_delays {
            sp.snap();
        }
        for sp in &mut self.tap_gains {
            sp.snap();
        }
        self.distance.snap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_early_reflections_produces_output() {
        let sr = 44100.0;
        let mut er = EarlyReflections::new(sr);
        er.set_from_space(0.25); // Small/medium room
        er.snap_params();

        // Feed impulse
        let (l, r) = er.process_sample(1.0, 1.0);
        // Immediately after impulse, ER output might be small (delay)
        // Process more samples to let taps produce output
        let mut has_output = false;
        for _ in 0..2000 {
            let (l, r) = er.process_sample(0.0, 0.0);
            if l.abs() > 1e-6 || r.abs() > 1e-6 {
                has_output = true;
                break;
            }
        }
        assert!(has_output, "Early reflections should produce output after impulse");
    }

    #[test]
    fn test_distance_mix_monotonic() {
        let sr = 44100.0;

        // Test that ER gain decreases and late gain increases with Distance
        let mut prev_er = 1.0f32;
        let mut prev_late = 0.0f32;

        for i in 0..=10 {
            let d = i as f32 / 10.0;
            let mut er = EarlyReflections::new(sr);
            er.set_distance(d);
            er.snap_params();
            let (er_gain, late_gain) = er.get_distance_mix();

            if i > 0 {
                assert!(
                    er_gain <= prev_er + 1e-6,
                    "ER gain should decrease: d={}, er_gain={}, prev={}",
                    d, er_gain, prev_er
                );
                assert!(
                    late_gain >= prev_late - 1e-6,
                    "Late gain should increase: d={}, late_gain={}, prev={}",
                    d, late_gain, prev_late
                );
            }
            prev_er = er_gain;
            prev_late = late_gain;
        }
    }
}
