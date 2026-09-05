#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BiquadCoeffs {
    pub b0: f64,
    pub b1: f64,
    pub b2: f64,
    pub a1: f64,
    pub a2: f64,
}

impl Default for BiquadCoeffs {
    fn default() -> Self {
        Self::identity()
    }
}

impl BiquadCoeffs {
    pub fn identity() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }

    pub fn from_raw(b0: f64, b1: f64, b2: f64, a0: f64, a1: f64, a2: f64) -> Self {
        let inv_a0 = 1.0 / a0;
        Self {
            b0: b0 * inv_a0,
            b1: b1 * inv_a0,
            b2: b2 * inv_a0,
            a1: a1 * inv_a0,
            a2: a2 * inv_a0,
        }
    }

    /// Analytic magnitude response in dB at a given frequency
    pub fn magnitude_db(&self, freq_hz: f64, sample_rate: f64) -> f64 {
        let w = 2.0 * std::f64::consts::PI * freq_hz / sample_rate;
        let cos_w = w.cos();
        let cos_2w = (2.0 * w).cos();
        let sin_w = w.sin();
        let sin_2w = (2.0 * w).sin();

        let num_re = self.b0 + self.b1 * cos_w + self.b2 * cos_2w;
        let num_im = -self.b1 * sin_w - self.b2 * sin_2w;
        let den_re = 1.0 + self.a1 * cos_w + self.a2 * cos_2w;
        let den_im = -self.a1 * sin_w - self.a2 * sin_2w;

        let num_mag_sq = num_re * num_re + num_im * num_im;
        let den_mag_sq = den_re * den_re + den_im * den_im;

        if den_mag_sq < 1e-30 {
            return 0.0;
        }

        10.0 * (num_mag_sq / den_mag_sq).log10()
    }

    /// Analytic phase response in radians at a given frequency
    pub fn phase_rad(&self, freq_hz: f64, sample_rate: f64) -> f64 {
        let w = 2.0 * std::f64::consts::PI * freq_hz / sample_rate;
        let cos_w = w.cos();
        let cos_2w = (2.0 * w).cos();
        let sin_w = w.sin();
        let sin_2w = (2.0 * w).sin();

        let num_re = self.b0 + self.b1 * cos_w + self.b2 * cos_2w;
        let num_im = -self.b1 * sin_w - self.b2 * sin_2w;
        let den_re = 1.0 + self.a1 * cos_w + self.a2 * cos_2w;
        let den_im = -self.a1 * sin_w - self.a2 * sin_2w;

        let num_phase = num_im.atan2(num_re);
        let den_phase = den_im.atan2(den_re);

        num_phase - den_phase
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Biquad {
    pub coeffs: BiquadCoeffs,
    pub z1: f64,
    pub z2: f64,
}

impl Default for Biquad {
    fn default() -> Self {
        Self::new(BiquadCoeffs::identity())
    }
}

impl Biquad {
    pub fn new(coeffs: BiquadCoeffs) -> Self {
        Self {
            coeffs,
            z1: 0.0,
            z2: 0.0,
        }
    }

    pub fn set_coeffs(&mut self, coeffs: BiquadCoeffs) {
        self.coeffs = coeffs;
    }

    pub fn reset_state(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }

    /// Direct Form II Transposed sample processing with denormal protection
    #[inline(always)]
    pub fn process_sample(&mut self, x: f64) -> f64 {
        let y = self.coeffs.b0 * x + self.z1;
        self.z1 = self.coeffs.b1 * x - self.coeffs.a1 * y + self.z2;
        self.z2 = self.coeffs.b2 * x - self.coeffs.a2 * y;

        // Denormal flushing
        if self.z1.abs() < 1e-15 {
            self.z1 = 0.0;
        }
        if self.z2.abs() < 1e-15 {
            self.z2 = 0.0;
        }

        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn biquad_compiles_and_runs() {
        let mut biquad = Biquad::new(BiquadCoeffs::identity());
        assert_eq!(biquad.process_sample(0.5), 0.5);
        assert_eq!(biquad.process_sample(-1.0), -1.0);
        assert_eq!(biquad.process_sample(0.0), 0.0);
        assert_eq!(biquad.process_sample(2.5), 2.5);
    }
}
