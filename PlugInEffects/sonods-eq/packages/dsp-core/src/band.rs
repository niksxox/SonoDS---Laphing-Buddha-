use crate::biquad::{Biquad, BiquadCoeffs};
use crate::coeffs::{bell, high_shelf, low_shelf, CutSlope, FilterChain, Shape};
use crate::smoothing::{
    LinearRamp, SmoothedParam, BYPASS_FADE_MS, FREQ_SMOOTHING_MS, GAIN_SMOOTHING_MS, Q_SMOOTHING_MS,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessingMode {
    Stereo,
    Mid,
    Side,
    Left,
    Right,
}

#[derive(Debug, Clone)]
pub struct Band {
    pub shape: Shape,
    pub cut_slope: CutSlope,
    pub freq: SmoothedParam,
    pub gain: SmoothedParam,
    pub q: SmoothedParam,
    pub bypass_fade: LinearRamp,
    pub enabled: bool,
    pub mode: ProcessingMode,

    // Left and Right biquads (or Mid/Side)
    pub biquad_l: Biquad,
    pub biquad_r: Biquad,
    pub filter_chain_l: FilterChain,
    pub filter_chain_r: FilterChain,

    // Last computed values to avoid recalculation
    last_freq: f64,
    last_gain: f64,
    last_q: f64,
    last_shape: Shape,
    last_slope: CutSlope,

    // Dynamic EQ
    pub dynamic_enabled: bool,
    pub dynamic_threshold_db: f64,
    pub dynamic_range_db: f64,
    pub dynamic_gain_offset: f64,
    pub env_detector: f64,
    pub env_attack_coeff: f64,
    pub env_release_coeff: f64,
}

impl Band {
    pub fn new(shape: Shape, freq_hz: f64, gain_db: f64, q: f64, sample_rate: f64) -> Self {
        let mut band = Self {
            shape,
            cut_slope: CutSlope::Db24,
            freq: SmoothedParam::new(freq_hz, FREQ_SMOOTHING_MS, sample_rate),
            gain: SmoothedParam::new(gain_db, GAIN_SMOOTHING_MS, sample_rate),
            q: SmoothedParam::new(q, Q_SMOOTHING_MS, sample_rate),
            bypass_fade: LinearRamp::new(1.0, BYPASS_FADE_MS, sample_rate),
            enabled: true,
            mode: ProcessingMode::Stereo,

            biquad_l: Biquad::new(BiquadCoeffs::identity()),
            biquad_r: Biquad::new(BiquadCoeffs::identity()),
            filter_chain_l: FilterChain::new(),
            filter_chain_r: FilterChain::new(),

            last_freq: -1.0,
            last_gain: -999.0,
            last_q: -1.0,
            last_shape: shape,
            last_slope: CutSlope::Db24,

            dynamic_enabled: false,
            dynamic_threshold_db: -18.0,
            dynamic_range_db: 0.0,
            dynamic_gain_offset: 0.0,
            env_detector: 0.0,
            env_attack_coeff: (-1.0 / (0.010 * sample_rate)).exp(),  // 10ms
            env_release_coeff: (-1.0 / (0.100 * sample_rate)).exp(), // 100ms
        };

        band.recompute_coeffs(sample_rate);
        band
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        self.bypass_fade.set_target(if enabled { 1.0 } else { 0.0 });
    }

    pub fn snap_to(
        &mut self,
        shape: Shape,
        freq: f64,
        gain: f64,
        q: f64,
        enabled: bool,
        sample_rate: f64,
    ) {
        self.shape = shape;
        self.freq.snap_to(freq.clamp(10.0, sample_rate * 0.499));
        self.gain.snap_to(gain.clamp(-30.0, 30.0));
        self.q.snap_to(q.clamp(0.05, 40.0));
        self.bypass_fade.snap_to(if enabled { 1.0 } else { 0.0 });
        self.enabled = enabled;
        self.dynamic_gain_offset = 0.0;
        self.env_detector = 0.0;
        self.biquad_l.reset_state();
        self.biquad_r.reset_state();
        self.recompute_coeffs(sample_rate);
    }

    pub fn update_dynamic_coefficients(&mut self, sample_rate: f64) {
        // Program-dependent attack/release: faster for high frequencies, slower for low frequencies
        let f = self.freq.target.clamp(20.0, 20000.0);
        let attack_ms = (50.0 / f.sqrt()).clamp(1.0, 50.0);
        let release_ms = (300.0 / f.sqrt() * 5.0).clamp(20.0, 500.0);

        self.env_attack_coeff = (-1.0 / (attack_ms / 1000.0 * sample_rate)).exp();
        self.env_release_coeff = (-1.0 / (release_ms / 1000.0 * sample_rate)).exp();
    }

    pub fn tick_smoothing(&mut self, sample_rate: f64) {
        let is_moving = self.freq.is_smoothing()
            || self.gain.is_smoothing()
            || self.q.is_smoothing()
            || self.bypass_fade.is_smoothing()
            || self.shape != self.last_shape
            || self.cut_slope != self.last_slope;

        if is_moving {
            self.freq.tick();
            self.gain.tick();
            self.q.tick();
            self.bypass_fade.tick();

            let current_freq = self.freq.current;
            let current_gain = self.gain.current + self.dynamic_gain_offset;
            let current_q = self.q.current;

            self.recompute_coeffs_with_values(
                current_freq,
                current_gain,
                current_q,
                self.shape,
                self.cut_slope,
                sample_rate,
            );
        } else if (self.dynamic_gain_offset - (self.last_gain - self.gain.current)).abs() > 1e-3 {
            let current_freq = self.freq.current;
            let current_gain = self.gain.current + self.dynamic_gain_offset;
            let current_q = self.q.current;

            self.recompute_coeffs_with_values(
                current_freq,
                current_gain,
                current_q,
                self.shape,
                self.cut_slope,
                sample_rate,
            );
        }
    }

    pub fn recompute_coeffs(&mut self, sample_rate: f64) {
        self.recompute_coeffs_with_values(
            self.freq.current,
            self.gain.current + self.dynamic_gain_offset,
            self.q.current,
            self.shape,
            self.cut_slope,
            sample_rate,
        );
    }

    fn recompute_coeffs_with_values(
        &mut self,
        freq: f64,
        gain: f64,
        q: f64,
        shape: Shape,
        slope: CutSlope,
        sample_rate: f64,
    ) {
        self.last_freq = freq;
        self.last_gain = gain;
        self.last_q = q;
        self.last_shape = shape;
        self.last_slope = slope;

        match shape {
            Shape::Bell => {
                let c = bell(freq, sample_rate, gain, q);
                self.biquad_l.set_coeffs(c);
                self.biquad_r.set_coeffs(c);
            }
            Shape::LowShelf => {
                let c = low_shelf(freq, sample_rate, gain, q);
                self.biquad_l.set_coeffs(c);
                self.biquad_r.set_coeffs(c);
            }
            Shape::HighShelf => {
                let c = high_shelf(freq, sample_rate, gain, q);
                self.biquad_l.set_coeffs(c);
                self.biquad_r.set_coeffs(c);
            }
            Shape::LowCut => {
                self.filter_chain_l
                    .update_high_pass(freq, sample_rate, slope);
                self.filter_chain_r
                    .update_high_pass(freq, sample_rate, slope);
            }
            Shape::HighCut => {
                self.filter_chain_l
                    .update_low_pass(freq, sample_rate, slope);
                self.filter_chain_r
                    .update_low_pass(freq, sample_rate, slope);
            }
        }
    }

    #[inline(always)]
    pub fn process_sample_stereo(&mut self, l: f64, r: f64) -> (f64, f64) {
        let fade = self.bypass_fade.current;
        if fade < 1e-4 && !self.enabled {
            return (l, r);
        }

        // Dynamic EQ detection on input energy
        if self.dynamic_enabled && self.dynamic_range_db.abs() > 0.01 {
            let mono_in = (l.abs() + r.abs()) * 0.5;
            let target_env = mono_in;
            let coeff = if target_env > self.env_detector {
                self.env_attack_coeff
            } else {
                self.env_release_coeff
            };
            self.env_detector = target_env + (self.env_detector - target_env) * coeff;

            let env_db = if self.env_detector > 1e-6 {
                20.0 * self.env_detector.log10()
            } else {
                -120.0
            };

            let overshoot_db = (env_db - self.dynamic_threshold_db).max(0.0);
            let target_offset = if self.dynamic_range_db > 0.0 {
                (overshoot_db * 0.5).min(self.dynamic_range_db)
            } else {
                (-overshoot_db * 0.5).max(self.dynamic_range_db)
            };
            self.dynamic_gain_offset = target_offset;
        }

        let (mut filt_l, mut filt_r) = match self.shape {
            Shape::Bell | Shape::LowShelf | Shape::HighShelf => {
                (self.biquad_l.process_sample(l), self.biquad_r.process_sample(r))
            }
            Shape::LowCut | Shape::HighCut => (
                self.filter_chain_l.process_sample(l),
                self.filter_chain_r.process_sample(r),
            ),
        };

        // Mid/Side or Left/Right routing
        match self.mode {
            ProcessingMode::Stereo => {}
            ProcessingMode::Left => {
                filt_r = r;
            }
            ProcessingMode::Right => {
                filt_l = l;
            }
            ProcessingMode::Mid => {
                let m_in = (l + r) * 0.5;
                let s_in = (l - r) * 0.5;
                let m_out = match self.shape {
                    Shape::Bell | Shape::LowShelf | Shape::HighShelf => {
                        self.biquad_l.process_sample(m_in)
                    }
                    Shape::LowCut | Shape::HighCut => self.filter_chain_l.process_sample(m_in),
                };
                filt_l = m_out + s_in;
                filt_r = m_out - s_in;
            }
            ProcessingMode::Side => {
                let m_in = (l + r) * 0.5;
                let s_in = (l - r) * 0.5;
                let s_out = match self.shape {
                    Shape::Bell | Shape::LowShelf | Shape::HighShelf => {
                        self.biquad_r.process_sample(s_in)
                    }
                    Shape::LowCut | Shape::HighCut => self.filter_chain_r.process_sample(s_in),
                };
                filt_l = m_in + s_out;
                filt_r = m_in - s_out;
            }
        }

        if (fade - 1.0).abs() < 1e-4 {
            (filt_l, filt_r)
        } else {
            (l + (filt_l - l) * fade, r + (filt_r - r) * fade)
        }
    }

    pub fn magnitude_db(&self, freq_hz: f64, sample_rate: f64) -> f64 {
        if !self.enabled && self.bypass_fade.current < 1e-4 {
            return 0.0;
        }
        let total_gain = self.gain.target + self.dynamic_gain_offset;
        let mag = match self.shape {
            Shape::Bell => bell(self.freq.target, sample_rate, total_gain, self.q.target)
                .magnitude_db(freq_hz, sample_rate),
            Shape::LowShelf => low_shelf(self.freq.target, sample_rate, total_gain, self.q.target)
                .magnitude_db(freq_hz, sample_rate),
            Shape::HighShelf => high_shelf(self.freq.target, sample_rate, total_gain, self.q.target)
                .magnitude_db(freq_hz, sample_rate),
            Shape::LowCut => FilterChain::high_pass(self.freq.target, sample_rate, self.cut_slope)
                .magnitude_db(freq_hz, sample_rate),
            Shape::HighCut => FilterChain::low_pass(self.freq.target, sample_rate, self.cut_slope)
                .magnitude_db(freq_hz, sample_rate),
        };
        mag * self.bypass_fade.target
    }
}
