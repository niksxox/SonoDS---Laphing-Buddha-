//! Master SonoDS Gate/Expander DSP Engine.

use crate::detector::{EnvelopeDetector, DetectorMode, DB_FLOOR};
use crate::gain_computer::{downward_expander_gain, upward_expander_gain};
use crate::state_machine::{BallisticsStateMachine, GateState};
use crate::lookahead::LookaheadBuffer;
use crate::style::{GateStyle, StyleProcessor};
use crate::sidechain::{SidechainSource, GateMode};
use crate::biquad::{BiquadFilter, BiquadFilterType};

#[derive(Debug, Clone)]
pub struct GateTelemetry {
    pub input_db: f64,
    pub detected_db: f64,
    pub output_db: f64,
    pub gr_db: f64, // positive for boost (Upward), negative or zero for reduction
    pub state: GateState,
}

#[derive(Debug, Clone)]
pub struct SonodsGateProcessor {
    sample_rate: f64,

    // Parameters
    threshold_db: f64,
    range_db: f64,
    ratio: f64,
    knee_db: f64,
    attack_sec: f64,
    hold_sec: f64,
    release_sec: f64,
    lookahead_sec: f64,
    style: GateStyle,
    mode: GateMode,
    sidechain_source: SidechainSource,
    sidechain_listen: bool,
    stereo_link: f64, // 0.0 (independent) to 1.0 (linked)
    mix: f64,
    output_gain_db: f64,
    midi_force_open: bool,

    // DSP components (per channel L & R)
    detector_l: EnvelopeDetector,
    detector_r: EnvelopeDetector,
    sc_detector_l: EnvelopeDetector,
    sc_detector_r: EnvelopeDetector,

    sc_hpf_l: BiquadFilter,
    sc_hpf_r: BiquadFilter,
    sc_lpf_l: BiquadFilter,
    sc_lpf_r: BiquadFilter,

    style_proc: StyleProcessor,
    state_machine_l: BallisticsStateMachine,
    state_machine_r: BallisticsStateMachine,

    lookahead_l: LookaheadBuffer,
    lookahead_r: LookaheadBuffer,

    // Latest telemetry
    latest_telemetry: GateTelemetry,
}

impl SonodsGateProcessor {
    pub fn new(sample_rate: f64) -> Self {
        let sr = sample_rate.max(1.0);
        let default_att = 0.002;
        let default_hold = 0.020;
        let default_rel = 0.150;

        Self {
            sample_rate: sr,
            threshold_db: -24.0,
            range_db: -60.0,
            ratio: 100.0, // hard gate default
            knee_db: 0.0,
            attack_sec: default_att,
            hold_sec: default_hold,
            release_sec: default_rel,
            lookahead_sec: 0.0,
            style: GateStyle::Classic,
            mode: GateMode::Gate,
            sidechain_source: SidechainSource::Internal,
            sidechain_listen: false,
            stereo_link: 1.0,
            mix: 1.0,
            output_gain_db: 0.0,
            midi_force_open: false,

            detector_l: EnvelopeDetector::new(sr, DetectorMode::Peak, 0.010),
            detector_r: EnvelopeDetector::new(sr, DetectorMode::Peak, 0.010),
            sc_detector_l: EnvelopeDetector::new(sr, DetectorMode::Peak, 0.010),
            sc_detector_r: EnvelopeDetector::new(sr, DetectorMode::Peak, 0.010),

            sc_hpf_l: BiquadFilter::new(sr, BiquadFilterType::Bypass, 20.0, 0.707),
            sc_hpf_r: BiquadFilter::new(sr, BiquadFilterType::Bypass, 20.0, 0.707),
            sc_lpf_l: BiquadFilter::new(sr, BiquadFilterType::Bypass, 20000.0, 0.707),
            sc_lpf_r: BiquadFilter::new(sr, BiquadFilterType::Bypass, 20000.0, 0.707),

            style_proc: StyleProcessor::new(sr, GateStyle::Classic, default_att, default_hold, default_rel),
            state_machine_l: BallisticsStateMachine::new(sr, default_att, default_hold, default_rel),
            state_machine_r: BallisticsStateMachine::new(sr, default_att, default_hold, default_rel),

            lookahead_l: LookaheadBuffer::new(0.010, sr),
            lookahead_r: LookaheadBuffer::new(0.010, sr),

            latest_telemetry: GateTelemetry {
                input_db: DB_FLOOR,
                detected_db: DB_FLOOR,
                output_db: DB_FLOOR,
                gr_db: 0.0,
                state: GateState::Closed,
            },
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate.max(1.0);
        self.detector_l.set_sample_rate(self.sample_rate, 0.010);
        self.detector_r.set_sample_rate(self.sample_rate, 0.010);
        self.sc_detector_l.set_sample_rate(self.sample_rate, 0.010);
        self.sc_detector_r.set_sample_rate(self.sample_rate, 0.010);
        self.sc_hpf_l.set_sample_rate(self.sample_rate);
        self.sc_hpf_r.set_sample_rate(self.sample_rate);
        self.sc_lpf_l.set_sample_rate(self.sample_rate);
        self.sc_lpf_r.set_sample_rate(self.sample_rate);
        self.style_proc.set_sample_rate(self.sample_rate);
        self.state_machine_l.set_sample_rate(self.sample_rate);
        self.state_machine_r.set_sample_rate(self.sample_rate);
        self.lookahead_l = LookaheadBuffer::new(0.010, self.sample_rate);
        self.lookahead_r = LookaheadBuffer::new(0.010, self.sample_rate);
        self.lookahead_l.set_lookahead(self.lookahead_sec, self.sample_rate);
        self.lookahead_r.set_lookahead(self.lookahead_sec, self.sample_rate);
    }

    pub fn reset(&mut self) {
        self.detector_l.reset();
        self.detector_r.reset();
        self.sc_detector_l.reset();
        self.sc_detector_r.reset();
        self.sc_hpf_l.reset();
        self.sc_hpf_r.reset();
        self.sc_lpf_l.reset();
        self.sc_lpf_r.reset();
        self.style_proc.reset();
        self.state_machine_l.reset(-60.0);
        self.state_machine_r.reset(-60.0);
        self.lookahead_l.reset();
        self.lookahead_r.reset();
    }

    // Setters
    pub fn set_threshold(&mut self, val: f64) { self.threshold_db = val.clamp(-60.0, 0.0); }
    pub fn set_range(&mut self, val: f64) { self.range_db = val.clamp(-60.0, 24.0); }
    pub fn set_ratio(&mut self, val: f64) { self.ratio = val.clamp(1.0, 100.0); }
    pub fn set_knee(&mut self, val: f64) { self.knee_db = val.clamp(0.0, 24.0); }
    pub fn set_attack(&mut self, val: f64) {
        self.attack_sec = val.clamp(0.0001, 0.5);
        self.update_ballistics();
    }
    pub fn set_hold(&mut self, val: f64) {
        self.hold_sec = val.clamp(0.0, 2.0);
        self.update_ballistics();
    }
    pub fn set_release(&mut self, val: f64) {
        self.release_sec = val.clamp(0.005, 5.0);
        self.update_ballistics();
    }
    pub fn set_lookahead(&mut self, val: f64) {
        self.lookahead_sec = val.clamp(0.0, 0.010);
        self.lookahead_l.set_lookahead(self.lookahead_sec, self.sample_rate);
        self.lookahead_r.set_lookahead(self.lookahead_sec, self.sample_rate);
    }
    pub fn set_style(&mut self, style: GateStyle) {
        self.style = style;
        self.style_proc.set_style(style);
    }
    pub fn set_mode(&mut self, mode: GateMode) { self.mode = mode; }
    pub fn set_detector_mode(&mut self, mode: DetectorMode) {
        self.detector_l.set_mode(mode);
        self.detector_r.set_mode(mode);
        self.sc_detector_l.set_mode(mode);
        self.sc_detector_r.set_mode(mode);
    }
    pub fn set_sidechain_source(&mut self, source: SidechainSource) { self.sidechain_source = source; }
    pub fn set_sidechain_listen(&mut self, listen: bool) { self.sidechain_listen = listen; }
    pub fn set_sidechain_hpf(&mut self, freq_hz: f64) {
        if freq_hz <= 25.0 {
            self.sc_hpf_l.set_params(BiquadFilterType::Bypass, 20.0, 0.707);
            self.sc_hpf_r.set_params(BiquadFilterType::Bypass, 20.0, 0.707);
        } else {
            self.sc_hpf_l.set_params(BiquadFilterType::HighPass, freq_hz, 0.707);
            self.sc_hpf_r.set_params(BiquadFilterType::HighPass, freq_hz, 0.707);
        }
    }
    pub fn set_sidechain_lpf(&mut self, freq_hz: f64) {
        if freq_hz >= 18000.0 {
            self.sc_lpf_l.set_params(BiquadFilterType::Bypass, 20000.0, 0.707);
            self.sc_lpf_r.set_params(BiquadFilterType::Bypass, 20000.0, 0.707);
        } else {
            self.sc_lpf_l.set_params(BiquadFilterType::LowPass, freq_hz, 0.707);
            self.sc_lpf_r.set_params(BiquadFilterType::LowPass, freq_hz, 0.707);
        }
    }
    pub fn set_stereo_link(&mut self, link: f64) { self.stereo_link = link.clamp(0.0, 1.0); }
    pub fn set_mix(&mut self, mix: f64) { self.mix = mix.clamp(0.0, 1.0); }
    pub fn set_output_gain(&mut self, gain_db: f64) { self.output_gain_db = gain_db.clamp(-24.0, 24.0); }
    pub fn set_midi_force_open(&mut self, force: bool) { self.midi_force_open = force; }

    pub fn latency_samples(&self) -> usize {
        self.lookahead_l.delay_samples()
    }

    pub fn latest_telemetry(&self) -> &GateTelemetry {
        &self.latest_telemetry
    }

    fn update_ballistics(&mut self) {
        self.style_proc.set_times(self.attack_sec, self.hold_sec, self.release_sec);
        self.state_machine_l.set_times(self.attack_sec, self.hold_sec, self.release_sec);
        self.state_machine_r.set_times(self.attack_sec, self.hold_sec, self.release_sec);
    }

    /// Process a stereo audio block.
    /// * `main_in_l` / `main_in_r`: Main input channels
    /// * `main_out_l` / `main_out_r`: Processed output channels
    /// * `ext_sc_l` / `ext_sc_r`: External sidechain channels (optional, pass &[0.0; len] if none)
    pub fn process_block(
        &mut self,
        main_in_l: &[f64],
        main_in_r: &[f64],
        main_out_l: &mut [f64],
        main_out_r: &mut [f64],
        ext_sc_l: &[f64],
        ext_sc_r: &[f64],
    ) {
        let len = main_in_l.len().min(main_in_r.len()).min(main_out_l.len()).min(main_out_r.len());
        if len == 0 {
            return;
        }

        let make_up_lin = 10.0f64.powf(self.output_gain_db / 20.0);
        let effective_knee = self.style_proc.effective_knee(self.knee_db);

        let mut max_input_linear = 0.0f64;
        let mut max_detected_db = DB_FLOOR;
        let mut max_output_linear = 0.0f64;
        let mut latest_gr_db = 0.0f64;
        let mut latest_state = GateState::Closed;

        for i in 0..len {
            let in_l = main_in_l[i];
            let in_r = main_in_r[i];

            let in_lin = in_l.abs().max(in_r.abs());
            if in_lin > max_input_linear {
                max_input_linear = in_lin;
            }

            // 1. Select detector source
            let (raw_sc_l, raw_sc_r) = match self.sidechain_source {
                SidechainSource::Internal => (in_l, in_r),
                SidechainSource::External => {
                    let s_l = if i < ext_sc_l.len() { ext_sc_l[i] } else { 0.0 };
                    let s_r = if i < ext_sc_r.len() { ext_sc_r[i] } else { 0.0 };
                    (s_l, s_r)
                }
            };

            // 2. Apply sidechain HPF & LPF filtering
            let filtered_sc_l = self.sc_lpf_l.process_sample(self.sc_hpf_l.process_sample(raw_sc_l));
            let filtered_sc_r = self.sc_lpf_r.process_sample(self.sc_hpf_r.process_sample(raw_sc_r));

            // If sidechain listen/audition is enabled, route filtered sidechain directly to output
            if self.sidechain_listen {
                main_out_l[i] = filtered_sc_l * make_up_lin;
                main_out_r[i] = filtered_sc_r * make_up_lin;
                continue;
            }

            // 3. Level detection
            let det_l_db = self.detector_l.process_sample_db(filtered_sc_l);
            let det_r_db = self.detector_r.process_sample_db(filtered_sc_r);

            // Stereo linking
            let linked_det_db = (1.0 - self.stereo_link) * det_l_db + self.stereo_link * det_l_db.max(det_r_db);
            if linked_det_db > max_detected_db {
                max_detected_db = linked_det_db;
            }

            // 4. Compute target gain reduction/boost from Gain Computer
            let target_gain_db = if self.midi_force_open {
                0.0 // MIDI Note On forces gate open (0 dB reduction)
            } else {
                match self.mode {
                    GateMode::Gate => {
                        downward_expander_gain(linked_det_db, self.threshold_db, self.ratio, self.range_db, effective_knee)
                    }
                    GateMode::Upward => {
                        upward_expander_gain(linked_det_db, self.threshold_db, self.ratio, self.range_db, effective_knee)
                    }
                    GateMode::Ducking => {
                        // Ducking: Attenuates when sidechain is ABOVE threshold
                        if linked_det_db > self.threshold_db {
                            let duck_delta = linked_det_db - self.threshold_db;
                            let duck_reduct = -(duck_delta * (1.0 - 1.0 / self.ratio));
                            duck_reduct.max(-self.range_db.abs())
                        } else {
                            0.0
                        }
                    }
                }
            };

            // 5. Check trigger condition
            let is_triggered = if self.midi_force_open {
                true // MIDI Note On forces gate open
            } else {
                match self.mode {
                    GateMode::Gate => linked_det_db > (self.threshold_db - effective_knee * 0.5),
                    GateMode::Upward => linked_det_db > (self.threshold_db - effective_knee * 0.5),
                    GateMode::Ducking => linked_det_db <= self.threshold_db, // open (0 dB) when quiet
                }
            };

            // 6. Ballistics smoothing
            let cur_gain = self.state_machine_l.current_gain_db();
            let _ = self.style_proc.compute_effective_alphas(linked_det_db, cur_gain, self.state_machine_l.state());

            let applied_gain_db = self.state_machine_l.process_sample(target_gain_db, is_triggered);
            latest_gr_db = applied_gain_db;
            latest_state = self.state_machine_l.state();

            // 7. Apply lookahead delayed dry path
            let delayed_l = self.lookahead_l.process_sample(in_l);
            let delayed_r = self.lookahead_r.process_sample(in_r);

            let gain_lin = 10.0f64.powf(applied_gain_db / 20.0);
            let wet_l = delayed_l * gain_lin * make_up_lin;
            let wet_r = delayed_r * gain_lin * make_up_lin;

            // 8. Dry / Wet Mix
            let out_l = (1.0 - self.mix) * delayed_l + self.mix * wet_l;
            let out_r = (1.0 - self.mix) * delayed_r + self.mix * wet_r;

            main_out_l[i] = out_l;
            main_out_r[i] = out_r;

            let out_lin = out_l.abs().max(out_r.abs());
            if out_lin > max_output_linear {
                max_output_linear = out_lin;
            }
        }

        // Store telemetry
        self.latest_telemetry = GateTelemetry {
            input_db: EnvelopeDetector::linear_to_db(max_input_linear),
            detected_db: max_detected_db,
            output_db: EnvelopeDetector::linear_to_db(max_output_linear),
            gr_db: latest_gr_db,
            state: latest_state,
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gate_dry_passthrough_at_mix_zero() {
        let mut proc = SonodsGateProcessor::new(44100.0);
        proc.set_mix(0.0);
        proc.set_threshold(-10.0);

        let input_l = vec![0.5; 128];
        let input_r = vec![-0.5; 128];
        let mut out_l = vec![0.0; 128];
        let mut out_r = vec![0.0; 128];

        proc.process_block(&input_l, &input_r, &mut out_l, &mut out_r, &[], &[]);

        for i in 0..128 {
            assert_eq!(out_l[i], input_l[i]);
            assert_eq!(out_r[i], input_r[i]);
        }
    }

    #[test]
    fn test_fuzz_random_inputs_no_nan_or_infinity() {
        let mut proc = SonodsGateProcessor::new(48000.0);
        let block_size = 128;

        let thresholds = [-50.0, -30.0, -15.0, -5.0, 0.0];
        let ratios = [1.0, 1.5, 2.0, 4.0, 10.0, 100.0];
        let ranges = [-60.0, -40.0, -20.0, 0.0, 12.0, 24.0];
        let attacks = [0.0001, 0.001, 0.010, 0.050];
        let holds = [0.0, 0.010, 0.050, 0.200];
        let releases = [0.010, 0.050, 0.200, 1.0];
        let styles = [GateStyle::Classic, GateStyle::Clean, GateStyle::Vocal, GateStyle::Guitar];
        let modes = [GateMode::Gate, GateMode::Upward, GateMode::Ducking];

        // Seeded pseudo-random generator
        let mut seed: u64 = 0x12345678_9ABCDEF0;
        let mut next_rand = || -> f64 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            let val = ((seed >> 33) as i32) as f64 / 2147483648.0;
            val // between -1.0 and 1.0
        };

        for &thresh in &thresholds {
            for &rat in &ratios {
                for &rng in &ranges {
                    for &att in &attacks {
                        for &hld in &holds {
                            for &rel in &releases {
                                for &sty in &styles {
                                    for &md in &modes {
                                        proc.set_threshold(thresh);
                                        proc.set_ratio(rat);
                                        proc.set_range(rng);
                                        proc.set_attack(att);
                                        proc.set_hold(hld);
                                        proc.set_release(rel);
                                        proc.set_style(sty);
                                        proc.set_mode(md);

                                        let in_l: Vec<f64> = (0..block_size).map(|_| next_rand()).collect();
                                        let in_r: Vec<f64> = (0..block_size).map(|_| next_rand()).collect();
                                        let mut out_l = vec![0.0; block_size];
                                        let mut out_r = vec![0.0; block_size];

                                        proc.process_block(&in_l, &in_r, &mut out_l, &mut out_r, &[], &[]);

                                        for i in 0..block_size {
                                            assert!(!out_l[i].is_nan(), "Output L must not be NaN");
                                            assert!(!out_l[i].is_infinite(), "Output L must not be Infinite");
                                            assert!(!out_r[i].is_nan(), "Output R must not be NaN");
                                            assert!(!out_r[i].is_infinite(), "Output R must not be Infinite");
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
