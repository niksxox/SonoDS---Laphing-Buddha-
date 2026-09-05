/// Feedback Delay Network (FDN) core — N=8 parallel delay lines with Hadamard feedback matrix.
/// This is the heart of the SonoDS Reverb engine.
///
/// Architecture:
/// - 8 delay lines with independent, mutually-prime-ish lengths derived algorithmically
///   from a base room-size parameter
/// - Hadamard 8×8 orthogonal feedback matrix for maximal diffusion
/// - Global feedback gain controlling RT60 (overall decay time)
/// - Input is distributed across all delay lines; output is summed from a subset
///   for stereo (L from even-indexed lines, R from odd-indexed)

use crate::delay_line::DelayLine;
use crate::SmoothedParam;

/// Number of delay lines in the FDN.
pub const FDN_SIZE: usize = 8;

/// Maximum delay line length in samples (~370ms at 48kHz — enough for cathedral-sized rooms).
const MAX_DELAY_SAMPLES: usize = 18000;

/// Base prime-ish ratios for delay line lengths.
/// These are mutually coprime-ish multipliers applied to a base room size.
/// Chosen to avoid integer-ratio relationships that cause comb-filtering artifacts.
const DELAY_RATIOS: [f32; FDN_SIZE] = [
    1.000,
    1.1387,  // ~sqrt(1.3)
    1.3001,
    1.4731,  // ~sqrt(2.17)
    1.6597,
    1.8371,  // ~sqrt(3.37)
    2.0391,
    2.2417,  // ~sqrt(5.03)
];

/// Normalized Hadamard matrix for N=8.
/// H_8 / sqrt(8) — orthogonal, preserves energy, maximizes diffusion.
/// Each row/column has magnitude 1/sqrt(8) ≈ 0.35355.
const NORM: f32 = 0.35355339; // 1/sqrt(8)

const HADAMARD_8: [[f32; FDN_SIZE]; FDN_SIZE] = [
    [ NORM,  NORM,  NORM,  NORM,  NORM,  NORM,  NORM,  NORM],
    [ NORM, -NORM,  NORM, -NORM,  NORM, -NORM,  NORM, -NORM],
    [ NORM,  NORM, -NORM, -NORM,  NORM,  NORM, -NORM, -NORM],
    [ NORM, -NORM, -NORM,  NORM,  NORM, -NORM, -NORM,  NORM],
    [ NORM,  NORM,  NORM,  NORM, -NORM, -NORM, -NORM, -NORM],
    [ NORM, -NORM,  NORM, -NORM, -NORM,  NORM, -NORM,  NORM],
    [ NORM,  NORM, -NORM, -NORM, -NORM, -NORM,  NORM,  NORM],
    [ NORM, -NORM, -NORM,  NORM, -NORM,  NORM,  NORM, -NORM],
];

/// Compute delay line lengths from a base room size (in samples).
/// Applies the mutually-prime-ish ratios and clamps to MAX_DELAY_SAMPLES.
fn compute_delay_lengths(base_size_samples: f32) -> [usize; FDN_SIZE] {
    let mut lengths = [0usize; FDN_SIZE];
    for i in 0..FDN_SIZE {
        let raw = (base_size_samples * DELAY_RATIOS[i]) as usize;
        // Clamp to valid range: minimum 1 sample, maximum MAX_DELAY_SAMPLES - 1
        lengths[i] = raw.max(1).min(MAX_DELAY_SAMPLES - 1);
    }
    lengths
}

/// Convert RT60 (in seconds) and delay length to per-recirculation feedback gain.
/// RT60 is the time for signal energy to decay by 60dB.
/// g_i = 10^(-3 * L_i / (RT60 * sample_rate)) = exp(-6.907755 * L_i / (RT60 * sample_rate))
fn line_rt60_feedback_gain(rt60_secs: f32, delay_len_samples: f32, sample_rate: f32) -> f32 {
    if rt60_secs <= 0.0 {
        return 0.0;
    }
    let n = rt60_secs * sample_rate;
    (-6.907755 * delay_len_samples / n).exp()
}

/// The FDN reverb processor.
pub struct Fdn {
    delay_lines: [DelayLine; FDN_SIZE],
    /// Current target delay lengths (in samples, fractional for interpolation)
    target_delay_lengths: [f32; FDN_SIZE],
    /// Smoothed delay lengths for click-free transitions
    smoothed_delay_lengths: [SmoothedParam; FDN_SIZE],
    /// Base room size in samples (driven by Space control)
    base_room_size: f32,
    /// RT60 in seconds
    rt60: f32,
    sample_rate: f32,
    /// Per-line feedback signals from previous iteration (for matrix multiply)
    feedback_signals: [f32; FDN_SIZE],
    /// Freeze state - when true, feedback gain is 1.0 and new input is blocked from FDN loop
    freeze: bool,
}

impl Fdn {
    /// Create a new FDN with the given sample rate.
    /// Default: medium room, ~1.5s RT60.
    pub fn new(sample_rate: f32) -> Self {
        let base_room_size = 800.0; // ~18ms at 44100Hz — medium room
        let rt60 = 1.5;

        let lengths = compute_delay_lengths(base_room_size);
        let delay_lines = core::array::from_fn(|_| DelayLine::new(MAX_DELAY_SAMPLES));

        let smoothed_delay_lengths = core::array::from_fn(|i| {
            SmoothedParam::new(lengths[i] as f32, 0.05, sample_rate)
        });

        let target_delay_lengths = core::array::from_fn(|i| lengths[i] as f32);

        Self {
            delay_lines,
            target_delay_lengths,
            smoothed_delay_lengths,
            base_room_size,
            rt60,
            sample_rate,
            feedback_signals: [0.0; FDN_SIZE],
            freeze: false,
        }
    }

    /// Set Freeze state on/off.
    pub fn set_freeze(&mut self, freeze: bool) {
        self.freeze = freeze;
    }

    /// Get current Freeze state.
    pub fn is_freeze(&self) -> bool {
        self.freeze
    }

    /// Set the base room size in samples. This drives all delay line lengths.
    pub fn set_room_size(&mut self, base_size_samples: f32) {
        self.base_room_size = base_size_samples;
        let lengths = compute_delay_lengths(base_size_samples);
        for i in 0..FDN_SIZE {
            self.target_delay_lengths[i] = lengths[i] as f32;
            self.smoothed_delay_lengths[i].set_target(lengths[i] as f32);
        }
    }

    /// Set the RT60 (decay time in seconds).
    pub fn set_rt60(&mut self, rt60_secs: f32) {
        self.rt60 = rt60_secs.max(0.1);
    }

    /// Get the current RT60 setting.
    pub fn rt60(&self) -> f32 {
        self.rt60
    }

    /// Process a single stereo sample pair through the FDN.
    /// Returns (output_left, output_right).
    ///
    /// Input is distributed equally across all delay lines.
    /// Output: L channel sums even-indexed lines, R channel sums odd-indexed lines.
    /// The feedback matrix (Hadamard) cross-feeds all lines on each iteration.
    #[inline]
    pub fn process_sample(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let input_per_line = if self.freeze {
            0.0f32
        } else {
            let input_mono = (input_l + input_r) * 0.5;
            input_mono * 0.25
        };

        // Read from delay lines at their current (smoothed) lengths
        let mut read_values = [0.0f32; FDN_SIZE];
        let mut delay_lens = [0.0f32; FDN_SIZE];
        for i in 0..FDN_SIZE {
            let delay_len = self.smoothed_delay_lengths[i].next();
            delay_lens[i] = delay_len;
            read_values[i] = self.delay_lines[i].read_interpolated(delay_len);
        }

        // Apply Hadamard feedback matrix
        let mut mixed = [0.0f32; FDN_SIZE];
        for i in 0..FDN_SIZE {
            let mut sum = 0.0f32;
            for j in 0..FDN_SIZE {
                sum += HADAMARD_8[i][j] * read_values[j];
            }
            mixed[i] = sum;
        }

        // Apply per-line feedback gain and write back with input
        for i in 0..FDN_SIZE {
            let fb_gain = if self.freeze {
                1.0f32
            } else {
                line_rt60_feedback_gain(self.rt60, delay_lens[i], self.sample_rate)
            };
            let feedback = mixed[i] * fb_gain;
            self.delay_lines[i].write(input_per_line + feedback);
        }

        // Store feedback signals for potential external use (decay rate EQ, etc.)
        self.feedback_signals = mixed;

        // Sum outputs: even lines → left, odd lines → right
        let mut out_l = 0.0f32;
        let mut out_r = 0.0f32;
        for i in 0..FDN_SIZE {
            if i % 2 == 0 {
                out_l += read_values[i];
            } else {
                out_r += read_values[i];
            }
        }

        // Normalize output
        let scale = 0.25; // 1/4, since we sum 4 lines per channel
        (out_l * scale, out_r * scale)
    }

    /// Process a block of stereo audio in-place.
    pub fn process_block(
        &mut self,
        input_l: &[f32],
        input_r: &[f32],
        output_l: &mut [f32],
        output_r: &mut [f32],
    ) {
        let len = input_l.len().min(input_r.len()).min(output_l.len()).min(output_r.len());
        for i in 0..len {
            let (ol, or) = self.process_sample(input_l[i], input_r[i]);
            output_l[i] = ol;
            output_r[i] = or;
        }
    }

    /// Get the current feedback signals (last iteration's delay-line outputs after matrix).
    /// Used by Decay Rate EQ and other feedback-path processors.
    pub fn feedback_signals(&self) -> &[f32; FDN_SIZE] {
        &self.feedback_signals
    }

    /// Clear all delay lines and reset state (e.g., for preset changes).
    pub fn clear(&mut self) {
        for dl in &mut self.delay_lines {
            dl.clear();
        }
        self.feedback_signals = [0.0; FDN_SIZE];
    }

    /// Snap all smoothed parameters to their targets immediately.
    pub fn snap_params(&mut self) {
        for sp in &mut self.smoothed_delay_lengths {
            sp.snap();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test 1.2 acceptance: feed an impulse and confirm a long, smoothly decaying,
    /// non-metallic tail exists in the output buffer.
    #[test]
    fn test_fdn_impulse_response_decays_exponentially() {
        let sample_rate = 44100.0;
        let mut fdn = Fdn::new(sample_rate);
        fdn.set_rt60(2.0); // 2 second decay
        fdn.snap_params();

        let total_samples = (sample_rate * 3.0) as usize; // 3 seconds of output
        let mut output_l = vec![0.0f32; total_samples];
        let mut output_r = vec![0.0f32; total_samples];

        // Feed an impulse (1.0) at sample 0, then silence
        let mut input_l = vec![0.0f32; total_samples];
        let mut input_r = vec![0.0f32; total_samples];
        input_l[0] = 1.0;
        input_r[0] = 1.0;

        fdn.process_block(&input_l, &input_r, &mut output_l, &mut output_r);

        // Measure energy in consecutive time windows
        let window_size = (sample_rate * 0.1) as usize; // 100ms windows
        let num_windows = total_samples / window_size;

        let mut window_energies = Vec::new();
        for w in 0..num_windows {
            let start = w * window_size;
            let end = (start + window_size).min(total_samples);
            let energy: f32 = output_l[start..end]
                .iter()
                .chain(output_r[start..end].iter())
                .map(|s| s * s)
                .sum();
            let rms = (energy / (2.0 * (end - start) as f32)).sqrt();
            window_energies.push(rms);
        }

        // Verify: overall energy decays over time (not necessarily perfectly monotonic
        // due to FDN's complex interference patterns, but the trend must be clearly downward)
        let first_quarter_avg: f32 = window_energies[1..num_windows / 4]
            .iter()
            .sum::<f32>()
            / (num_windows / 4 - 1) as f32;
        let last_quarter_avg: f32 = window_energies[3 * num_windows / 4..num_windows]
            .iter()
            .sum::<f32>()
            / (num_windows - 3 * num_windows / 4) as f32;

        assert!(
            first_quarter_avg > last_quarter_avg * 2.0,
            "Energy should decay significantly: first quarter avg={:.6}, last quarter avg={:.6}",
            first_quarter_avg,
            last_quarter_avg
        );

        // Verify: there IS a reverb tail (not just silence after the impulse)
        let mid_energy: f32 = window_energies[num_windows / 4..num_windows / 2]
            .iter()
            .sum::<f32>()
            / (num_windows / 4) as f32;
        assert!(
            mid_energy > 1e-6,
            "There should be audible energy in the middle of the tail, got {:.8}",
            mid_energy
        );

        // Verify: no single dominant repeating peak (comb filtering check).
        // Look for consecutive windows where energy jumps UP significantly —
        // in a well-diffused FDN, the decay envelope should be relatively smooth.
        let mut large_upward_jumps = 0;
        for w in 2..num_windows - 1 {
            if window_energies[w] > 0.0 && window_energies[w - 1] > 0.0 {
                let ratio = window_energies[w] / window_energies[w - 1];
                if ratio > 3.0 {
                    large_upward_jumps += 1;
                }
            }
        }
        assert!(
            large_upward_jumps < 3,
            "Too many large upward energy jumps ({}) — suggests comb filtering or metallic artifacts",
            large_upward_jumps
        );
    }

    #[test]
    fn test_fdn_no_nan_inf() {
        let mut fdn = Fdn::new(44100.0);
        fdn.set_rt60(3.0);
        fdn.snap_params();

        for i in 0..44100 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            let (l, r) = fdn.process_sample(input, input);
            assert!(!l.is_nan() && !l.is_infinite(), "NaN/Inf at sample {}", i);
            assert!(!r.is_nan() && !r.is_infinite(), "NaN/Inf at sample {}", i);
        }
    }

    #[test]
    fn test_line_rt60_feedback_gain() {
        let delay_samples = 1000.0;
        let gain = line_rt60_feedback_gain(1.0, delay_samples, 44100.0);
        // Over 1.0 second (44100 samples), the signal travels 44.1 trips of 1000 samples.
        // gain^44.1 should equal 0.001 (-60dB).
        let total_decay = gain.powf(44.1);
        assert!(
            (total_decay - 0.001).abs() < 0.0005,
            "Expected ~0.001 decay after RT60, got {}",
            total_decay
        );
    }

    #[test]
    fn test_compute_delay_lengths() {
        let lengths = compute_delay_lengths(1000.0);
        // First line should be exactly 1000
        assert_eq!(lengths[0], 1000);
        // All should be different (prime-ish ratios guarantee this for reasonable base sizes)
        for i in 0..FDN_SIZE {
            for j in (i + 1)..FDN_SIZE {
                assert_ne!(
                    lengths[i], lengths[j],
                    "Delay lines {} and {} have same length {}",
                    i, j, lengths[i]
                );
            }
        }
        // All should be within valid range
        for len in &lengths {
            assert!(*len >= 1 && *len < MAX_DELAY_SAMPLES);
        }
    }

    #[test]
    fn test_fdn_silence_produces_silence() {
        let mut fdn = Fdn::new(44100.0);
        // Process silence — output should remain silent
        for _ in 0..1000 {
            let (l, r) = fdn.process_sample(0.0, 0.0);
            assert_eq!(l, 0.0);
            assert_eq!(r, 0.0);
        }
    }

    #[test]
    fn test_fdn_stereo_output_differs() {
        let mut fdn = Fdn::new(44100.0);
        fdn.set_rt60(2.0);
        fdn.snap_params();

        // Feed impulse
        let _ = fdn.process_sample(1.0, 1.0);

        // After some processing, L and R should differ (different delay lines contribute)
        let mut l_differs_r = false;
        for _ in 0..4410 {
            let (l, r) = fdn.process_sample(0.0, 0.0);
            if (l - r).abs() > 1e-8 {
                l_differs_r = true;
                break;
            }
        }
        assert!(l_differs_r, "Stereo output channels should differ in the FDN tail");
    }

    #[test]
    fn test_fdn_freeze_retains_energy() {
        let sample_rate = 44100.0;
        let mut fdn = Fdn::new(sample_rate);
        fdn.set_rt60(1.0);
        fdn.snap_params();

        // Feed impulse
        fdn.process_sample(1.0, 1.0);
        // Process 1000 samples normal decay
        for _ in 0..1000 {
            fdn.process_sample(0.0, 0.0);
        }

        // Engage freeze
        fdn.set_freeze(true);

        // Measure energy over window A right after freeze
        let mut energy_a = 0.0f32;
        for _ in 0..2000 {
            let (l, r) = fdn.process_sample(0.0, 0.0);
            energy_a += l * l + r * r;
        }

        // Process 10,000 more samples with freeze active
        for _ in 0..10000 {
            fdn.process_sample(0.0, 0.0);
        }

        // Measure energy over window B (10,000 samples later)
        let mut energy_b = 0.0f32;
        for _ in 0..2000 {
            let (l, r) = fdn.process_sample(0.0, 0.0);
            energy_b += l * l + r * r;
        }

        // Energy in window B should be comparable to window A (sustained infinite loop, not decaying to 0)
        assert!(
            energy_b > energy_a * 0.5,
            "Freeze energy should be sustained: energy_a={}, energy_b={}",
            energy_a, energy_b
        );
    }
}
