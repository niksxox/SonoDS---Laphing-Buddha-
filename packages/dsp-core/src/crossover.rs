/// Multiband Linkwitz-Riley 4th Order (LR4) Crossover Filter Network.
///
/// Features up to 4 bands (1 to 3 crossover frequencies).
/// LR4 filters are formed by cascading two 2nd-order Butterworth filters (Q = 0.70710678).
/// All-pass phase compensation across tree stages guarantees perfect magnitude transparency
/// (|H(f)| == 1.0 across all frequencies) when bands are summed back together.

use std::f32::consts::PI;

/// Direct Form II Transposed Biquad Filter.
#[derive(Debug, Clone, Copy)]
pub struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    s1: f32,
    s2: f32,
}

impl Biquad {
    pub fn new() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            s1: 0.0,
            s2: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }

    pub fn setup_lowpass(&mut self, fc: f32, sample_rate: f32) {
        let fc = fc.clamp(10.0, sample_rate * 0.49);
        let omega = 2.0 * PI * fc / sample_rate;
        let cos_w = omega.cos();
        let sin_w = omega.sin();
        let alpha = sin_w / (2.0 * 0.70710678); // Q = 1/sqrt(2) for Butterworth

        let a0 = 1.0 + alpha;
        self.b0 = ((1.0 - cos_w) / 2.0) / a0;
        self.b1 = (1.0 - cos_w) / a0;
        self.b2 = ((1.0 - cos_w) / 2.0) / a0;
        self.a1 = (-2.0 * cos_w) / a0;
        self.a2 = (1.0 - alpha) / a0;
    }

    pub fn setup_highpass(&mut self, fc: f32, sample_rate: f32) {
        let fc = fc.clamp(10.0, sample_rate * 0.49);
        let omega = 2.0 * PI * fc / sample_rate;
        let cos_w = omega.cos();
        let sin_w = omega.sin();
        let alpha = sin_w / (2.0 * 0.70710678); // Q = 1/sqrt(2) for Butterworth

        let a0 = 1.0 + alpha;
        self.b0 = ((1.0 + cos_w) / 2.0) / a0;
        self.b1 = (-(1.0 + cos_w)) / a0;
        self.b2 = ((1.0 + cos_w) / 2.0) / a0;
        self.a1 = (-2.0 * cos_w) / a0;
        self.a2 = (1.0 - alpha) / a0;
    }

    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        let out = self.b0 * input + self.s1;
        self.s1 = self.b1 * input - self.a1 * out + self.s2;
        self.s2 = self.b2 * input - self.a2 * out;
        out
    }
}

/// 4th Order Linkwitz-Riley Filter Pair (cascade of 2 Butterworth biquads).
#[derive(Debug, Clone, Copy)]
pub struct LR4Pair {
    lp1: Biquad,
    lp2: Biquad,
    hp1: Biquad,
    hp2: Biquad,
}

impl LR4Pair {
    pub fn new() -> Self {
        Self {
            lp1: Biquad::new(),
            lp2: Biquad::new(),
            hp1: Biquad::new(),
            hp2: Biquad::new(),
        }
    }

    pub fn reset(&mut self) {
        self.lp1.reset();
        self.lp2.reset();
        self.hp1.reset();
        self.hp2.reset();
    }

    pub fn set_cutoff(&mut self, fc: f32, sample_rate: f32) {
        self.lp1.setup_lowpass(fc, sample_rate);
        self.lp2.setup_lowpass(fc, sample_rate);
        self.hp1.setup_highpass(fc, sample_rate);
        self.hp2.setup_highpass(fc, sample_rate);
    }

    /// Process input sample returning (Low, High) outputs.
    #[inline]
    pub fn process(&mut self, input: f32) -> (f32, f32) {
        let low = self.lp2.process(self.lp1.process(input));
        let high = self.hp2.process(self.hp1.process(input));
        (low, high)
    }

    /// Process input sample returning Allpass response (Low + High).
    #[inline]
    pub fn process_allpass(&mut self, input: f32) -> f32 {
        let (low, high) = self.process(input);
        low + high
    }
}

/// Multiband Crossover Processor (up to 4 bands).
#[derive(Debug, Clone)]
pub struct MultibandCrossover {
    num_bands: usize,
    sample_rate: f32,
    crossovers: [f32; 3], // Cutoff frequencies (f1, f2, f3)
    lr4_stage1: LR4Pair,  // f1 crossover
    lr4_stage2: LR4Pair,  // f2 crossover
    lr4_stage3: LR4Pair,  // f3 crossover
    // All-pass phase compensation units for lower bands in tree
    ap_b0_stage2: LR4Pair,
    ap_b0_stage3: LR4Pair,
    ap_b1_stage3: LR4Pair,
}

impl MultibandCrossover {
    pub fn new(sample_rate: f32) -> Self {
        let mut s = Self {
            num_bands: 4,
            sample_rate,
            crossovers: [140.0, 1500.0, 6000.0],
            lr4_stage1: LR4Pair::new(),
            lr4_stage2: LR4Pair::new(),
            lr4_stage3: LR4Pair::new(),
            ap_b0_stage2: LR4Pair::new(),
            ap_b0_stage3: LR4Pair::new(),
            ap_b1_stage3: LR4Pair::new(),
        };
        s.update_filters();
        s
    }

    pub fn num_bands(&self) -> usize {
        self.num_bands
    }

    pub fn set_num_bands(&mut self, num_bands: usize) {
        self.num_bands = num_bands.clamp(1, 4);
        self.update_filters();
    }

    pub fn crossovers(&self) -> &[f32; 3] {
        &self.crossovers
    }

    pub fn set_crossovers(&mut self, f1: f32, f2: f32, f3: f32) {
        let f1_clean = f1.clamp(20.0, self.sample_rate * 0.45);
        let f2_clean = f2.clamp(f1_clean + 10.0, self.sample_rate * 0.46);
        let f3_clean = f3.clamp(f2_clean + 10.0, self.sample_rate * 0.48);

        self.crossovers = [f1_clean, f2_clean, f3_clean];
        self.update_filters();
    }

    pub fn reset(&mut self) {
        self.lr4_stage1.reset();
        self.lr4_stage2.reset();
        self.lr4_stage3.reset();
        self.ap_b0_stage2.reset();
        self.ap_b0_stage3.reset();
        self.ap_b1_stage3.reset();
    }

    fn update_filters(&mut self) {
        self.lr4_stage1.set_cutoff(self.crossovers[0], self.sample_rate);
        self.lr4_stage2.set_cutoff(self.crossovers[1], self.sample_rate);
        self.lr4_stage3.set_cutoff(self.crossovers[2], self.sample_rate);

        self.ap_b0_stage2.set_cutoff(self.crossovers[1], self.sample_rate);
        self.ap_b0_stage3.set_cutoff(self.crossovers[2], self.sample_rate);
        self.ap_b1_stage3.set_cutoff(self.crossovers[2], self.sample_rate);
    }

    /// Split a single sample into `self.num_bands` frequency bands.
    /// Returns slice filled up to `num_bands` elements.
    #[inline]
    pub fn process_sample(&mut self, input: f32, bands_out: &mut [f32; 4]) {
        match self.num_bands {
            1 => {
                bands_out[0] = input;
                bands_out[1] = 0.0;
                bands_out[2] = 0.0;
                bands_out[3] = 0.0;
            }
            2 => {
                let (b0, b1) = self.lr4_stage1.process(input);
                bands_out[0] = b0;
                bands_out[1] = b1;
                bands_out[2] = 0.0;
                bands_out[3] = 0.0;
            }
            3 => {
                let (b0_raw, rest) = self.lr4_stage1.process(input);
                let (b1, b2) = self.lr4_stage2.process(rest);
                // Phase compensate b0 with stage 2 all-pass
                let b0 = self.ap_b0_stage2.process_allpass(b0_raw);

                bands_out[0] = b0;
                bands_out[1] = b1;
                bands_out[2] = b2;
                bands_out[3] = 0.0;
            }
            _ => {
                // 4 bands
                let (b0_raw, rest1) = self.lr4_stage1.process(input);
                let (b1_raw, rest2) = self.lr4_stage2.process(rest1);
                let (b2, b3) = self.lr4_stage3.process(rest2);

                // Phase compensate lower bands through higher stages' all-pass filters
                let b1 = self.ap_b1_stage3.process_allpass(b1_raw);
                let b0_tmp = self.ap_b0_stage2.process_allpass(b0_raw);
                let b0 = self.ap_b0_stage3.process_allpass(b0_tmp);

                bands_out[0] = b0;
                bands_out[1] = b1;
                bands_out[2] = b2;
                bands_out[3] = b3;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crossover_transparent_reconstruction() {
        let sample_rate = 44100.0;
        let mut crossover = MultibandCrossover::new(sample_rate);
        crossover.set_num_bands(4);
        crossover.set_crossovers(140.0, 1500.0, 6000.0);

        // Test steady-state amplitude magnitude response across logarithmic sweep of frequencies
        let test_freqs = [
            30.0, 70.0, 140.0, 300.0, 800.0, 1500.0, 3000.0, 6000.0, 10000.0, 16000.0,
        ];

        for &freq in &test_freqs {
            crossover.reset();
            let duration_sec = 0.25;
            let total_samples = (sample_rate * duration_sec) as usize;
            let mut max_output_amp = 0.0f32;

            let settling_samples = 4410; // First ~100ms settling
            let mut bands = [0.0f32; 4];

            for i in 0..total_samples {
                let t = i as f32 / sample_rate;
                let input = (2.0 * PI * freq * t).sin();

                crossover.process_sample(input, &mut bands);
                let sum: f32 = bands[0] + bands[1] + bands[2] + bands[3];

                if i >= settling_samples {
                    if sum.abs() > max_output_amp {
                        max_output_amp = sum.abs();
                    }
                }
            }

            // Phase-compensated LR4 tree crossover magnitude response is 1.0 (unity gain) across all frequencies
            assert!(
                (max_output_amp - 1.0).abs() < 0.005,
                "Crossover magnitude response at {} Hz was {}, expected 1.0 ± 0.005",
                freq,
                max_output_amp
            );
        }
    }

    #[test]
    fn test_crossover_variable_band_counts() {
        let sample_rate = 48000.0;
        let mut crossover = MultibandCrossover::new(sample_rate);

        for num_bands in 1..=4 {
            crossover.set_num_bands(num_bands);
            crossover.reset();
            let mut bands = [0.0f32; 4];
            crossover.process_sample(1.0, &mut bands);

            let active_sum: f32 = bands[0..num_bands].iter().sum();
            let inactive_sum: f32 = bands[num_bands..4].iter().sum();

            assert!(
                inactive_sum == 0.0,
                "Inactive bands were non-zero for num_bands={}",
                num_bands
            );
            assert!(
                active_sum.abs() > 0.0,
                "Active bands sum was zero for num_bands={}",
                num_bands
            );
        }
    }
}
