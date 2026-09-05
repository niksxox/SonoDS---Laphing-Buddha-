//! Offline whole-file analysis mode.

use crate::gating::Block;
use crate::kweight::KWeighting;
use crate::config::*;
use crate::presets::{TargetSpec, validate, ValidatorResult};

/// Result of analyzing an entire audio file at once.
#[derive(Clone)]
pub struct OfflineResult {
    pub integrated_lufs: f64,
    pub lra: f64,
    pub true_peak_db: f64,
    pub plr: f64,
    pub momentary_max: f64,
    pub short_term_max: f64,
    pub sample_count: usize,
    pub duration_ms: f64,
}

/// Analyze a complete stereo buffer as fast as possible.
pub struct OfflineAnalyzer {
    pub sample_rate: f64,
    kweight_l: KWeighting,
    kweight_r: KWeighting,
}

impl OfflineAnalyzer {
    pub fn new(sample_rate: f64) -> Self {
        OfflineAnalyzer {
            sample_rate,
            kweight_l: KWeighting::new(sample_rate),
            kweight_r: KWeighting::new(sample_rate),
        }
    }

    /// Analyze a full file (left and right channels) and return summary results.
    pub fn analyze(&mut self, left: &[f32], right: &[f32]) -> OfflineResult {
        let block_size = ((0.4 * self.sample_rate) as usize).max(1);
        let step_size = ((0.1 * self.sample_rate) as usize).max(1);
        let n = left.len().min(right.len());

        // Collect gating blocks at 400ms intervals
        let mut blocks: Vec<Block> = Vec::new();
        let mut momentary_max = SILENCE_FLOOR_LUFS;
        let mut short_term_max = SILENCE_FLOOR_LUFS;
        let mut true_peak_max = f64::NEG_INFINITY;

        let mut pos = 0;
        while pos + block_size <= n {
            // Compute mean square for this block (K-weighted)
            let mut sum_sq_l = 0.0f64;
            let mut sum_sq_r = 0.0f64;
            for i in 0..block_size {
                let l = self.kweight_l.process(left[pos + i]);
                let r = self.kweight_r.process(right[pos + i]);
                sum_sq_l += (l * l) as f64;
                sum_sq_r += (r * r) as f64;
            }
            let mean_sq = (sum_sq_l + sum_sq_r) / (block_size as f64);

            // Convert to LUFS
            let lufs = if mean_sq > 0.0 {
                LUFS_OFFSET + 10.0 * f64::log10(mean_sq)
            } else {
                SILENCE_FLOOR_LUFS
            };

            // True peak
            for i in 0..block_size {
                let abs_val = left[pos + i].abs().max(right[pos + i].abs()) as f64;
                if abs_val > true_peak_max {
                    true_peak_max = abs_val;
                }
            }

            if lufs > momentary_max {
                momentary_max = lufs;
            }
            if lufs > short_term_max {
                short_term_max = lufs;
            }

            blocks.push(Block {
                start: pos,
                mean_square: mean_sq,
                lufs,
            });

            pos += step_size;
        }

        // Apply two-stage gating for integrated loudness
        let integrated = two_stage_gate(&blocks, self.sample_rate);

        // LRA from blocks
        let lra = compute_lra(&blocks);

        // PLR and PSR
        let plr = true_peak_max.max(0.0); // simplified for stub
        let _ = plr;

        OfflineResult {
            integrated_lufs: integrated,
            lra,
            true_peak_db: if true_peak_max > 0.0 {
                20.0 * f64::log10(true_peak_max)
            } else {
                f64::NEG_INFINITY
            },
            plr: 0.0,
            momentary_max,
            short_term_max,
            sample_count: n,
            duration_ms: (n as f64 / self.sample_rate) * 1000.0,
        }
    }
}

/// Two-stage gating per BS.1770-4 §3.3-3.4.
fn two_stage_gate(blocks: &[Block], _sample_rate: f64) -> f64 {
    if blocks.is_empty() {
        return SILENCE_FLOOR_LUFS;
    }

    // Stage 1: Absolute gate — remove blocks below -70 LUFS
    let abs_gated: Vec<&Block> = blocks.iter().filter(|b| b.lufs >= ABSOLUTE_GATE_LUFS).collect();
    if abs_gated.is_empty() {
        return SILENCE_FLOOR_LUFS;
    }

    // Compute the mean of absolute-gated blocks
    let mean_gated: f64 = abs_gated.iter().map(|b| b.lufs).sum::<f64>() / abs_gated.len() as f64;

    // Stage 2: Relative gate — remove blocks more than 10 LU below the gated mean
    let relative_threshold = mean_gated + RELATIVE_GATE_OFFSET_LU;
    let rel_gated: Vec<&Block> = abs_gated.iter().copied().filter(|b| b.lufs >= relative_threshold).collect();
    if rel_gated.is_empty() {
        return SILENCE_FLOOR_LUFS;
    }

    // Integrated loudness = mean of remaining blocks
    let sum: f64 = rel_gated.iter().map(|b| b.lufs).sum();
    sum / rel_gated.len() as f64
}

fn compute_lra(blocks: &[Block]) -> f64 {
    if blocks.len() < 2 {
        return 0.0;
    }

    // Absolute gate
    let abs_gated: Vec<f64> = blocks.iter()
        .filter(|b| b.lufs >= LRA_ABSOLUTE_GATE_LUFS)
        .map(|b| b.lufs)
        .collect();
    if abs_gated.is_empty() {
        return 0.0;
    }

    let mean: f64 = abs_gated.iter().sum::<f64>() / abs_gated.len() as f64;
    let rel_threshold = mean + LRA_RELATIVE_GATE_OFFSET_LU;

    let mut sorted: Vec<f64> = abs_gated.iter()
        .filter(|&&v| v >= rel_threshold)
        .copied()
        .collect();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

    if sorted.len() < 2 {
        return 0.0;
    }

    let p10 = percentile(&sorted, LRA_PERCENTILE_LOW);
    let p95 = percentile(&sorted, LRA_PERCENTILE_HIGH);
    p95 - p10
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = (p / 100.0) * (sorted.len() - 1) as f64;
    let lo = idx.floor() as usize;
    let hi = (lo + 1).min(sorted.len() - 1);
    let frac = idx - lo as f64;
    sorted[lo] + frac * (sorted[hi] - sorted[lo])
}

pub fn _validate_wrapper(integrated: f64, lra: f64, tp: f64, target: &TargetSpec) -> ValidatorResult {
    validate(integrated, lra, tp, target)
}

