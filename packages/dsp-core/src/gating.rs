//! Gating block data structures (shared across loudness and LRA).

/// A single gating block of mean-square values.
#[derive(Clone, Copy, Debug)]
pub struct Block {
    /// Start sample offset.
    pub start: usize,
    /// Mean square of the K-weighted signal (linear, pre-dBFS conversion).
    pub mean_square: f64,
    /// Loudness in LUFS.
    pub lufs: f64,
}

/// Result of a two-stage gate application.
pub struct GateResult {
    pub survived: Vec<Block>,
}

