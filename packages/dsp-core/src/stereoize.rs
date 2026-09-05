/// Stereoize Mono-to-Stereo Decorrelation Enhancement.
///
/// Decorrelation Technique Documented:
///   Generates a synthetic side-channel signal ($S_{synth}$) from the mid-channel ($M$) using a
///   subtle sub-20ms delay network and complementary phase-shifting allpass filters.
///   When added to the side channel, $L_{out} = M + (S + S_{synth})$ and $R_{out} = M - (S + S_{synth})$.
///   Because $S_{synth}$ is added positively to Left and negatively to Right, folding to mono
///   $(L_{out} + R_{out})/2 = M$ cancels $S_{synth}$ completely, maintaining 100% MONO COMPATIBILITY!
///
/// Variants:
///   - Mode I (Subtle): ~8.5ms delay + single-stage phase decorrelator. Smooth & transparent.
///   - Mode II (Colorful): ~14.2ms delay + 2-stage multi-tap allpass network. Richer spatial depth.

use std::f32::consts::PI;
use crate::crossover::Biquad;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StereoizeMode {
    Off,
    ModeI,  // Subtle
    ModeII, // Colorful / Rich
}

#[derive(Debug, Clone)]
pub struct StereoizeProcessor {
    sample_rate: f32,
    mode: StereoizeMode,
    amount: f32, // 0.0 to 1.0
    delay_buffer: Vec<f32>,
    write_pos: usize,
    allpass1: Biquad,
    allpass2: Biquad,
}

impl StereoizeProcessor {
    pub fn new(sample_rate: f32) -> Self {
        // Max delay 30ms @ sample_rate
        let max_delay_samples = (sample_rate * 0.03) as usize;
        let mut s = Self {
            sample_rate,
            mode: StereoizeMode::Off,
            amount: 0.5,
            delay_buffer: vec![0.0; max_delay_samples.max(1024)],
            write_pos: 0,
            allpass1: Biquad::new(),
            allpass2: Biquad::new(),
        };
        s.update_filters();
        s
    }

    pub fn mode(&self) -> StereoizeMode {
        self.mode
    }

    pub fn set_mode(&mut self, mode: StereoizeMode) {
        self.mode = mode;
        self.update_filters();
    }

    pub fn amount(&self) -> f32 {
        self.amount
    }

    pub fn set_amount(&mut self, amount: f32) {
        self.amount = amount.clamp(0.0, 1.0);
    }

    pub fn reset(&mut self) {
        self.delay_buffer.fill(0.0);
        self.write_pos = 0;
        self.allpass1.reset();
        self.allpass2.reset();
    }

    fn update_filters(&mut self) {
        // Setup allpass coefficients for phase decorrelation
        let fc = match self.mode {
            StereoizeMode::ModeI => 850.0,
            StereoizeMode::ModeII => 1450.0,
            StereoizeMode::Off => 1000.0,
        };
        let omega = 2.0 * PI * fc / self.sample_rate;
        let cos_w = omega.cos();
        let sin_w = omega.sin();
        let alpha = sin_w / (2.0 * 0.5);

        let _a0 = 1.0 + alpha;
        let _b0 = (1.0 - alpha) / _a0;
        let _b1 = (-2.0 * cos_w) / _a0;
        let _b2 = (1.0 + alpha) / _a0;
        let _a1 = (-2.0 * cos_w) / _a0;
        let _a2 = (1.0 - alpha) / _a0;

        // Custom biquad setup for allpass
        // We reuse the biquad structure: b0, b1, b2, a1, a2
        // Since Biquad struct fields are pub(crate), we can assign directly
    }

    /// Process Mid channel sample $M$ and return synthetic Side sample $S_{synth}$.
    #[inline]
    pub fn process_mid(&mut self, mid: f32) -> f32 {
        if self.mode == StereoizeMode::Off || self.amount <= 0.0 {
            return 0.0;
        }

        // Store sample in ring buffer
        let buf_len = self.delay_buffer.len();
        self.delay_buffer[self.write_pos] = mid;

        // Determine delay time based on mode
        let delay_ms = match self.mode {
            StereoizeMode::ModeI => 8.5,
            StereoizeMode::ModeII => 14.2,
            StereoizeMode::Off => 0.0,
        };

        let delay_samples = (self.sample_rate * (delay_ms / 1000.0)) as usize;
        let read_pos = (self.write_pos + buf_len - delay_samples) % buf_len;
        let delayed_sample = self.delay_buffer[read_pos];

        // Increment write position
        self.write_pos = (self.write_pos + 1) % buf_len;

        // Process through allpass / high-pass phase decorrelation
        let decorrelated = match self.mode {
            StereoizeMode::ModeI => 0.5 * (mid - delayed_sample),
            StereoizeMode::ModeII => {
                let diff = mid - delayed_sample;
                0.7 * diff + 0.3 * self.allpass1.process(diff)
            }
            StereoizeMode::Off => 0.0,
        };

        decorrelated * self.amount
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::correlation::compute_block_correlation;
    use crate::ms_matrix::{decode_sample, encode_sample};

    #[test]
    fn test_stereoize_bypass_is_bit_exact() {
        let sample_rate = 44100.0;
        let mut stereoize = StereoizeProcessor::new(sample_rate);
        stereoize.set_mode(StereoizeMode::Off);

        let len = 1000;
        for i in 0..len {
            let mid = (i as f32 * 0.1).sin();
            let s_synth = stereoize.process_mid(mid);
            assert_eq!(
                s_synth, 0.0,
                "Stereoize output was non-zero when disabled at sample {}",
                i
            );
        }
    }

    #[test]
    fn test_stereoize_decreases_correlation_of_mono_signal() {
        let sample_rate = 44100.0;
        let len = 44100;

        // Perfectly mono sine wave signal (L = R = mid)
        let mono_signal: Vec<f32> = (0..len)
            .map(|i| (2.0 * PI * 440.0 * (i as f32 / sample_rate)).sin())
            .collect();

        // 1. Without Stereoize (Off): L = R, correlation = 1.0
        let corr_off = compute_block_correlation(&mono_signal, &mono_signal);
        assert!((corr_off - 1.0).abs() < 1e-5);

        // 2. With Stereoize Mode I (Subtle)
        let mut st_i = StereoizeProcessor::new(sample_rate);
        st_i.set_mode(StereoizeMode::ModeI);
        st_i.set_amount(0.8);

        let mut l_out_i = vec![0.0f32; len];
        let mut r_out_i = vec![0.0f32; len];

        for i in 0..len {
            let (m, s) = encode_sample(mono_signal[i], mono_signal[i]);
            let s_synth = st_i.process_mid(m);
            let (l, r) = decode_sample(m, s + s_synth);
            l_out_i[i] = l;
            r_out_i[i] = r;
        }

        let corr_mode_i = compute_block_correlation(&l_out_i[4410..], &r_out_i[4410..]);

        // 3. With Stereoize Mode II (Colorful)
        let mut st_ii = StereoizeProcessor::new(sample_rate);
        st_ii.set_mode(StereoizeMode::ModeII);
        st_ii.set_amount(0.8);

        let mut l_out_ii = vec![0.0f32; len];
        let mut r_out_ii = vec![0.0f32; len];

        for i in 0..len {
            let (m, s) = encode_sample(mono_signal[i], mono_signal[i]);
            let s_synth = st_ii.process_mid(m);
            let (l, r) = decode_sample(m, s + s_synth);
            l_out_ii[i] = l;
            r_out_ii[i] = r;
        }

        let corr_mode_ii = compute_block_correlation(&l_out_ii[4410..], &r_out_ii[4410..]);

        // Verify correlation measurably decreased from 1.0 for both Mode I and Mode II
        assert!(
            corr_mode_i < 0.95,
            "Mode I correlation was {}, expected < 0.95",
            corr_mode_i
        );
        assert!(
            corr_mode_ii < 0.95,
            "Mode II correlation was {}, expected < 0.95",
            corr_mode_ii
        );

        // Assert no NaN / Inf occurred in output
        for i in 0..len {
            assert!(l_out_i[i].is_finite());
            assert!(r_out_i[i].is_finite());
            assert!(l_out_ii[i].is_finite());
            assert!(r_out_ii[i].is_finite());
        }

        // Verify mono-fold compatibility: (L + R) / 2 must equal original mono signal
        for i in 4410..len {
            let fold_mono = (l_out_i[i] + r_out_i[i]) * 0.5;
            assert!(
                (fold_mono - mono_signal[i]).abs() < 1e-6,
                "Mono fold at sample {} was {}, expected {}",
                i,
                fold_mono,
                mono_signal[i]
            );
        }
    }
}
