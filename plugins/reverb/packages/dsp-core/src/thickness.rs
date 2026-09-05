/// Thickness — soft saturation + light compression on the wet reverb signal.
///
/// Adds density to the reverb tail:
/// - tanh-based waveshaper for soft saturation (adds harmonics)
/// - Simple compressor for level control and density

use crate::SmoothedParam;

/// Simple envelope follower for the compressor.
#[derive(Debug, Clone)]
struct EnvelopeFollower {
    level: f32,
    attack_coeff: f32,
    release_coeff: f32,
}

impl EnvelopeFollower {
    fn new(attack_ms: f32, release_ms: f32, sample_rate: f32) -> Self {
        Self {
            level: 0.0,
            attack_coeff: (-1.0 / (attack_ms * 0.001 * sample_rate)).exp(),
            release_coeff: (-1.0 / (release_ms * 0.001 * sample_rate)).exp(),
        }
    }

    #[inline]
    fn process(&mut self, input_abs: f32) -> f32 {
        let coeff = if input_abs > self.level {
            self.attack_coeff
        } else {
            self.release_coeff
        };
        self.level = input_abs + coeff * (self.level - input_abs);
        self.level
    }

    fn reset(&mut self) {
        self.level = 0.0;
    }
}

/// Simple gain computer for soft-knee compression.
#[derive(Debug, Clone)]
struct GainComputer {
    threshold_linear: f32,
    ratio: f32,
    knee_width: f32,
}

impl GainComputer {
    fn new(threshold_db: f32, ratio: f32, knee_db: f32) -> Self {
        Self {
            threshold_linear: 10.0f32.powf(threshold_db / 20.0),
            ratio,
            knee_width: 10.0f32.powf(knee_db / 20.0),
        }
    }

    /// Compute the gain reduction for a given envelope level.
    #[inline]
    fn compute(&self, level: f32) -> f32 {
        if level <= 0.0001 {
            return 1.0;
        }
        if level > self.threshold_linear {
            let over = level / self.threshold_linear;
            let compressed = self.threshold_linear * over.powf(1.0 / self.ratio);
            compressed / level
        } else {
            1.0
        }
    }
}

/// Thickness processor.
pub struct Thickness {
    /// Thickness parameter (0.0 = clean, 1.0 = maximum saturation + compression)
    thickness: SmoothedParam,
    /// Envelope followers for L/R
    env_l: EnvelopeFollower,
    env_r: EnvelopeFollower,
    /// Gain computer
    gain_computer: GainComputer,
    sample_rate: f32,
}

impl Thickness {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            thickness: SmoothedParam::new(0.0, 0.02, sample_rate),
            env_l: EnvelopeFollower::new(5.0, 50.0, sample_rate),
            env_r: EnvelopeFollower::new(5.0, 50.0, sample_rate),
            gain_computer: GainComputer::new(-18.0, 4.0, 6.0),
            sample_rate,
        }
    }

    /// Set the Thickness parameter (0.0–1.0).
    pub fn set_thickness(&mut self, value: f32) {
        self.thickness.set_target(value.clamp(0.0, 1.0));
    }

    /// Process a stereo sample pair (applied to wet signal).
    #[inline]
    pub fn process_sample(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let t = self.thickness.next();

        if t < 0.001 {
            return (input_l, input_r);
        }

        // --- Soft saturation (tanh waveshaper) ---
        // Drive increases with thickness
        let drive = 1.0 + t * 4.0; // 1x–5x drive
        let sat_l = (input_l * drive).tanh() / drive.tanh(); // Normalize to preserve level
        let sat_r = (input_r * drive).tanh() / drive.tanh();

        // Blend between clean and saturated based on thickness
        let mixed_l = input_l + t * (sat_l - input_l);
        let mixed_r = input_r + t * (sat_r - input_r);

        // --- Light compression ---
        let comp_amount = t * 0.7; // Don't go full compression even at max thickness
        if comp_amount > 0.01 {
            let env_l = self.env_l.process(mixed_l.abs());
            let env_r = self.env_r.process(mixed_r.abs());

            let gr_l = self.gain_computer.compute(env_l);
            let gr_r = self.gain_computer.compute(env_r);

            // Blend compression amount
            let final_gr_l = 1.0 + comp_amount * (gr_l - 1.0);
            let final_gr_r = 1.0 + comp_amount * (gr_r - 1.0);

            (mixed_l * final_gr_l, mixed_r * final_gr_r)
        } else {
            (mixed_l, mixed_r)
        }
    }

    /// Get the current gain reduction in dB (for metering).
    pub fn gain_reduction_db(&self) -> f32 {
        // Approximate from the last envelope values
        let level = (self.env_l.level + self.env_r.level) * 0.5;
        let gr = self.gain_computer.compute(level);
        if gr > 0.0 {
            20.0 * gr.log10()
        } else {
            -60.0
        }
    }

    pub fn reset(&mut self) {
        self.env_l.reset();
        self.env_r.reset();
    }

    pub fn snap_params(&mut self) {
        self.thickness.snap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thickness_zero_passthrough() {
        let sr = 44100.0;
        let mut th = Thickness::new(sr);
        th.set_thickness(0.0);
        th.snap_params();

        for i in 0..100 {
            let input = (i as f32 * 0.1).sin() * 0.5;
            let (l, r) = th.process_sample(input, input);
            assert!(
                (l - input).abs() < 1e-5,
                "Thickness=0 should passthrough, diff={}",
                (l - input).abs()
            );
        }
    }

    #[test]
    fn test_thickness_adds_harmonics() {
        let sr = 44100.0;

        // Measure output with thickness=0 (clean)
        let mut th_clean = Thickness::new(sr);
        th_clean.set_thickness(0.0);
        th_clean.snap_params();

        let freq = 440.0;
        let mut clean_output = Vec::new();
        for i in 0..4410 {
            let input = (i as f32 * 2.0 * std::f32::consts::PI * freq / sr).sin() * 0.8;
            let (l, _) = th_clean.process_sample(input, input);
            clean_output.push(l);
        }

        // Measure output with thickness=1.0 (saturated)
        let mut th_sat = Thickness::new(sr);
        th_sat.set_thickness(1.0);
        th_sat.snap_params();

        let mut sat_output = Vec::new();
        for i in 0..4410 {
            let input = (i as f32 * 2.0 * std::f32::consts::PI * freq / sr).sin() * 0.8;
            let (l, _) = th_sat.process_sample(input, input);
            sat_output.push(l);
        }

        // Saturated output should differ from clean (harmonics added)
        let diff: f32 = clean_output.iter().zip(sat_output.iter())
            .map(|(c, s)| (c - s).abs())
            .sum::<f32>() / clean_output.len() as f32;

        assert!(
            diff > 0.01,
            "Thickness should add measurable harmonics, avg diff={}",
            diff
        );
    }
}
