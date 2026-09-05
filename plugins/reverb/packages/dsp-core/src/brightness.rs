/// Brightness — HF damping filter inside the FDN feedback loop.
///
/// A one-pole low-pass filter whose cutoff is driven by the Brightness parameter.
/// At low Brightness values, high frequencies are damped more aggressively in the
/// feedback loop, causing them to decay faster — the standard algorithmic reverb
/// technique for "high-frequency damping."

use crate::SmoothedParam;

/// One-pole low-pass filter for HF damping.
#[derive(Debug, Clone)]
struct OnePole {
    coeff: f32,
    state: f32,
}

impl OnePole {
    fn new() -> Self {
        Self {
            coeff: 1.0, // fully open (no damping)
            state: 0.0,
        }
    }

    /// Set the cutoff coefficient.
    /// coeff=1.0 → no filtering (fully bright)
    /// coeff→0.0 → heavy low-pass (very dark)
    #[inline]
    fn set_coeff(&mut self, coeff: f32) {
        self.coeff = coeff.clamp(0.0, 1.0);
    }

    /// Process one sample through the one-pole LPF.
    /// y[n] = x[n] * coeff + y[n-1] * (1 - coeff)
    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        self.state = input * self.coeff + self.state * (1.0 - self.coeff);
        self.state
    }

    fn reset(&mut self) {
        self.state = 0.0;
    }
}

/// Brightness processor — wraps the one-pole damping filter.
pub struct Brightness {
    filter_l: OnePole,
    filter_r: OnePole,
    /// Brightness parameter (0.0 = very dark, 1.0 = fully bright)
    brightness: SmoothedParam,
    sample_rate: f32,
}

impl Brightness {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            filter_l: OnePole::new(),
            filter_r: OnePole::new(),
            brightness: SmoothedParam::new(0.7, 0.02, sample_rate),
            sample_rate,
        }
    }

    /// Set the Brightness parameter (0.0–1.0).
    /// 0.0 = very dark (heavy HF damping in feedback)
    /// 1.0 = fully bright (no damping)
    pub fn set_brightness(&mut self, value: f32) {
        self.brightness.set_target(value.clamp(0.0, 1.0));
    }

    /// Process a stereo sample pair (inside the FDN feedback loop).
    #[inline]
    pub fn process_sample(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let b = self.brightness.next();

        // Map brightness to one-pole coefficient.
        // brightness=1.0 → coeff≈1.0 (pass everything)
        // brightness=0.0 → coeff≈0.05 (heavy low-pass, ~350Hz cutoff at 44.1kHz)
        // Use an exponential mapping for a more natural feel
        let coeff = 0.05 + 0.95 * b * b; // quadratic curve, more resolution at dark end

        self.filter_l.set_coeff(coeff);
        self.filter_r.set_coeff(coeff);

        let out_l = self.filter_l.process(input_l);
        let out_r = self.filter_r.process(input_r);

        (out_l, out_r)
    }

    pub fn reset(&mut self) {
        self.filter_l.reset();
        self.filter_r.reset();
    }

    pub fn snap_params(&mut self) {
        self.brightness.snap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_brightness_full_passes_through() {
        let sr = 44100.0;
        let mut br = Brightness::new(sr);
        br.set_brightness(1.0);
        br.snap_params();

        // High-frequency content should pass through with brightness=1.0
        let mut energy = 0.0f32;
        for i in 0..4410 {
            let input = (i as f32 * 2.0 * std::f32::consts::PI * 8000.0 / sr).sin();
            let (l, _) = br.process_sample(input, input);
            energy += l * l;
        }
        assert!(energy > 100.0, "Full brightness should pass HF content");
    }

    #[test]
    fn test_brightness_dark_attenuates_hf() {
        let sr = 44100.0;

        // Measure HF energy at full brightness
        let mut br_bright = Brightness::new(sr);
        br_bright.set_brightness(1.0);
        br_bright.snap_params();

        let mut energy_bright = 0.0f32;
        for i in 0..4410 {
            let input = (i as f32 * 2.0 * std::f32::consts::PI * 8000.0 / sr).sin();
            let (l, _) = br_bright.process_sample(input, input);
            if i > 100 { energy_bright += l * l; } // skip transient
        }

        // Measure HF energy at dark brightness
        let mut br_dark = Brightness::new(sr);
        br_dark.set_brightness(0.0);
        br_dark.snap_params();

        let mut energy_dark = 0.0f32;
        for i in 0..4410 {
            let input = (i as f32 * 2.0 * std::f32::consts::PI * 8000.0 / sr).sin();
            let (l, _) = br_dark.process_sample(input, input);
            if i > 100 { energy_dark += l * l; }
        }

        assert!(
            energy_dark < energy_bright * 0.5,
            "Dark brightness should significantly attenuate HF: bright={:.2}, dark={:.2}",
            energy_bright, energy_dark
        );
    }
}
