//! Loudness Range (LRA) per EBU Tech 3342.

use crate::gating::Block;

/// Compute LRA from a list of gated short-term blocks.
/// LRA = P95 - P10 of the gated short-term loudness distribution.
pub fn compute_lra(blocks: &[Block]) -> f64 {
    if blocks.len() < 2 {
        return 0.0;
    }
    let mut sorted: Vec<f64> = blocks.iter().map(|b| b.lufs).collect();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let p10 = percentile(&sorted, 10.0);
    let p95 = percentile(&sorted, 95.0);
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

