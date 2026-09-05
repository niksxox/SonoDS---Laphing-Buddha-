//! Style Algorithms (Classic, Clean, Vocal, Guitar) per Task 1.6.
//!
//! Replicates FabFilter Pro-G's signature character styles by adapting attack/release curves,
//! program-dependent heuristics, and knee behavior on top of the core state machine.

use crate::state_machine::GateState;
use crate::denormals::flush_denormal;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateStyle {
    /// Classic: Standard exponential ballistics, unmodified baseline reference.
    Classic,
    /// Clean: Dual-stage release (fast initial drop, then smooth decay) with automatically widened soft knee.
    Clean,
    /// Vocal: Program-dependent attack adapting to signal rise-rate (smooth on breaths, fast on consonants), fast release.
    Vocal,
    /// Guitar: Single-stage gentle release tuned for string decay before amp/distortion stages.
    Guitar,
}

#[derive(Debug, Clone)]
pub struct StyleProcessor {
    style: GateStyle,
    sample_rate: f64,
    base_attack_sec: f64,
    base_hold_sec: f64,
    base_release_sec: f64,
    prev_input_db: f64,
    input_rise_rate: f64,
    dual_stage_phase: f64, // for Clean dual-stage release
}

impl StyleProcessor {
    pub fn new(sample_rate: f64, style: GateStyle, attack_sec: f64, hold_sec: f64, release_sec: f64) -> Self {
        Self {
            style,
            sample_rate: sample_rate.max(1.0),
            base_attack_sec: attack_sec.max(1e-5),
            base_hold_sec: hold_sec.max(0.0),
            base_release_sec: release_sec.max(1e-5),
            prev_input_db: -60.0,
            input_rise_rate: 0.0,
            dual_stage_phase: 0.0,
        }
    }

    pub fn set_style(&mut self, style: GateStyle) {
        self.style = style;
        self.dual_stage_phase = 0.0;
    }

    pub fn style(&self) -> GateStyle {
        self.style
    }

    pub fn set_times(&mut self, attack_sec: f64, hold_sec: f64, release_sec: f64) {
        self.base_attack_sec = attack_sec.max(1e-5);
        self.base_hold_sec = hold_sec.max(0.0);
        self.base_release_sec = release_sec.max(1e-5);
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate.max(1.0);
    }

    pub fn reset(&mut self) {
        self.prev_input_db = -60.0;
        self.input_rise_rate = 0.0;
        self.dual_stage_phase = 0.0;
    }

    /// Computes effective knee width adjustment for the current style.
    pub fn effective_knee(&self, user_knee_db: f64) -> f64 {
        match self.style {
            GateStyle::Clean => user_knee_db + 6.0, // Clean widens knee for ultra-smooth transition
            GateStyle::Vocal => user_knee_db + 3.0,
            GateStyle::Classic | GateStyle::Guitar => user_knee_db,
        }
    }

    /// Computes dynamic attack and release time constants for the current audio sample and state.
    ///
    /// Heuristics per Style:
    /// - **Classic**: Unmodified user attack & release.
    /// - **Clean**: Dual-stage release. Fast initial 50% drop (`0.4 * release_sec`), then slower tail (`1.6 * release_sec`).
    /// - **Vocal**: Input rise-rate detection. Fast rising transient -> smooth attack (`1.5 * attack_sec`) to avoid breath gulp.
    ///              Release is shortened (`0.65 * release_sec`) to silence background headphone bleed quickly.
    /// - **Guitar**: Natural string exponential decay. Single continuous release tuned slightly longer (`1.35 * release_sec`)
    ///               with smooth tail for sustain pedals / high-gain pre-amp.
    pub fn compute_effective_alphas(
        &mut self,
        input_db: f64,
        current_gain_db: f64,
        _state: GateState,
    ) -> (f64, f64) {
        // Track input rise rate (dB per sample) with leaky integrator
        let instant_rise = (input_db - self.prev_input_db).max(0.0);
        self.prev_input_db = input_db;
        self.input_rise_rate = flush_denormal(0.95 * self.input_rise_rate + 0.05 * instant_rise);

        let (eff_att_sec, eff_rel_sec) = match self.style {
            GateStyle::Classic => (self.base_attack_sec, self.base_release_sec),

            GateStyle::Clean => {
                // Dual-stage release: If gain reduction is in the initial drop stage (0 dB down to -12 dB),
                // use faster release to shut promptly, then slower release for the deep tail to prevent pumping.
                let rel_mod = if current_gain_db > -12.0 {
                    0.55 * self.base_release_sec
                } else {
                    1.45 * self.base_release_sec
                };
                (self.base_attack_sec, rel_mod)
            }

            GateStyle::Vocal => {
                // Program-dependent: Faster input rise -> gently increase attack time to avoid "gulp" on breath sounds
                let rise_factor = (self.input_rise_rate * 2.0).clamp(0.0, 1.0);
                let att_mod = self.base_attack_sec * (1.0 + 0.6 * rise_factor);
                // Vocal release is tuned brisk to cut bleed between vocal lines
                let rel_mod = self.base_release_sec * 0.65;
                (att_mod, rel_mod)
            }

            GateStyle::Guitar => {
                // Guitar release: Single-stage continuous decay with longer sustain for decaying guitar notes
                let att_mod = self.base_attack_sec * 0.9;
                let rel_mod = self.base_release_sec * 1.35;
                (att_mod, rel_mod)
            }
        };

        let att_alpha = (-1.0 / (self.sample_rate * eff_att_sec.max(1e-5))).exp();
        let rel_alpha = (-1.0 / (self.sample_rate * eff_rel_sec.max(1e-5))).exp();

        (att_alpha, rel_alpha)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_styles_produce_measurably_different_release_shapes() {
        let sample_rate = 44100.0;
        let base_rel_sec = 0.100; // 100 ms

        let mut proc_classic = StyleProcessor::new(sample_rate, GateStyle::Classic, 0.001, 0.0, base_rel_sec);
        let mut proc_clean = StyleProcessor::new(sample_rate, GateStyle::Clean, 0.001, 0.0, base_rel_sec);
        let mut proc_vocal = StyleProcessor::new(sample_rate, GateStyle::Vocal, 0.001, 0.0, base_rel_sec);
        let mut proc_guitar = StyleProcessor::new(sample_rate, GateStyle::Guitar, 0.001, 0.0, base_rel_sec);

        // Measure time (sample count) to decay from 0 dB to -20 dB toward -60 dB target
        let target_db = -60.0;

        let simulate_decay = |proc: &mut StyleProcessor| -> usize {
            let mut gain_db = 0.0;
            let mut samples = 0;
            while gain_db > -20.0 && samples < 100_000 {
                let (_, rel_alpha) = proc.compute_effective_alphas(-60.0, gain_db, GateState::Releasing);
                gain_db = rel_alpha * gain_db + (1.0 - rel_alpha) * target_db;
                samples += 1;
            }
            samples
        };

        let samples_classic = simulate_decay(&mut proc_classic);
        let samples_clean = simulate_decay(&mut proc_clean);
        let samples_vocal = simulate_decay(&mut proc_vocal);
        let samples_guitar = simulate_decay(&mut proc_guitar);

        // Vocal must be fastest (least samples to -20 dB)
        assert!(
            samples_vocal < samples_classic,
            "Vocal ({} samples) should release faster than Classic ({} samples)",
            samples_vocal,
            samples_classic
        );

        // Clean initial stage (0 to -12 dB) is fast
        assert!(
            samples_clean < samples_classic,
            "Clean initial stage ({} samples) should be faster than Classic ({} samples)",
            samples_clean,
            samples_classic
        );

        // Guitar must have the longest sustain
        assert!(
            samples_guitar > samples_classic,
            "Guitar ({} samples) should sustain longer than Classic ({} samples)",
            samples_guitar,
            samples_classic
        );

        // Prove all four are distinctly different
        assert_ne!(samples_classic, samples_clean);
        assert_ne!(samples_classic, samples_vocal);
        assert_ne!(samples_classic, samples_guitar);
        assert_ne!(samples_clean, samples_guitar);
    }

    #[test]
    fn test_clean_widens_knee() {
        let proc_classic = StyleProcessor::new(44100.0, GateStyle::Classic, 0.001, 0.0, 0.1);
        let proc_clean = StyleProcessor::new(44100.0, GateStyle::Clean, 0.001, 0.0, 0.1);

        assert_eq!(proc_classic.effective_knee(6.0), 6.0);
        assert_eq!(proc_clean.effective_knee(6.0), 12.0);
    }
}
