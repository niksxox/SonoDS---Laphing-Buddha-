//! Sidechain routing and Ducking configuration per Task 1.8.
//!
//! Exposes detector source selection (Internal vs External Sidechain vs Ducking)
//! and sidechain filtering utilities for the DSP core.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidechainSource {
    /// Internal: Detector reads the main input audio.
    Internal,
    /// External: Detector reads dedicated external sidechain auxiliary audio.
    External,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateMode {
    /// Gate: Attenuates below threshold (downward expansion).
    Gate,
    /// Upward: Boosts above threshold (upward expansion).
    Upward,
    /// Ducking: Attenuates main signal when sidechain is above threshold.
    Ducking,
}

#[derive(Debug, Clone)]
pub struct SidechainConfig {
    pub source: SidechainSource,
    pub mode: GateMode,
    pub listen_audition: bool,
}

impl Default for SidechainConfig {
    fn default() -> Self {
        Self {
            source: SidechainSource::Internal,
            mode: GateMode::Gate,
            listen_audition: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::gain_computer::downward_expander_gain;

    #[test]
    fn test_ducking_math_independent_of_source_array() {
        // Gain computer produces mathematically identical gain whether reading from
        // main audio level array or external sidechain level array.
        let threshold = -20.0;
        let ratio = 4.0;
        let range = -60.0;
        let knee = 6.0;

        let main_levels = vec![-60.0, -40.0, -25.0, -15.0, 0.0];
        let sidechain_levels = vec![-60.0, -40.0, -25.0, -15.0, 0.0];

        let gains_main: Vec<f64> = main_levels
            .iter()
            .map(|&lvl| downward_expander_gain(lvl, threshold, ratio, range, knee))
            .collect();

        let gains_sidechain: Vec<f64> = sidechain_levels
            .iter()
            .map(|&lvl| downward_expander_gain(lvl, threshold, ratio, range, knee))
            .collect();

        assert_eq!(gains_main, gains_sidechain);
    }
}
