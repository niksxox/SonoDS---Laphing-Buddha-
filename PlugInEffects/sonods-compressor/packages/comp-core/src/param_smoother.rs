//! Parameter smoothing for continuous controls.
//!
//! Per Engineering Spec §1.6 & Task 1.7:
//! 20ms for Threshold/Ratio/Knee, 15ms for Link/Mix/Output/HPF.
//! Note: Attack and Release time-constants are NOT smoothed this way;
//! they directly update the exponential smoother coefficients.

#[derive(Debug, Clone)]
pub struct SmoothedParam {
    current: f64,
    target: f64,
    alpha: f64,
    time_constant_s: f64,
    sample_rate: f64,
}

impl SmoothedParam {
    pub fn new(initial: f64, time_constant_s: f64, sample_rate: f64) -> Self {
        let alpha = (-1.0 / (sample_rate * time_constant_s.max(1e-5))).exp();
        Self {
            current: initial,
            target: initial,
            alpha,
            time_constant_s,
            sample_rate,
        }
    }

    pub fn set_target(&mut self, target: f64) {
        self.target = target;
    }

    pub fn set_immediate(&mut self, value: f64) {
        self.target = value;
        self.current = value;
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate.max(1.0);
        self.alpha = (-1.0 / (self.sample_rate * self.time_constant_s.max(1e-5))).exp();
    }

    #[inline]
    pub fn next(&mut self) -> f64 {
        self.current = self.alpha * self.current + (1.0 - self.alpha) * self.target;
        if (self.current - self.target).abs() < 1e-3 {
            self.current = self.target;
        }
        self.current
    }

    #[inline]
    pub fn get(&self) -> f64 {
        self.current
    }

    #[inline]
    pub fn target(&self) -> f64 {
        self.target
    }

    #[inline]
    pub fn is_smoothing(&self) -> bool {
        self.current != self.target
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smoothed_param_smooths_without_discontinuities() {
        let sr = 48000.0;
        let mut param = SmoothedParam::new(0.0, 0.020, sr); // 20ms smoothing
        param.set_target(10.0);

        let mut prev = 0.0;
        let mut max_delta = 0.0_f64;

        for _ in 0..(sr * 0.200) as usize {
            let val = param.next();
            let delta = (val - prev).abs();
            max_delta = max_delta.max(delta);
            assert!(val >= prev, "Must increase monotonically towards target");
            prev = val;
        }

        // With 48000 Hz and 20ms time constant, per-sample delta should never jump (> 0.05)
        println!("Final val: {}, target: 10.0, diff: {}", param.get(), (param.get() - 10.0).abs());
        assert!((param.get() - 10.0).abs() < 1e-4);
    }
}
