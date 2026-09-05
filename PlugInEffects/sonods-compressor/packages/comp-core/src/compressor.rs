//! Full compressor signal chain wiring.
//!
//! Chain ordering per Engineering Spec §1.7:
//! 1. Input audio
//! 2. Sidechain tap (HPF on detector only)
//! 3. Blended detector (Peak/RMS blend)
//! 4. Static gain computer (Giannoulis soft knee)
//! 5. Decoupled envelope smoother (branching attack/release)
//! 6. Stereo link blend (louder channel governs)
//! 7. Apply gain reduction to main audio path (optionally delayed via lookahead)
//! 8. Auto & manual makeup gain
//! 9. Dry/Wet mix (using time-aligned dry signal when lookahead > 0)

use crate::detector::BlendedDetector;
use crate::gain_computer::gain_reduction_db;
use crate::lookahead::LookaheadBuffer;
use crate::param_smoother::SmoothedParam;
use crate::sidechain::{apply_stereo_linking, SidechainHpf};
use crate::smoother::EnvelopeSmoother;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompressorCharacter {
    Vca,
    Opto,
    Fet,
}

pub struct CompressorCore {
    sample_rate: f64,
    character: CompressorCharacter,

    // Detectors & Filters (per channel)
    sidechain_l: SidechainHpf,
    sidechain_r: SidechainHpf,
    detector_l: BlendedDetector,
    detector_r: BlendedDetector,

    // Envelope smoothers
    smoother_l: EnvelopeSmoother,
    smoother_r: EnvelopeSmoother,

    // Audio path delay lines for lookahead
    lookahead_l: LookaheadBuffer,
    lookahead_r: LookaheadBuffer,
    // Matching delay line for DRY path in parallel mix
    dry_delay_l: LookaheadBuffer,
    dry_delay_r: LookaheadBuffer,

    // Continuous smoothed parameters
    param_threshold: SmoothedParam,
    param_ratio: SmoothedParam,
    param_knee: SmoothedParam,
    param_link: SmoothedParam,
    param_mix: SmoothedParam,
    param_output_gain: SmoothedParam,
    param_auto_gain: SmoothedParam,
    param_sidechain_hpf: SmoothedParam,

    // Direct time constants
    attack_s: f64,
    release_s: f64,
    lookahead_s: f64,

    // Telemetry / metering (real signal taps per §1.7)
    last_input_db_l: f64,
    last_input_db_r: f64,
    last_detected_db_l: f64,
    last_detected_db_r: f64,
    last_output_db_l: f64,
    last_output_db_r: f64,
    last_gr_db_l: f64,
    last_gr_db_r: f64,
}

impl CompressorCore {
    pub fn new(sample_rate: f64) -> Self {
        let sr = sample_rate.max(1.0);
        let default_attack = 0.020; // 20ms
        let default_release = 0.150; // 150ms

        Self {
            sample_rate: sr,
            character: CompressorCharacter::Vca,

            sidechain_l: SidechainHpf::new(20.0, sr),
            sidechain_r: SidechainHpf::new(20.0, sr),
            detector_l: BlendedDetector::new(0.010, sr, 0.5), // 50% peak/RMS blend
            detector_r: BlendedDetector::new(0.010, sr, 0.5),

            smoother_l: EnvelopeSmoother::new(default_attack, default_release, sr),
            smoother_r: EnvelopeSmoother::new(default_attack, default_release, sr),

            lookahead_l: LookaheadBuffer::new(0.010, sr),
            lookahead_r: LookaheadBuffer::new(0.010, sr),
            dry_delay_l: LookaheadBuffer::new(0.010, sr),
            dry_delay_r: LookaheadBuffer::new(0.010, sr),

            param_threshold: SmoothedParam::new(-16.0, 0.020, sr),
            param_ratio: SmoothedParam::new(4.0, 0.020, sr),
            param_knee: SmoothedParam::new(6.0, 0.020, sr),
            param_link: SmoothedParam::new(1.0, 0.015, sr), // 100% stereo link default
            param_mix: SmoothedParam::new(1.0, 0.015, sr),  // 100% wet
            param_output_gain: SmoothedParam::new(0.0, 0.015, sr),
            param_auto_gain: SmoothedParam::new(0.0, 0.015, sr),
            param_sidechain_hpf: SmoothedParam::new(20.0, 0.015, sr),

            attack_s: default_attack,
            release_s: default_release,
            lookahead_s: 0.0,

            last_input_db_l: -60.0,
            last_input_db_r: -60.0,
            last_detected_db_l: -60.0,
            last_detected_db_r: -60.0,
            last_output_db_l: -60.0,
            last_output_db_r: -60.0,
            last_gr_db_l: 0.0,
            last_gr_db_r: 0.0,
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate.max(1.0);
        self.sidechain_l.set_sample_rate(self.sample_rate);
        self.sidechain_r.set_sample_rate(self.sample_rate);
        self.smoother_l.set_sample_rate(self.sample_rate);
        self.smoother_r.set_sample_rate(self.sample_rate);
        self.param_threshold.set_sample_rate(self.sample_rate);
        self.param_ratio.set_sample_rate(self.sample_rate);
        self.param_knee.set_sample_rate(self.sample_rate);
        self.param_link.set_sample_rate(self.sample_rate);
        self.param_mix.set_sample_rate(self.sample_rate);
        self.param_output_gain.set_sample_rate(self.sample_rate);
        self.param_auto_gain.set_sample_rate(self.sample_rate);
        self.param_sidechain_hpf.set_sample_rate(self.sample_rate);
        self.set_lookahead(self.lookahead_s);
    }

    pub fn set_threshold_db(&mut self, threshold_db: f64) {
        self.param_threshold.set_target(threshold_db.clamp(-60.0, 0.0));
    }

    pub fn set_ratio(&mut self, ratio: f64) {
        self.param_ratio.set_target(ratio.clamp(1.0, 30.0));
    }

    pub fn set_attack_s(&mut self, attack_s: f64) {
        self.attack_s = attack_s.clamp(0.00005, 0.5); // 50µs to 500ms
        self.smoother_l.set_attack_time(self.attack_s);
        self.smoother_r.set_attack_time(self.attack_s);
    }

    pub fn set_release_s(&mut self, release_s: f64) {
        self.release_s = release_s.clamp(0.005, 2.5); // 5ms to 2.5s
        self.smoother_l.set_release_time(self.release_s);
        self.smoother_r.set_release_time(self.release_s);
    }

    pub fn set_knee_db(&mut self, knee_db: f64) {
        self.param_knee.set_target(knee_db.clamp(0.0, 24.0));
    }

    pub fn set_link(&mut self, link: f64) {
        self.param_link.set_target(link.clamp(0.0, 1.0));
    }

    pub fn set_mix(&mut self, mix: f64) {
        self.param_mix.set_target(mix.clamp(0.0, 1.0));
    }

    pub fn set_mix_immediate(&mut self, mix: f64) {
        self.param_mix.set_immediate(mix.clamp(0.0, 1.0));
    }

    pub fn set_threshold_immediate(&mut self, threshold_db: f64) {
        self.param_threshold.set_immediate(threshold_db.clamp(-60.0, 0.0));
    }

    pub fn set_ratio_immediate(&mut self, ratio: f64) {
        self.param_ratio.set_immediate(ratio.clamp(1.0, 30.0));
    }

    pub fn set_output_gain_db(&mut self, gain_db: f64) {
        self.param_output_gain.set_target(gain_db.clamp(-24.0, 24.0));
    }

    pub fn set_auto_gain(&mut self, auto_gain_amount: f64) {
        self.param_auto_gain.set_target(auto_gain_amount.clamp(0.0, 1.0));
    }

    pub fn set_sidechain_hpf(&mut self, cutoff_hz: f64) {
        self.param_sidechain_hpf.set_target(cutoff_hz.clamp(20.0, 500.0));
    }

    pub fn set_lookahead(&mut self, lookahead_s: f64) {
        self.lookahead_s = lookahead_s.clamp(0.0, 0.010);
        self.lookahead_l.set_lookahead(self.lookahead_s, self.sample_rate);
        self.lookahead_r.set_lookahead(self.lookahead_s, self.sample_rate);
        self.dry_delay_l.set_lookahead(self.lookahead_s, self.sample_rate);
        self.dry_delay_r.set_lookahead(self.lookahead_s, self.sample_rate);
    }

    pub fn set_character(&mut self, character: CompressorCharacter) {
        self.character = character;
        // Tune knee default based on character per Task 0.4
        match character {
            CompressorCharacter::Vca => self.param_knee.set_target(6.0),
            CompressorCharacter::Opto => self.param_knee.set_target(12.0),
            CompressorCharacter::Fet => self.param_knee.set_target(2.0),
        }
    }

    pub fn character(&self) -> CompressorCharacter {
        self.character
    }

    /// Returns the most recent smoothed gain reduction in dB (max of L & R for metering)
    #[inline]
    pub fn current_gain_reduction_db(&self) -> f64 {
        self.last_gr_db_l.max(self.last_gr_db_r)
    }

    #[inline]
    pub fn current_input_level_db(&self) -> f64 {
        self.last_input_db_l.max(self.last_input_db_r)
    }

    #[inline]
    pub fn current_detected_level_db(&self) -> f64 {
        self.last_detected_db_l.max(self.last_detected_db_r)
    }

    #[inline]
    pub fn current_output_level_db(&self) -> f64 {
        self.last_output_db_l.max(self.last_output_db_r)
    }

    pub fn reset(&mut self) {
        self.sidechain_l.reset();
        self.sidechain_r.reset();
        self.detector_l.reset();
        self.detector_r.reset();
        self.smoother_l.reset();
        self.smoother_r.reset();
        self.lookahead_l.reset();
        self.lookahead_r.reset();
        self.dry_delay_l.reset();
        self.dry_delay_r.reset();
        self.last_input_db_l = -60.0;
        self.last_input_db_r = -60.0;
        self.last_detected_db_l = -60.0;
        self.last_detected_db_r = -60.0;
        self.last_output_db_l = -60.0;
        self.last_output_db_r = -60.0;
        self.last_gr_db_l = 0.0;
        self.last_gr_db_r = 0.0;
    }

    /// Process a single stereo sample (in_l, in_r) -> (out_l, out_r)
    #[inline]
    pub fn process_sample(&mut self, in_l: f64, in_r: f64) -> (f64, f64) {
        // Step continuous parameters
        let thresh = self.param_threshold.next();
        let ratio = self.param_ratio.next();
        let knee = self.param_knee.next();
        let link = self.param_link.next();
        let mix = self.param_mix.next();
        let out_gain_db = self.param_output_gain.next();
        let auto_gain_amt = self.param_auto_gain.next();
        let sc_hpf = self.param_sidechain_hpf.next();

        self.sidechain_l.set_cutoff(sc_hpf);
        self.sidechain_r.set_cutoff(sc_hpf);

        // 1. Input Level in dB (Pre-compression tap)
        let in_max = in_l.abs().max(in_r.abs());
        let in_db = if in_max > 1e-6 { 20.0 * in_max.log10() } else { -60.0 };
        self.last_input_db_l = in_db;
        self.last_input_db_r = in_db;

        // 2. Time-aligned dry signal for parallel mix
        let dry_l = self.dry_delay_l.process_sample(in_l);
        let dry_r = self.dry_delay_r.process_sample(in_r);

        // 3. Sidechain filtering (detector branch ONLY, never touches audio)
        let sc_l = self.sidechain_l.process_sample(in_l);
        let sc_r = self.sidechain_r.process_sample(in_r);

        // 4. Level detection (blended Peak/RMS in linear domain -> dB)
        let level_l_db = self.detector_l.process_sample_db(sc_l);
        let level_r_db = self.detector_r.process_sample_db(sc_r);
        self.last_detected_db_l = level_l_db;
        self.last_detected_db_r = level_r_db;

        // 5. Static gain computer (Giannoulis soft-knee quadratic curve)
        let raw_gr_l = gain_reduction_db(level_l_db, thresh, ratio, knee);
        let raw_gr_r = gain_reduction_db(level_r_db, thresh, ratio, knee);

        // 6. Decoupled envelope smoothing (applied to GR dB, not level)
        let smoothed_gr_l = self.smoother_l.process_sample(raw_gr_l);
        let smoothed_gr_r = self.smoother_r.process_sample(raw_gr_r);

        // 7. Stereo linking
        let (final_gr_l, final_gr_r) = apply_stereo_linking(smoothed_gr_l, smoothed_gr_r, link);
        self.last_gr_db_l = final_gr_l;
        self.last_gr_db_r = final_gr_r;

        // 8. Lookahead delay on main wet audio path
        let delayed_audio_l = self.lookahead_l.process_sample(in_l);
        let delayed_audio_r = self.lookahead_r.process_sample(in_r);

        // Apply gain reduction multiplier: 10^(-GR_dB / 20)
        let gain_mult_l = 10.0_f64.powf(-final_gr_l / 20.0);
        let gain_mult_r = 10.0_f64.powf(-final_gr_r / 20.0);

        let compressed_l = delayed_audio_l * gain_mult_l;
        let compressed_r = delayed_audio_r * gain_mult_r;

        // 9. Auto makeup gain (closed-form static estimate) + manual output gain
        let nominal_reduction_at_0db = gain_reduction_db(0.0, thresh, ratio, knee);
        let auto_makeup_db = auto_gain_amt * nominal_reduction_at_0db * 0.5;
        let total_gain_db = out_gain_db + auto_makeup_db;
        let output_gain_mult = 10.0_f64.powf(total_gain_db / 20.0);

        let wet_l = compressed_l * output_gain_mult;
        let wet_r = compressed_r * output_gain_mult;

        // 10. Dry/Wet mix applied post-everything
        let out_l = (1.0 - mix) * dry_l + mix * wet_l;
        let out_r = (1.0 - mix) * dry_r + mix * wet_r;

        // 11. Output Level in dB (Post-compression tap)
        let out_max = out_l.abs().max(out_r.abs());
        let out_db = if out_max > 1e-6 { 20.0 * out_max.log10() } else { -60.0 };
        self.last_output_db_l = out_db;
        self.last_output_db_r = out_db;

        (out_l, out_r)
    }

    #[inline]
    pub fn set_last_telemetry(&mut self, in_db: f64, det_db: f64, out_db: f64, gr_db: f64) {
        self.last_input_db_l = in_db;
        self.last_input_db_r = in_db;
        self.last_detected_db_l = det_db;
        self.last_detected_db_r = det_db;
        self.last_output_db_l = out_db;
        self.last_output_db_r = out_db;
        self.last_gr_db_l = gr_db;
        self.last_gr_db_r = gr_db;
    }

    /// Process a block of stereo samples in-place
    pub fn process_block(&mut self, left: &mut [f64], right: &mut [f64]) {
        let n = left.len().min(right.len());
        if n == 0 {
            return;
        }
        let mut in_sum_sq = 0.0f64;
        let mut in_peak = 0.0f64;
        let mut out_sum_sq = 0.0f64;
        let mut out_peak = 0.0f64;
        let mut max_gr = 0.0f64;
        let mut max_det = -60.0f64;

        for i in 0..n {
            let inl = left[i];
            let inr = right[i];
            let ins = inl.abs().max(inr.abs());
            in_sum_sq += inl * inl + inr * inr;
            in_peak = in_peak.max(ins);

            let (out_l, out_r) = self.process_sample(inl, inr);
            left[i] = out_l;
            right[i] = out_r;

            let outs = out_l.abs().max(out_r.abs());
            out_sum_sq += out_l * out_l + out_r * out_r;
            out_peak = out_peak.max(outs);

            let cur_gr = self.last_gr_db_l.max(self.last_gr_db_r);
            max_gr = max_gr.max(cur_gr);

            let cur_det = self.last_detected_db_l.max(self.last_detected_db_r);
            max_det = max_det.max(cur_det);
        }

        let in_rms = (in_sum_sq / (2.0 * n as f64).max(1.0)).sqrt();
        let in_level = 0.7 * in_peak + 0.3 * in_rms;
        let in_db = if in_level > 1e-5 { 20.0 * in_level.log10() } else { -60.0 };

        let out_rms = (out_sum_sq / (2.0 * n as f64).max(1.0)).sqrt();
        let out_level = 0.7 * out_peak + 0.3 * out_rms;
        let out_db = if out_level > 1e-5 { 20.0 * out_level.log10() } else { -60.0 };

        self.set_last_telemetry(in_db, max_det, out_db, max_gr);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dry_passthrough_at_mix_zero() {
        let mut comp = CompressorCore::new(48000.0);
        comp.set_mix_immediate(0.0);
        comp.set_lookahead(0.002); // 2ms lookahead

        let test_vals = [0.1, -0.4, 0.8, -0.9, 0.0, 0.25];
        for v in test_vals {
            let (out_l, out_r) = comp.process_sample(v, -v);
            // With mix=0, output is perfectly time-aligned dry signal
            // After initial delay buffer fills:
            let _ = (out_l, out_r);
        }

        // Run steady state and verify dry signal equals delayed input
        let mut left = vec![0.5; 200];
        let mut right = vec![-0.5; 200];
        comp.process_block(&mut left, &mut right);

        for i in 100..200 {
            assert!((left[i] - 0.5).abs() < 1e-9);
            assert!((right[i] - (-0.5)).abs() < 1e-9);
        }
    }

    #[test]
    fn test_transparent_below_threshold() {
        let mut comp = CompressorCore::new(48000.0);
        comp.set_threshold_db(-10.0);
        comp.set_ratio(4.0);
        comp.set_mix(1.0); // 100% wet
        comp.set_output_gain_db(0.0);
        comp.set_auto_gain(0.0);
        comp.set_lookahead(0.0); // 0 latency

        // Input amplitude 0.05 is ~ -26 dBFS (well below -10dB threshold)
        for _ in 0..100 {
            let (out_l, out_r) = comp.process_sample(0.05, -0.05);
            assert!((out_l - 0.05).abs() < 1e-9);
            assert!((out_r - (-0.05)).abs() < 1e-9);
            assert_eq!(comp.current_gain_reduction_db(), 0.0);
        }
    }

    #[test]
    fn test_sidechain_hpf_changes_detected_reduction_for_bass() {
        let sr = 48000.0;
        let mut comp_no_hpf = CompressorCore::new(sr);
        comp_no_hpf.set_threshold_db(-20.0);
        comp_no_hpf.set_ratio(4.0);
        comp_no_hpf.set_sidechain_hpf(20.0); // essentially off

        let mut comp_with_hpf = CompressorCore::new(sr);
        comp_with_hpf.set_threshold_db(-20.0);
        comp_with_hpf.set_ratio(4.0);
        comp_with_hpf.set_sidechain_hpf(250.0); // 250 Hz HPF

        // Feed 50 Hz sub bass with amplitude 0.8 (~ -2 dBFS)
        let f = 50.0;
        for i in 0..4800 {
            let t = i as f64 / sr;
            let s = 0.8 * (2.0 * std::f64::consts::PI * f * t).sin();
            comp_no_hpf.process_sample(s, s);
            comp_with_hpf.process_sample(s, s);
        }

        let gr_no_hpf = comp_no_hpf.current_gain_reduction_db();
        let gr_with_hpf = comp_with_hpf.current_gain_reduction_db();

        assert!(
            gr_no_hpf > 5.0,
            "Bass without HPF should trigger significant compression: {}",
            gr_no_hpf
        );
        assert!(
            gr_with_hpf < gr_no_hpf - 2.0,
            "Sidechain HPF must significantly reduce triggered compression for bass: with_hpf={}, no_hpf={}",
            gr_with_hpf,
            gr_no_hpf
        );
    }

    #[test]
    fn test_auto_makeup_gain_flattens_output_level() {
        let sr = 48000.0;
        let test_thresholds = [-6.0, -12.0, -18.0, -24.0];

        let mut rms_drop_without_autogain = Vec::new();
        let mut rms_drop_with_autogain = Vec::new();

        for &t in &test_thresholds {
            // Measure without autogain
            let mut comp_no_auto = CompressorCore::new(sr);
            comp_no_auto.set_threshold_immediate(t);
            comp_no_auto.set_ratio_immediate(4.0);
            comp_no_auto.param_auto_gain.set_immediate(0.0);
            comp_no_auto.set_mix_immediate(1.0);

            // Measure with autogain (100%)
            let mut comp_with_auto = CompressorCore::new(sr);
            comp_with_auto.set_threshold_immediate(t);
            comp_with_auto.set_ratio_immediate(4.0);
            comp_with_auto.param_auto_gain.set_immediate(1.0);
            comp_with_auto.set_mix_immediate(1.0);

            let mut sum_sq_no = 0.0;
            let mut sum_sq_with = 0.0;
            let num_samples = 2400;

            for i in 0..num_samples {
                let time = i as f64 / sr;
                let s = 0.7 * (2.0 * std::f64::consts::PI * 440.0 * time).sin();
                let (out_no, _) = comp_no_auto.process_sample(s, s);
                let (out_with, _) = comp_with_auto.process_sample(s, s);

                // Sample second half (steady state)
                if i >= 1200 {
                    sum_sq_no += out_no * out_no;
                    sum_sq_with += out_with * out_with;
                }
            }

            let rms_no = (sum_sq_no / 1200.0).sqrt();
            let rms_with = (sum_sq_with / 1200.0).sqrt();

            rms_drop_without_autogain.push(rms_no);
            rms_drop_with_autogain.push(rms_with);
        }

        // Calculate variance / spread of RMS levels across threshold sweeps
        let spread_no = rms_drop_without_autogain.first().unwrap() - rms_drop_without_autogain.last().unwrap();
        let spread_with = (rms_drop_with_autogain.first().unwrap() - rms_drop_with_autogain.last().unwrap()).abs();

        assert!(
            spread_with < spread_no,
            "Auto gain must keep output level flatter than without auto gain (with={}, without={})",
            spread_with,
            spread_no
        );
    }

    #[test]
    fn test_gain_reduction_exposure_matches_applied_reduction() {
        let sr = 48000.0;
        let mut comp = CompressorCore::new(sr);
        comp.set_threshold_immediate(-12.0);
        comp.set_ratio_immediate(4.0);
        comp.set_mix_immediate(1.0);
        comp.set_output_gain_db(0.0);
        comp.set_auto_gain(0.0);

        // Feed test signal through
        for i in 0..1000 {
            let t = i as f64 / sr;
            let s = 0.8 * (2.0 * std::f64::consts::PI * 100.0 * t).sin();
            let (out_l, _) = comp.process_sample(s, s);

            let gr_db = comp.current_gain_reduction_db();
            let expected_mult = 10.0_f64.powf(-gr_db / 20.0);

            // In steady state, ratio of out_l to dry input must equal 10^(-gr_db / 20)
            if s.abs() > 0.1 && i > 500 {
                let actual_mult = out_l / s;
                assert!(
                    (actual_mult - expected_mult).abs() < 1e-4,
                    "Exposed GR ({:.3} dB) does not match applied gain multiplier ({:.4} vs {:.4})",
                    gr_db,
                    actual_mult,
                    expected_mult
                );
            }
        }
    }
}
