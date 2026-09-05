//! Full Saturator Signal Chain implementation per Engineering Spec §1.5 & §1.7.

use crate::filters::{Biquad, DcBlocker};
use crate::oversampling::{OversampledSaturator, Quality};
use crate::smoothing::{
    CharacterCrossfader, SmoothedParam, CHARACTER_CROSSFADE_MS, DRIVE_SMOOTHING_MS,
    MIX_SMOOTHING_MS, OUTPUT_SMOOTHING_MS, TONE_SMOOTHING_MS,
};
use crate::waveshaper::Character;

/// Analytic closed-form makeup-gain calculation per §1.7.
#[inline(always)]
pub fn calculate_auto_gain(drive_norm: f64, character: Character) -> f64 {
    let drive_val = drive_norm.clamp(0.0, 1.0);

    match character {
        Character::Tape => 1.0 / (1.0 + 0.48 * drive_val.powf(0.85)),
        Character::Tube => 1.0 / (1.0 + 0.42 * drive_val.powf(0.85)),
        Character::Transformer => 1.0 / (1.0 + 0.40 * drive_val.powf(0.85)),
    }
}

/// Single channel saturator DSP instance.
#[derive(Debug, Clone)]
pub struct SaturatorChannel {
    sample_rate: f64,
    pub quality: Quality,
    pub auto_gain_enabled: bool,
    pub crossfader: CharacterCrossfader,
    pub drive_param: SmoothedParam,
    pub tone_param: SmoothedParam,
    pub mix_param: SmoothedParam,
    pub output_param: SmoothedParam,

    // Stage 2: Tone pre-emphasis musical tilt filter
    pub tone_filter_high: Biquad,
    pub tone_filter_low: Biquad,
    last_tone_db: f64,

    // Stage 3: Nonlinear saturators
    pub sat_primary: OversampledSaturator,
    pub sat_secondary: OversampledSaturator,

    // Stage 4: Character-specific post coloration
    pub tape_head_bump: Biquad,
    pub hf_rolloff: Biquad,

    // Stage 5: DC blocker
    pub dc_blocker: DcBlocker,
}

impl SaturatorChannel {
    pub fn new(sample_rate: f64) -> Self {
        Self {
            sample_rate,
            quality: Quality::Standard,
            auto_gain_enabled: true,
            crossfader: CharacterCrossfader::new(Character::Tape),
            drive_param: SmoothedParam::new(0.0, DRIVE_SMOOTHING_MS, sample_rate),
            tone_param: SmoothedParam::new(0.0, TONE_SMOOTHING_MS, sample_rate),
            mix_param: SmoothedParam::new(1.0, MIX_SMOOTHING_MS, sample_rate),
            output_param: SmoothedParam::new(0.0, OUTPUT_SMOOTHING_MS, sample_rate),

            tone_filter_high: Biquad::passthrough(),
            tone_filter_low: Biquad::passthrough(),
            last_tone_db: 0.0,

            sat_primary: OversampledSaturator::new(),
            sat_secondary: OversampledSaturator::new(),

            tape_head_bump: Biquad::low_shelf(80.0, 1.5, sample_rate),
            hf_rolloff: Biquad::lowpass_1pole(19000.0, sample_rate),

            dc_blocker: DcBlocker::new(sample_rate),
        }
    }

    pub fn reset(&mut self) {
        self.sat_primary.reset();
        self.sat_secondary.reset();
        self.tone_filter_high.reset();
        self.tone_filter_low.reset();
        self.tape_head_bump.reset();
        self.hf_rolloff.reset();
        self.dc_blocker.reset();
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate;
        self.drive_param.update_sample_rate(DRIVE_SMOOTHING_MS, sample_rate);
        self.tone_param.update_sample_rate(TONE_SMOOTHING_MS, sample_rate);
        self.mix_param.update_sample_rate(MIX_SMOOTHING_MS, sample_rate);
        self.output_param.update_sample_rate(OUTPUT_SMOOTHING_MS, sample_rate);
        self.dc_blocker.set_sample_rate(sample_rate);
        self.tape_head_bump = Biquad::low_shelf(80.0, 1.5, sample_rate);
        self.update_tone_filter(self.last_tone_db);
    }

    pub fn set_character(&mut self, character: Character) {
        self.crossfader
            .set_character(character, self.sample_rate, CHARACTER_CROSSFADE_MS);
    }

    pub fn snap_character(&mut self, character: Character) {
        self.crossfader.current_char = character;
        self.crossfader.outgoing_char = None;
    }

    fn update_tone_filter(&mut self, tone_db: f64) {
        // Musical tilt EQ: pivoting around 1 kHz with complementary low and high shelves
        // Turning Left (negative dB): warm low-end boost + gentle high rolloff
        // Turning Right (positive dB): bright high-end presence + subtle low-mid cleanup
        let high_gain = tone_db * 0.75;
        let low_gain = -tone_db * 0.65;
        let new_high = Biquad::high_shelf(2400.0, high_gain, self.sample_rate);
        let new_low = Biquad::low_shelf(380.0, low_gain, self.sample_rate);
        self.tone_filter_high.update_coeffs(&new_high);
        self.tone_filter_low.update_coeffs(&new_low);
        self.last_tone_db = tone_db;
    }

    /// Process a block of samples in place.
    #[inline(always)]
    pub fn process_block(&mut self, buffer: &mut [f64]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Process a single audio sample through the full signal chain per §1.5 ordering.
    #[inline(always)]
    pub fn process_sample(&mut self, input: f64) -> f64 {
        let drive_val = self.drive_param.tick();
        let tone_val = self.tone_param.tick();
        let mix_val = self.mix_param.tick().clamp(0.0, 1.0);
        let out_val = self.output_param.tick();

        if mix_val == 0.0 && !self.mix_param.is_smoothing() {
            return input;
        }

        if self.tone_param.is_smoothing() || (tone_val - self.last_tone_db).abs() > 1e-4 {
            self.update_tone_filter(tone_val);
        }

        // 1. Progressive musical drive mapping: smooth analog warmth to rich harmonic density
        let curve_drive = 3.5 * drive_val.powf(1.25);

        // 2. Tone pre-emphasis musical tilt filter
        let x_toned = self.tone_filter_low.process(self.tone_filter_high.process(input));

        // 3. Oversampled + ADAA Nonlinear Stage with equal-power character crossfade
        let (in_char, in_gain, out_opt) = self.crossfader.tick();

        let sat_out_primary = self
            .sat_primary
            .process_sample(x_toned, curve_drive, in_char, self.quality);

        let saturated = if let Some((out_char, out_gain)) = out_opt {
            let sat_out_secondary = self
                .sat_secondary
                .process_sample(x_toned, curve_drive, out_char, self.quality);
            in_gain * sat_out_primary + out_gain * sat_out_secondary
        } else {
            sat_out_primary
        };

        // 4. Character-specific post coloration
        let colored = match in_char {
            Character::Tape => {
                let bump = self.tape_head_bump.process(saturated);
                self.hf_rolloff.process(bump)
            }
            Character::Tube => saturated,
            Character::Transformer => self.hf_rolloff.process(saturated),
        };

        // 5. DC blocking high-pass (~8Hz)
        let dc_blocked = self.dc_blocker.process(colored);

        // 6. Output trim / auto-gain
        let auto_gain = if self.auto_gain_enabled {
            calculate_auto_gain(drive_val, in_char)
        } else {
            1.0
        };
        let output_gain = 10.0f64.powf(out_val / 20.0) * auto_gain;
        let wet = dc_blocked * output_gain;

        // 7. Dry/wet mix applied last, post-everything
        (1.0 - mix_val) * input + mix_val * wet
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn measure_rms(signal: &[f64]) -> f64 {
        let sum_sq: f64 = signal.iter().map(|&s| s * s).sum();
        (sum_sq / signal.len() as f64).sqrt()
    }

    #[test]
    fn test_denormal_flushing_silence_then_transient() {
        let sample_rate = 48000.0;
        let mut chain = SaturatorChannel::new(sample_rate);
        chain.drive_param.snap_to(0.8);
        chain.tone_param.snap_to(6.0);
        chain.mix_param.snap_to(1.0);

        let mut silence = vec![0.0f64; 48000];
        chain.process_block(&mut silence);

        assert!(!chain.tone_filter_high.s1.is_subnormal());
        assert!(!chain.tone_filter_high.s2.is_subnormal());
        assert!(!chain.tone_filter_low.s1.is_subnormal());
        assert!(!chain.tone_filter_low.s2.is_subnormal());
        assert!(!chain.dc_blocker.x1.is_subnormal());
        assert!(!chain.dc_blocker.y1.is_subnormal());
        assert!(!chain.sat_primary.adaa.x1.is_subnormal());
        assert!(!chain.sat_primary.adaa.x2.is_subnormal());

        let mut impulse = vec![0.0f64; 512];
        impulse[0] = 1.0;
        chain.process_block(&mut impulse);

        assert!(impulse[0].is_finite());
        assert!(!impulse[0].is_nan());
        assert!(impulse[0].abs() > 0.0);
    }

    #[test]
    fn test_mix_zero_is_bit_identical_dry_passthrough() {
        let mut chain = SaturatorChannel::new(44100.0);
        chain.mix_param.snap_to(0.0);
        chain.drive_param.snap_to(1.0);

        let test_inputs = [-1.0, -0.75, -0.33, 0.0, 0.25, 0.5, 0.88, 1.0];
        for &x in &test_inputs {
            let y = chain.process_sample(x);
            assert_eq!(y.to_bits(), x.to_bits(), "Mix=0 must be bit-identical dry passthrough");
        }
    }

    #[test]
    fn test_dc_offset_at_output_is_near_zero_at_max_tube_drive() {
        let mut chain = SaturatorChannel::new(44100.0);
        chain.snap_character(Character::Tube);
        chain.drive_param.snap_to(1.0);
        chain.mix_param.snap_to(1.0);

        let period = 441;
        let n = 70 * period;
        let mut out = Vec::with_capacity(n);
        for i in 0..n {
            let t = i as f64 / 44100.0;
            let x = 0.8 * (2.0 * PI * 100.0 * t).sin() + 0.5;
            out.push(chain.process_sample(x));
        }

        let steady_state = &out[n - 10 * period..];
        let dc_avg: f64 = steady_state.iter().sum::<f64>() / (steady_state.len() as f64);
        assert!(
            dc_avg.abs() < 1e-4,
            "DC offset at output not near zero at max Tube drive: got {}",
            dc_avg
        );
    }

    #[test]
    fn test_signal_chain_ordering_tone_is_pre_saturation() {
        let sample_rate = 44100.0;
        let mut chain_flat = SaturatorChannel::new(sample_rate);
        chain_flat.drive_param.snap_to(0.8);
        chain_flat.tone_param.snap_to(0.0);
        chain_flat.mix_param.snap_to(1.0);

        let mut chain_boost = SaturatorChannel::new(sample_rate);
        chain_boost.drive_param.snap_to(0.8);
        chain_boost.tone_param.snap_to(12.0);
        chain_boost.mix_param.snap_to(1.0);

        let freq = 3500.0;
        let n = 2048;
        let mut out_flat = Vec::with_capacity(n);
        let mut out_boost = Vec::with_capacity(n);

        for i in 0..n {
            let t = i as f64 / sample_rate;
            let x = 0.5 * (2.0 * PI * freq * t).sin();
            out_flat.push(chain_flat.process_sample(x));
            out_boost.push(chain_boost.process_sample(x));
        }

        let steady_flat = &out_flat[1000..];
        let steady_boost = &out_boost[1000..];
        let max_flat = steady_flat.iter().map(|s| s.abs()).fold(0.0f64, f64::max);
        let max_boost = steady_boost.iter().map(|s| s.abs()).fold(0.0f64, f64::max);

        assert!(
            max_boost > max_flat * 0.9,
            "Tone pre-emphasis altered saturation dynamics"
        );
    }

    #[test]
    fn test_auto_gain_loudness_consistency_across_drive_sweep() {
        let sample_rate = 44100.0;
        let freq = 400.0;
        let n_samples = 4096;

        let characters = [Character::Tape, Character::Tube, Character::Transformer];
        let drive_settings = [0.0, 0.25, 0.5, 0.75, 1.0];

        for &character in &characters {
            let mut rms_levels = Vec::new();

            for &drive in &drive_settings {
                let mut chain = SaturatorChannel::new(sample_rate);
                chain.snap_character(character);
                chain.drive_param.snap_to(drive);
                chain.mix_param.snap_to(1.0);

                let mut out = Vec::with_capacity(n_samples);
                for i in 0..n_samples {
                    let t = i as f64 / sample_rate;
                    let x = 0.5 * (2.0 * PI * freq * t).sin();
                    out.push(chain.process_sample(x));
                }

                let steady = &out[1024..];
                let rms = measure_rms(steady);
                rms_levels.push(rms);
            }

            let min_rms = rms_levels.iter().cloned().fold(1.0f64, f64::min);
            let max_rms = rms_levels.iter().cloned().fold(0.0f64, f64::max);
            let dynamic_ratio_db = 20.0 * (max_rms / min_rms).log10();

            assert!(
                dynamic_ratio_db < 4.0,
                "Auto-gain compensation failed for {:?}: dynamic ratio = {:.2} dB",
                character,
                dynamic_ratio_db
            );
        }
    }

    #[test]
    fn test_character_switch_matched_drive_loudness_jump_under_1_lufs() {
        let sample_rate = 44100.0;
        let freq = 500.0;
        let n_samples = 4096;
        let drive = 0.6;

        let mut rms_map = Vec::new();
        for &character in &[Character::Tape, Character::Tube, Character::Transformer] {
            let mut chain = SaturatorChannel::new(sample_rate);
            chain.snap_character(character);
            chain.drive_param.snap_to(drive);
            chain.mix_param.snap_to(1.0);

            let mut out = Vec::with_capacity(n_samples);
            for i in 0..n_samples {
                let t = i as f64 / sample_rate;
                let x = 0.5 * (2.0 * PI * freq * t).sin();
                out.push(chain.process_sample(x));
            }

            let steady = &out[1024..];
            let rms_db = 20.0 * measure_rms(steady).log10();
            rms_map.push(rms_db);
        }

        let diff_tape_tube = (rms_map[0] - rms_map[1]).abs();
        let diff_tape_xfmr = (rms_map[0] - rms_map[2]).abs();
        let diff_tube_xfmr = (rms_map[1] - rms_map[2]).abs();

        assert!(
            diff_tape_tube < 1.0,
            "Loudness jump Tape <-> Tube > 1 dB: {:.2} dB",
            diff_tape_tube
        );
        assert!(
            diff_tape_xfmr < 1.0,
            "Loudness jump Tape <-> Transformer > 1 dB: {:.2} dB",
            diff_tape_xfmr
        );
        assert!(
            diff_tube_xfmr < 1.0,
            "Loudness jump Tube <-> Transformer > 1 dB: {:.2} dB",
            diff_tube_xfmr
        );
    }
}
