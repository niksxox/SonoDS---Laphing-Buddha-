//! Exponential parameter smoothing and equal-power character crossfader.

use crate::waveshaper::Character;
use std::f64::consts::PI;

pub const DRIVE_SMOOTHING_MS: f64 = 20.0;
pub const TONE_SMOOTHING_MS: f64 = 20.0;
pub const MIX_SMOOTHING_MS: f64 = 15.0;
pub const OUTPUT_SMOOTHING_MS: f64 = 15.0;
pub const CHARACTER_CROSSFADE_MS: f64 = 40.0;

/// 1-pole exponential parameter smoother.
#[derive(Debug, Clone)]
pub struct SmoothedParam {
    current: f64,
    target: f64,
    coeff: f64,
}

impl SmoothedParam {
    pub fn new(initial_val: f64, time_ms: f64, sample_rate: f64) -> Self {
        let coeff = Self::calculate_coeff(time_ms, sample_rate);
        Self {
            current: initial_val,
            target: initial_val,
            coeff,
        }
    }

    fn calculate_coeff(time_ms: f64, sample_rate: f64) -> f64 {
        if time_ms <= 0.0 {
            1.0
        } else {
            1.0 - (-1.0 / (time_ms * 0.001 * sample_rate)).exp()
        }
    }

    pub fn set_target(&mut self, target: f64) {
        self.target = target;
    }

    pub fn snap_to(&mut self, val: f64) {
        self.current = val;
        self.target = val;
    }

    pub fn update_sample_rate(&mut self, time_ms: f64, sample_rate: f64) {
        self.coeff = Self::calculate_coeff(time_ms, sample_rate);
    }

    #[inline(always)]
    pub fn tick(&mut self) -> f64 {
        if self.current == self.target {
            self.current
        } else {
            self.current += (self.target - self.current) * self.coeff;
            if (self.target - self.current).abs() < 1e-6 {
                self.current = self.target;
            }
            self.current
        }
    }

    #[inline(always)]
    pub fn get_current(&self) -> f64 {
        self.current
    }

    #[inline(always)]
    pub fn is_smoothing(&self) -> bool {
        (self.current - self.target).abs() >= 1e-6
    }
}

/// Equal-power character crossfader.
#[derive(Debug, Clone)]
pub struct CharacterCrossfader {
    pub current_char: Character,
    pub outgoing_char: Option<Character>,
    fade_progress: f64,
    fade_step: f64,
}

impl CharacterCrossfader {
    pub fn new(initial_char: Character) -> Self {
        Self {
            current_char: initial_char,
            outgoing_char: None,
            fade_progress: 1.0,
            fade_step: 0.0,
        }
    }

    pub fn set_character(&mut self, new_char: Character, sample_rate: f64, time_ms: f64) {
        if new_char == self.current_char && self.outgoing_char.is_none() {
            return;
        }

        self.outgoing_char = Some(self.current_char);
        self.current_char = new_char;
        self.fade_progress = 0.0;
        let total_samples = (time_ms * 0.001 * sample_rate).max(1.0);
        self.fade_step = 1.0 / total_samples;
    }

    #[inline(always)]
    pub fn tick(&mut self) -> (Character, f64, Option<(Character, f64)>) {
        if let Some(out_char) = self.outgoing_char {
            self.fade_progress = (self.fade_progress + self.fade_step).min(1.0);
            let theta = self.fade_progress * (PI / 2.0);
            let gain_in = theta.sin();
            let gain_out = theta.cos();

            if self.fade_progress >= 1.0 {
                self.outgoing_char = None;
            }

            (self.current_char, gain_in, Some((out_char, gain_out)))
        } else {
            (self.current_char, 1.0, None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smoothed_param_click_free_rapid_automation() {
        let sample_rate = 44100.0;
        let mut param = SmoothedParam::new(0.0, 20.0, sample_rate);
        param.set_target(1.0);

        let mut values = Vec::with_capacity(1000);
        for _ in 0..1000 {
            values.push(param.tick());
        }

        for w in values.windows(2) {
            let delta = (w[1] - w[0]).abs();
            assert!(delta < 0.01, "Smoothed delta too large: {}", delta);
        }

        assert!(values[values.len() - 1] > 0.65);
    }

    #[test]
    fn test_character_equal_power_crossfade() {
        let sample_rate = 44100.0;
        let mut xfader = CharacterCrossfader::new(Character::Tape);
        xfader.set_character(Character::Tube, sample_rate, 40.0);

        let mut sum_squares = Vec::new();
        for _ in 0..2000 {
            let (_, in_gain, out_opt) = xfader.tick();
            if let Some((_, out_gain)) = out_opt {
                let power = in_gain * in_gain + out_gain * out_gain;
                sum_squares.push(power);
            }
        }

        assert!(!sum_squares.is_empty());
        for &power in &sum_squares {
            assert!(
                (power - 1.0).abs() < 1e-6,
                "Equal power violated: sin^2 + cos^2 = {}",
                power
            );
        }
    }
}
