/// Character — chorus-style pitch modulation of the FDN delay lines.
///
/// Modulates delay-line lengths with a slow, small-depth LFO.
/// - Low Character values: no modulation (clean/transparent)
/// - High Character values: pronounced modulation (chorused, "lively" texture)
///
/// Both modulation depth and rate scale with the Character parameter.

use crate::SmoothedParam;
use std::f32::consts::PI;

/// LFO for delay-line modulation.
#[derive(Debug, Clone)]
struct Lfo {
    phase: f32,
    rate_hz: f32,
    sample_rate: f32,
}

impl Lfo {
    fn new(sample_rate: f32, initial_phase: f32) -> Self {
        Self {
            phase: initial_phase,
            rate_hz: 0.5,
            sample_rate,
        }
    }

    fn set_rate(&mut self, rate_hz: f32) {
        self.rate_hz = rate_hz.max(0.01);
    }

    /// Advance one sample and return the LFO value (-1.0 to 1.0).
    #[inline]
    fn next(&mut self) -> f32 {
        let value = (self.phase * 2.0 * PI).sin();
        self.phase += self.rate_hz / self.sample_rate;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        value
    }
}

/// Character processor — generates per-delay-line modulation offsets.
pub struct Character {
    /// One LFO per FDN delay line, each with a different phase offset
    lfos: [Lfo; 8],
    /// Character parameter (0.0 = clean, 1.0 = heavily modulated)
    character: SmoothedParam,
    sample_rate: f32,
}

impl Character {
    pub fn new(sample_rate: f32) -> Self {
        // Create 8 LFOs with staggered phases for decorrelation
        let lfos = core::array::from_fn(|i| {
            Lfo::new(sample_rate, i as f32 / 8.0)
        });

        Self {
            lfos,
            character: SmoothedParam::new(0.3, 0.02, sample_rate),
            sample_rate,
        }
    }

    /// Set the Character parameter (0.0–1.0).
    pub fn set_character(&mut self, value: f32) {
        self.character.set_target(value.clamp(0.0, 1.0));
    }

    /// Get the current modulation offsets for each delay line (in samples).
    /// These offsets should be ADDED to the base delay-line lengths.
    /// Returns an array of 8 modulation offsets.
    #[inline]
    pub fn get_modulation_offsets(&mut self) -> [f32; 8] {
        let c = self.character.next();

        // Scale depth and rate with Character parameter
        // Character 0.0: depth = 0 samples, rate doesn't matter
        // Character 0.5: depth ≈ 4 samples, rate ≈ 0.8 Hz (subtle chorus)
        // Character 1.0: depth ≈ 16 samples, rate ≈ 2.0 Hz (heavy modulation)
        let depth_samples = c * c * 16.0; // Quadratic scaling for more control range
        let rate_hz = 0.3 + c * 1.7;      // 0.3–2.0 Hz

        let mut offsets = [0.0f32; 8];
        for i in 0..8 {
            self.lfos[i].set_rate(rate_hz * (0.8 + 0.4 * (i as f32 / 7.0))); // Slightly different rates
            let lfo_val = self.lfos[i].next();
            offsets[i] = lfo_val * depth_samples;
        }
        offsets
    }

    pub fn snap_params(&mut self) {
        self.character.snap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_character_zero_no_modulation() {
        let sr = 44100.0;
        let mut ch = Character::new(sr);
        ch.set_character(0.0);
        ch.snap_params();

        for _ in 0..1000 {
            let offsets = ch.get_modulation_offsets();
            for offset in &offsets {
                assert!(
                    offset.abs() < 0.01,
                    "Character=0 should produce no modulation, got {}",
                    offset
                );
            }
        }
    }

    #[test]
    fn test_character_high_produces_modulation() {
        let sr = 44100.0;
        let mut ch = Character::new(sr);
        ch.set_character(1.0);
        ch.snap_params();

        let mut max_offset = 0.0f32;
        for _ in 0..44100 {
            let offsets = ch.get_modulation_offsets();
            for offset in &offsets {
                max_offset = max_offset.max(offset.abs());
            }
        }

        assert!(
            max_offset > 5.0,
            "Character=1.0 should produce significant modulation, max offset={}",
            max_offset
        );
    }

    #[test]
    fn test_character_offsets_decorrelated() {
        let sr = 44100.0;
        let mut ch = Character::new(sr);
        ch.set_character(0.7);
        ch.snap_params();

        // Check that not all offsets are the same at any given time
        let offsets = ch.get_modulation_offsets();
        let all_same = offsets.windows(2).all(|w| (w[0] - w[1]).abs() < 1e-6);
        // After the first sample they might happen to be similar, but generally shouldn't be
        // Process a few more samples
        let mut found_different = false;
        for _ in 0..100 {
            let offsets = ch.get_modulation_offsets();
            if offsets.windows(2).any(|w| (w[0] - w[1]).abs() > 0.01) {
                found_different = true;
                break;
            }
        }
        assert!(found_different, "LFO offsets should be decorrelated across delay lines");
    }
}
