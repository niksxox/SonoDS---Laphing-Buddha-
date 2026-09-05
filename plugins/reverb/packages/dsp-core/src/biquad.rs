/// Biquad filter implementation — Low Shelf, High Shelf, Bell (Peaking), and Notch.
///
/// Uses standard Audio EQ Cookbook formulas (Robert Bristow-Johnson).
/// This is the shared filter math reused by both the Decay Rate EQ (Task 1.5)
/// and the Post EQ (Task 1.11).

use std::f32::consts::PI;

/// Filter type enumeration.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FilterType {
    Bell,
    LowShelf,
    HighShelf,
    Notch,
}

/// Biquad filter coefficients.
#[derive(Debug, Clone, Copy)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl BiquadCoeffs {
    /// Compute biquad coefficients for the given filter type.
    ///
    /// - `filter_type`: The type of filter
    /// - `freq_hz`: Center/corner frequency in Hz
    /// - `q`: Q factor (bandwidth for Bell/Notch, slope for shelves)
    /// - `gain_db`: Gain in dB (only used for Bell and Shelf types)
    /// - `sample_rate`: Sample rate in Hz
    pub fn compute(
        filter_type: FilterType,
        freq_hz: f32,
        q: f32,
        gain_db: f32,
        sample_rate: f32,
    ) -> Self {
        let w0 = 2.0 * PI * freq_hz / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        let a = 10.0f32.powf(gain_db / 40.0); // sqrt of linear gain

        let (b0, b1, b2, a0, a1, a2) = match filter_type {
            FilterType::Bell => {
                let b0 = 1.0 + alpha * a;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0 - alpha * a;
                let a0 = 1.0 + alpha / a;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha / a;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::LowShelf => {
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
                let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
                let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::HighShelf => {
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
                let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
                let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Notch => {
                let b0 = 1.0;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
        };

        // Normalize by a0
        let inv_a0 = 1.0 / a0;
        Self {
            b0: b0 * inv_a0,
            b1: b1 * inv_a0,
            b2: b2 * inv_a0,
            a1: a1 * inv_a0,
            a2: a2 * inv_a0,
        }
    }

    /// Unity (passthrough) coefficients.
    pub fn unity() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }

    /// Compute the magnitude response at a given frequency (in Hz).
    /// Returns the magnitude (linear scale, not dB).
    /// Used for curve display in the UI.
    pub fn magnitude_at(&self, freq_hz: f32, sample_rate: f32) -> f32 {
        let w = 2.0 * PI * freq_hz / sample_rate;
        let cos_w = w.cos();
        let cos_2w = (2.0 * w).cos();

        let num = self.b0 * self.b0 + self.b1 * self.b1 + self.b2 * self.b2
            + 2.0 * (self.b0 * self.b1 + self.b1 * self.b2) * cos_w
            + 2.0 * self.b0 * self.b2 * cos_2w;

        let den = 1.0 + self.a1 * self.a1 + self.a2 * self.a2
            + 2.0 * (self.a1 + self.a1 * self.a2) * cos_w
            + 2.0 * self.a2 * cos_2w;

        if den > 0.0 {
            (num / den).sqrt()
        } else {
            1.0
        }
    }
}

/// A single biquad filter with state (Direct Form II Transposed).
#[derive(Debug, Clone)]
pub struct Biquad {
    coeffs: BiquadCoeffs,
    z1: f32,
    z2: f32,
}

impl Biquad {
    pub fn new() -> Self {
        Self {
            coeffs: BiquadCoeffs::unity(),
            z1: 0.0,
            z2: 0.0,
        }
    }

    /// Update the filter coefficients. Does NOT reset state (avoids clicks).
    pub fn set_coeffs(&mut self, coeffs: BiquadCoeffs) {
        self.coeffs = coeffs;
    }

    /// Reconfigure the filter by computing new coefficients from parameters.
    pub fn configure(
        &mut self,
        filter_type: FilterType,
        freq_hz: f32,
        gain_db: f32,
        q: f32,
        sample_rate: f32,
    ) {
        let coeffs = BiquadCoeffs::compute(filter_type, freq_hz, q, gain_db, sample_rate);
        self.set_coeffs(coeffs);
    }

    /// Compute magnitude response at given frequency.
    pub fn magnitude_at(&self, freq_hz: f32, sample_rate: f32) -> f32 {
        self.coeffs.magnitude_at(freq_hz, sample_rate)
    }

    /// Get current coefficients.
    pub fn coeffs(&self) -> &BiquadCoeffs {
        &self.coeffs
    }

    /// Process a single sample (Direct Form II Transposed).
    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        let output = self.coeffs.b0 * input + self.z1;
        self.z1 = self.coeffs.b1 * input - self.coeffs.a1 * output + self.z2;
        self.z2 = self.coeffs.b2 * input - self.coeffs.a2 * output;
        output
    }

    /// Reset filter state to zero.
    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unity_passthrough() {
        let mut bq = Biquad::new();
        // Unity coefficients should pass signal through unchanged
        for i in 0..100 {
            let input = (i as f32 * 0.1).sin();
            let output = bq.process(input);
            assert!(
                (output - input).abs() < 1e-6,
                "Unity biquad should be passthrough"
            );
        }
    }

    #[test]
    fn test_bell_filter_boosts_center() {
        let sr = 44100.0;
        let coeffs = BiquadCoeffs::compute(FilterType::Bell, 1000.0, 1.0, 12.0, sr);

        // Magnitude at center frequency should be boosted
        let mag_center = coeffs.magnitude_at(1000.0, sr);
        let mag_far = coeffs.magnitude_at(100.0, sr);

        assert!(
            mag_center > mag_far,
            "Bell filter should boost at center: center={:.2}, far={:.2}",
            mag_center, mag_far
        );

        // 12dB boost → magnitude ≈ 4.0
        let expected = 10.0f32.powf(12.0 / 20.0); // ~3.98
        assert!(
            (mag_center - expected).abs() < 0.5,
            "Expected magnitude ~{:.2}, got {:.2}",
            expected, mag_center
        );
    }

    #[test]
    fn test_low_shelf_boosts_lows() {
        let sr = 44100.0;
        let coeffs = BiquadCoeffs::compute(FilterType::LowShelf, 500.0, 0.707, 6.0, sr);

        let mag_low = coeffs.magnitude_at(50.0, sr);
        let mag_high = coeffs.magnitude_at(5000.0, sr);

        assert!(
            mag_low > mag_high,
            "Low shelf should boost lows: low={:.2}, high={:.2}",
            mag_low, mag_high
        );
    }

    #[test]
    fn test_high_shelf_boosts_highs() {
        let sr = 44100.0;
        let coeffs = BiquadCoeffs::compute(FilterType::HighShelf, 2000.0, 0.707, 6.0, sr);

        let mag_low = coeffs.magnitude_at(100.0, sr);
        let mag_high = coeffs.magnitude_at(10000.0, sr);

        assert!(
            mag_high > mag_low,
            "High shelf should boost highs: high={:.2}, low={:.2}",
            mag_high, mag_low
        );
    }

    #[test]
    fn test_notch_cuts_center() {
        let sr = 44100.0;
        let coeffs = BiquadCoeffs::compute(FilterType::Notch, 1000.0, 10.0, 0.0, sr);

        let mag_center = coeffs.magnitude_at(1000.0, sr);
        let mag_far = coeffs.magnitude_at(200.0, sr);

        assert!(
            mag_center < mag_far,
            "Notch should cut at center: center={:.4}, far={:.4}",
            mag_center, mag_far
        );
    }
}
