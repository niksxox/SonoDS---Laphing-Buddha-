//! Standards target presets and validator logic.

use crate::config::*;

/// A standards target preset.
#[derive(Clone)]
pub struct Preset {
    pub name: &'static str,
    pub integrated_lufs: f64,
    pub lra: f64,
    pub true_peak_db: f64,
    /// Short description of the standard.
    pub description: &'static str,
}

/// Target specification for validation.
#[derive(Clone)]
pub struct TargetSpec {
    pub integrated_target: f64,
    pub lra_max: f64,
    pub true_peak_ceiling: f64,
}

/// Validation result for each metric.
pub struct ValidatorResult {
    pub integrated_pass: bool,
    pub integrated_value: f64,
    pub lra_pass: bool,
    pub lra_value: f64,
    pub true_peak_pass: bool,
    pub true_peak_value: f64,
}

/// Documented streaming/broadcast standards presets.
pub const PRESETS: &[Preset] = &[
    // --- Streaming ---
    Preset {
        name: "Spotify",
        integrated_lufs: -14.0,
        lra: 6.0,
        true_peak_db: -1.0,
        description: "Spotify normalization target",
    },
    Preset {
        name: "Apple Music / iTunes",
        integrated_lufs: -16.0,
        lra: 6.0,
        true_peak_db: -1.0,
        description: "Apple Music / iTunes normalization target",
    },
    Preset {
        name: "YouTube",
        integrated_lufs: -14.0,
        lra: 6.0,
        true_peak_db: -1.0,
        description: "YouTube normalization target",
    },
    Preset {
        name: "Tidal",
        integrated_lufs: -14.0,
        lra: 6.0,
        true_peak_db: -1.0,
        description: "Tidal normalization target",
    },
    Preset {
        name: "Amazon Music HD",
        integrated_lufs: -14.0,
        lra: 6.0,
        true_peak_db: -1.0,
        description: "Amazon Music normalization target",
    },
    // --- Broadcast ---
    Preset {
        name: "EBU R128 (Europe)",
        integrated_lufs: -23.0,
        lra: 10.0,
        true_peak_db: -1.0,
        description: "EBU R128 broadcast standard",
    },
    Preset {
        name: "ATSC A/85 (US)",
        integrated_lufs: -24.0,
        lra: 10.0,
        true_peak_db: -2.0,
        description: "ATSC A/85 broadcast standard",
    },
    Preset {
        name: "ATSC A/85 (Extended)",
        integrated_lufs: -24.0,
        lra: 20.0,
        true_peak_db: -2.0,
        description: "ATSC A/85 extended LRA version",
    },
    // --- Streaming codec-friendly (for MP3/AAC compatibility) ---
    Preset {
        name: "Spotify (Loud)",
        integrated_lufs: -14.0,
        lra: 14.0,
        true_peak_db: -1.0,
        description: "Spotify loud preset with higher LRA allowance",
    },
];

impl Preset {
    pub fn to_target(&self) -> TargetSpec {
        TargetSpec {
            integrated_target: self.integrated_lufs,
            lra_max: self.lra,
            true_peak_ceiling: self.true_peak_db,
        }
    }
}

/// Validate measured values against a target specification.
///
/// - Integrated LUFS: must be within ±1 LU of the target.
/// - LRA: must not exceed the maximum guideline.
/// - True Peak: must not exceed the ceiling.
pub fn validate(measured_integrated: f64, measured_lra: f64, measured_true_peak: f64, target: &TargetSpec) -> ValidatorResult {
    let integrated_pass = (measured_integrated - target.integrated_target).abs() <= 1.0;
    let lra_pass = measured_lra <= target.lra_max;
    let true_peak_pass = measured_true_peak <= target.true_peak_ceiling;

    ValidatorResult {
        integrated_pass,
        integrated_value: measured_integrated,
        lra_pass,
        lra_value: measured_lra,
        true_peak_pass,
        true_peak_value: measured_true_peak,
    }
}

