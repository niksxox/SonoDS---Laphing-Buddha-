//! Dynamics ratios: PLR and PSR.

use crate::config::*;

/// Compute PLR (Peak-to-Loudness Ratio): True Peak (dBTP) − Integrated LUFS.
pub fn compute_plr(true_peak_db: f64, integrated_lufs: f64) -> f64 {
    if true_peak_db.is_infinite() || integrated_lufs.is_infinite() {
        return f64::NEG_INFINITY;
    }
    true_peak_db - integrated_lufs
}

/// Compute PSR (Peak-to-Short-term Ratio): True Peak (dBTP) − Short-term LUFS.
pub fn compute_psr(true_peak_db: f64, short_term_lufs: f64) -> f64 {
    if true_peak_db.is_infinite() || short_term_lufs.is_infinite() {
        return f64::NEG_INFINITY;
    }
    true_peak_db - short_term_lufs
}

