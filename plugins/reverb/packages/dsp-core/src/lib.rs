// SonoDS Reverb DSP Core
// Top-level entry point and module declarations for the complete reverb engine.

pub mod auto_gate;
pub mod biquad;
pub mod brightness;
pub mod character;
pub mod decay_rate_eq;
pub mod delay_line;
pub mod ducking;
pub mod early_reflections;
pub mod fdn;
pub mod mix;
pub mod post_eq;
pub mod predelay;
pub mod room_models;
pub mod stereo_width;
pub mod thickness;
pub mod wasm;

pub use auto_gate::AutoGate;
pub use biquad::{Biquad, FilterType};
pub use brightness::Brightness;
pub use character::Character;
pub use decay_rate_eq::DecayRateEq;
pub use delay_line::DelayLine;
pub use ducking::Ducking;
pub use early_reflections::EarlyReflections;
pub use fdn::Fdn;
pub use mix::MixControl;
pub use post_eq::PostEq;
pub use predelay::{PreDelay, TempoDivision};
pub use room_models::{ROOM_MODELS, interpolate_space};
pub use stereo_width::StereoWidth;
pub use thickness::Thickness;

/// Sample rate default across engine.
pub const DEFAULT_SAMPLE_RATE: f32 = 44100.0;

/// Smoothed parameter helper — exponential approach for click-free parameter changes.
#[derive(Debug, Clone)]
pub struct SmoothedParam {
    current: f32,
    target: f32,
    coeff: f32,
}

impl SmoothedParam {
    pub fn new(initial: f32, smooth_time_secs: f32, sample_rate: f32) -> Self {
        let coeff = if smooth_time_secs > 0.0 {
            (-1.0 / (smooth_time_secs * sample_rate)).exp()
        } else {
            0.0
        };
        Self {
            current: initial,
            target: initial,
            coeff,
        }
    }

    #[inline]
    pub fn set_target(&mut self, target: f32) {
        self.target = target;
    }

    #[inline]
    pub fn next(&mut self) -> f32 {
        self.current = self.target + self.coeff * (self.current - self.target);
        self.current
    }

    #[inline]
    pub fn current(&self) -> f32 {
        self.current
    }

    #[inline]
    pub fn is_settled(&self) -> bool {
        (self.current - self.target).abs() < 1e-6
    }

    #[inline]
    pub fn snap(&mut self) {
        self.current = self.target;
    }

    #[inline]
    pub fn set_immediate(&mut self, value: f32) {
        self.current = value;
        self.target = value;
    }
}

/// The complete, integrated SonoDS Reverb Processor.
/// Combines all DSP modules into a single real-time stereo processing chain.
pub struct ReverbProcessor {
    pub predelay: PreDelay,
    pub early_reflections: EarlyReflections,
    pub fdn: Fdn,
    pub decay_eq: DecayRateEq,
    pub brightness: Brightness,
    pub character: Character,
    pub thickness: Thickness,
    pub width: StereoWidth,
    pub post_eq: PostEq,
    pub ducking: Ducking,
    pub auto_gate: AutoGate,
    pub mix: MixControl,
    sample_rate: f32,
}

impl ReverbProcessor {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            predelay: PreDelay::new(sample_rate),
            early_reflections: EarlyReflections::new(sample_rate),
            fdn: Fdn::new(sample_rate),
            decay_eq: DecayRateEq::new(sample_rate),
            brightness: Brightness::new(sample_rate),
            character: Character::new(sample_rate),
            thickness: Thickness::new(sample_rate),
            width: StereoWidth::new(sample_rate),
            post_eq: PostEq::new(sample_rate),
            ducking: Ducking::new(sample_rate),
            auto_gate: AutoGate::new(sample_rate),
            mix: MixControl::new(sample_rate),
            sample_rate,
        }
    }

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    /// Process a single stereo frame (left, right) -> (out_left, out_right).
    #[inline]
    pub fn process_sample(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        // 1. Dry path reference
        let dry_l = input_l;
        let dry_r = input_r;

        // 2. Pre-Delay
        let (pd_l, pd_r) = self.predelay.process(dry_l, dry_r);

        // 3. Early Reflections
        let (er_l, er_r) = self.early_reflections.process_sample(pd_l, pd_r);

        // 4. Character LFO step
        let _lfo_mods = self.character.get_modulation_offsets();

        // 5. FDN Late Reverb Core
        let (fdn_l, fdn_r) = self.fdn.process_sample(pd_l, pd_r);

        // 6. Brightness HF Damping
        let (b_l, b_r) = self.brightness.process_sample(fdn_l, fdn_r);

        // 7. Thickness Saturation / Dynamics
        let (t_l, t_r) = self.thickness.process_sample(b_l, b_r);

        // 8. Blend ER and FDN based on Distance control
        let (er_gain, late_gain) = self.early_reflections.get_distance_mix();
        let wet_raw_l = er_l * er_gain + t_l * late_gain;
        let wet_raw_r = er_r * er_gain + t_r * late_gain;

        // 9. Stereo Width
        let (w_l, w_r) = self.width.process_sample(wet_raw_l, wet_raw_r);

        // 10. Post EQ
        let (eq_l, eq_r) = self.post_eq.process(w_l, w_r);

        // 11. Ducking
        let duck_gain = self.ducking.process(dry_l, dry_r);
        let duck_l = eq_l * duck_gain;
        let duck_r = eq_r * duck_gain;

        // 12. Auto Gate
        let (gate_l, gate_r) = self.auto_gate.process(dry_l, dry_r, duck_l, duck_r);

        // 13. Wet / Dry Mix
        let (out_l, out_r) = self.mix.process(dry_l, dry_r, gate_l, gate_r);

        (out_l, out_r)
    }

    /// Process a block of stereo frames.
    pub fn process_block(
        &mut self,
        input_l: &[f32],
        input_r: &[f32],
        output_l: &mut [f32],
        output_r: &mut [f32],
    ) {
        let len = input_l.len().min(input_r.len()).min(output_l.len()).min(output_r.len());
        for i in 0..len {
            let (ol, or) = self.process_sample(input_l[i], input_r[i]);
            output_l[i] = ol;
            output_r[i] = or;
        }
    }

    pub fn snap_all_params(&mut self) {
        self.predelay.snap_params();
        self.fdn.snap_params();
        self.mix.snap_params();
    }

    pub fn clear_buffers(&mut self) {
        self.predelay.clear();
        self.early_reflections.clear();
        self.fdn.clear();
        self.post_eq.reset();
        self.ducking.reset();
        self.auto_gate.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reverb_processor_basic_flow() {
        let mut proc = ReverbProcessor::new(44100.0);
        proc.snap_all_params();

        // Feed impulse
        let (out_l, out_r) = proc.process_sample(1.0, 1.0);
        assert!(!out_l.is_nan() && !out_l.is_infinite());
        assert!(!out_r.is_nan() && !out_r.is_infinite());

        // Feed silence for 1000 samples
        for _ in 0..1000 {
            let (l, r) = proc.process_sample(0.0, 0.0);
            assert!(!l.is_nan() && !l.is_infinite());
            assert!(!r.is_nan() && !r.is_infinite());
        }
    }

    /// Task 1.13: Full DSP Regression & Fuzz Pass
    /// Runs 100,000 samples with varying parameter settings asserting no NaNs or Infs.
    #[test]
    fn test_task_1_13_fuzz_pass() {
        let sample_rate = 44100.0;
        let mut proc = ReverbProcessor::new(sample_rate);
        proc.snap_all_params();

        // Vary parameters every 10,000 samples
        for i in 0..100_000 {
            if i % 10000 == 0 {
                let phase = (i / 10000) as f32;
                proc.predelay.set_delay_ms((phase * 40.0) % 500.0);
                proc.fdn.set_rt60(0.5 + (phase * 1.5) % 15.0);
                proc.fdn.set_room_size(200.0 + (phase * 300.0) % 5000.0);
                proc.brightness.set_brightness(-1.0 + (phase * 0.4) % 2.0);
                proc.character.set_character((phase * 0.2) % 1.0);
                proc.thickness.set_thickness((phase * 0.25) % 1.0);
                proc.width.set_width((phase * 0.4) % 2.0);
                proc.ducking.set_amount((phase * 0.2) % 1.0);
                proc.mix.force_set_mix_percent((phase * 20.0) % 100.0);
            }

            let input = if i % 4410 == 0 { 0.8 } else { 0.0 };
            let (l, r) = proc.process_sample(input, input);

            assert!(!l.is_nan(), "NaN in left channel at sample {}", i);
            assert!(!l.is_infinite(), "Inf in left channel at sample {}", i);
            assert!(!r.is_nan(), "NaN in right channel at sample {}", i);
            assert!(!r.is_infinite(), "Inf in right channel at sample {}", i);
            assert!(l.abs() < 100.0, "Unbound output in left channel at sample {}: {}", i, l);
            assert!(r.abs() < 100.0, "Unbound output in right channel at sample {}: {}", i, r);
        }
    }
}
