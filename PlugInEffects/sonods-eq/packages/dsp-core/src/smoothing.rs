pub const GAIN_SMOOTHING_MS: f64 = 15.0;
pub const FREQ_SMOOTHING_MS: f64 = 20.0;
pub const Q_SMOOTHING_MS: f64 = 20.0;
pub const BYPASS_FADE_MS: f64 = 5.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SmoothedParam {
    pub current: f64,
    pub target: f64,
    pub coeff: f64,
}

impl SmoothedParam {
    pub fn new(initial_value: f64, time_constant_ms: f64, sample_rate: f64) -> Self {
        let time_sec = (time_constant_ms / 1000.0).max(1e-6);
        let coeff = (-1.0 / (time_sec * sample_rate)).exp();
        Self {
            current: initial_value,
            target: initial_value,
            coeff,
        }
    }

    pub fn update_sample_rate(&mut self, time_constant_ms: f64, sample_rate: f64) {
        let time_sec = (time_constant_ms / 1000.0).max(1e-6);
        self.coeff = (-1.0 / (time_sec * sample_rate)).exp();
    }

    pub fn set_target(&mut self, target: f64) {
        self.target = target;
    }

    pub fn snap_to(&mut self, value: f64) {
        self.current = value;
        self.target = value;
    }

    #[inline(always)]
    pub fn tick(&mut self) -> f64 {
        if (self.current - self.target).abs() < 1e-9 {
            self.current = self.target;
        } else {
            self.current = self.target + (self.current - self.target) * self.coeff;
        }
        self.current
    }

    pub fn is_smoothing(&self) -> bool {
        (self.current - self.target).abs() > 1e-9
    }
}

/// Linear ramp for click-free bypass transitions (0.0 <-> 1.0)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LinearRamp {
    pub current: f64,
    pub target: f64,
    pub step: f64,
}

impl LinearRamp {
    pub fn new(initial_value: f64, time_ms: f64, sample_rate: f64) -> Self {
        let total_samples = (time_ms / 1000.0 * sample_rate).max(1.0);
        let step = 1.0 / total_samples;
        Self {
            current: initial_value,
            target: initial_value,
            step,
        }
    }

    pub fn set_target(&mut self, target: f64) {
        self.target = target;
    }

    pub fn snap_to(&mut self, value: f64) {
        self.current = value;
        self.target = value;
    }

    #[inline(always)]
    pub fn tick(&mut self) -> f64 {
        if (self.current - self.target).abs() <= self.step {
            self.current = self.target;
        } else if self.current < self.target {
            self.current += self.step;
        } else {
            self.current -= self.step;
        }
        self.current
    }

    pub fn is_smoothing(&self) -> bool {
        (self.current - self.target).abs() > 1e-9
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoothed_param_approaches_target_monotonically() {
        let sample_rate = 48000.0;
        let mut param = SmoothedParam::new(0.0, GAIN_SMOOTHING_MS, sample_rate);
        param.set_target(6.0);

        let mut prev = 0.0;
        for _ in 0..20000 {
            let val = param.tick();
            assert!(val >= prev - 1e-12, "Smoothing should be monotonic");
            assert!(val <= 6.0 + 1e-9, "Smoothing should never overshoot");
            prev = val;
        }

        assert!(
            (param.current - 6.0).abs() < 1e-4,
            "Param should converge to target"
        );
    }

    #[test]
    fn linear_ramp_converges_exactly() {
        let sample_rate = 48000.0;
        let mut ramp = LinearRamp::new(1.0, BYPASS_FADE_MS, sample_rate);
        ramp.set_target(0.0);

        let samples = (BYPASS_FADE_MS / 1000.0 * sample_rate) as usize + 10;
        for _ in 0..samples {
            ramp.tick();
        }

        assert_eq!(ramp.current, 0.0);
    }
}
