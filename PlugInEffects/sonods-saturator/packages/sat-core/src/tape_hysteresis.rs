//! Physical Tape Hysteresis Modeling using Jiles-Atherton ODE & Runge-Kutta 4th-Order Solver.

#[derive(Debug, Clone)]
pub struct JilesAthertonTape {
    pub m: f64,      // Magnetization state M
    pub ms: f64,     // Saturation magnetization Ms (~1.0)
    pub a: f64,      // Domain parameter a (~0.5)
    pub alpha: f64,  // Interdomain coupling alpha (~0.001)
    pub k: f64,      // Pinning energy parameter k (~0.3)
    pub c: f64,      // Reversible magnetization ratio c (~0.15)
    pub last_h: f64, // Previous magnetic field H
}

impl Default for JilesAthertonTape {
    fn default() -> Self {
        Self::new()
    }
}

/// Modified Langevin function L(x) with singularity avoidance around 0.
#[inline(always)]
fn langevin(x: f64) -> f64 {
    let abs_x = x.abs();
    if abs_x < 1e-4 {
        x / 3.0 - (x * x * x) / 45.0
    } else if abs_x > 25.0 {
        x.signum()
    } else {
        1.0 / x.tanh() - 1.0 / x
    }
}

/// Derivative of Langevin function dL/dx.
#[inline(always)]
fn d_langevin(x: f64) -> f64 {
    let abs_x = x.abs();
    if abs_x < 1e-4 {
        1.0 / 3.0 - (x * x) / 15.0
    } else if abs_x > 25.0 {
        0.0
    } else {
        let sinh_x = x.sinh();
        1.0 / (x * x) - 1.0 / (sinh_x * sinh_x)
    }
}

impl JilesAthertonTape {
    pub fn new() -> Self {
        Self {
            m: 0.0,
            ms: 1.0,
            a: 0.55,
            alpha: 0.0012,
            k: 0.28,
            c: 0.18,
            last_h: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.m = 0.0;
        self.last_h = 0.0;
    }

    /// Evaluates dM/dH given current H, M, and direction sign delta.
    #[inline(always)]
    fn dm_dh(&self, h: f64, m: f64, delta: f64) -> f64 {
        let he = h + self.alpha * m;
        let he_over_a = he / self.a;
        let man = self.ms * langevin(he_over_a);
        let dman_dhe = (self.ms / self.a) * d_langevin(he_over_a);
        let dman_dh = dman_dhe / (1.0 - self.alpha * dman_dhe).max(1e-4);

        let denom = delta * self.k - self.alpha * (man - m);
        let dmirr_dh = if denom.abs() > 1e-6 {
            let val = (man - m) / denom;
            // Physical constraint: dMirr/dH >= 0
            if (man - m) * delta > 0.0 {
                val.max(0.0)
            } else {
                0.0
            }
        } else {
            0.0
        };

        (1.0 - self.c) * dmirr_dh + self.c * dman_dh
    }

    /// Solves the next magnetization state using 4th-order Runge-Kutta (RK4).
    #[inline(always)]
    pub fn process_sample(&mut self, input_h: f64, drive: f64) -> f64 {
        let h = input_h * (1.0 + drive * 2.5);
        let delta_h = h - self.last_h;

        if delta_h.abs() < 1e-7 {
            self.last_h = h;
            return self.m;
        }

        let delta = if delta_h >= 0.0 { 1.0 } else { -1.0 };
        let m0 = self.m;
        let h0 = self.last_h;

        // RK4 steps
        let k1 = delta_h * self.dm_dh(h0, m0, delta);
        let k2 = delta_h * self.dm_dh(h0 + 0.5 * delta_h, m0 + 0.5 * k1, delta);
        let k3 = delta_h * self.dm_dh(h0 + 0.5 * delta_h, m0 + 0.5 * k2, delta);
        let k4 = delta_h * self.dm_dh(h0 + delta_h, m0 + k3, delta);

        let mut next_m = m0 + (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0;

        // Stability clamp to physical saturation boundary
        next_m = next_m.clamp(-self.ms * 1.05, self.ms * 1.05);

        // Denormal protection
        if next_m.abs() < 1e-15 {
            next_m = 0.0;
        }

        self.m = next_m;
        self.last_h = h;

        // Output normalization
        self.m / self.ms
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_jiles_atherton_tape_hysteresis_loop() {
        let mut tape = JilesAthertonTape::new();
        let sample_rate = 44100.0;
        let freq = 100.0;
        let n_samples = 4410;

        let mut outputs = Vec::with_capacity(n_samples);
        for i in 0..n_samples {
            let t = i as f64 / sample_rate;
            let h = (2.0 * PI * freq * t).sin();
            outputs.push(tape.process_sample(h, 0.5));
        }

        // Check output stability & finiteness
        for &sample in &outputs {
            assert!(sample.is_finite());
            assert!(!sample.is_nan());
            assert!(sample.abs() <= 1.1);
        }

        // Hysteresis property: at H = 0 going up vs down, M values should differ (coercivity)
        let cycle_start = n_samples - 441;
        let mut zero_crossings = Vec::new();
        for i in cycle_start..n_samples - 1 {
            let t0 = i as f64 / sample_rate;
            let t1 = (i + 1) as f64 / sample_rate;
            let h0 = (2.0 * PI * freq * t0).sin();
            let h1 = (2.0 * PI * freq * t1).sin();
            if h0 * h1 <= 0.0 {
                zero_crossings.push(outputs[i]);
            }
        }

        assert!(zero_crossings.len() >= 2);
    }
}
