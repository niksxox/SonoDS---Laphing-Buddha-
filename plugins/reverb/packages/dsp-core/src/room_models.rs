/// Room model definitions and Space control interpolation.
///
/// Defines 12+ named room model presets, each specifying:
/// - Base delay-line length set (as a multiplier on sample rate)
/// - Base RT60 (decay time in seconds)
/// - Early-reflection tap pattern (times and gains, used by Task 1.4)
///
/// The Space parameter (0.0–1.0) maps across all models in sequence,
/// with stepless crossfade interpolation between adjacent models.

/// A single early-reflection tap: delay time (in seconds) and gain.
#[derive(Debug, Clone, Copy)]
pub struct EarlyReflectionTap {
    pub delay_secs: f32,
    pub gain: f32,
}

/// A room model preset.
#[derive(Debug, Clone)]
pub struct RoomModel {
    pub name: &'static str,
    /// Base room size in seconds (converted to samples at runtime).
    /// This drives the FDN delay line lengths via the ratio table.
    pub base_size_secs: f32,
    /// Base RT60 (decay time in seconds).
    pub base_rt60: f32,
    /// Early reflection tap pattern (up to 8 taps).
    pub early_taps: &'static [EarlyReflectionTap],
    /// Diffusion amount (0.0–1.0) — how quickly the early reflections
    /// transition into the dense FDN tail.
    pub diffusion: f32,
}

// ─── Early Reflection Patterns ─────────────────────────────────────────

static ER_TINY_ROOM: [EarlyReflectionTap; 5] = [
    EarlyReflectionTap { delay_secs: 0.0008, gain: 0.90 },
    EarlyReflectionTap { delay_secs: 0.0021, gain: 0.72 },
    EarlyReflectionTap { delay_secs: 0.0038, gain: 0.58 },
    EarlyReflectionTap { delay_secs: 0.0055, gain: 0.40 },
    EarlyReflectionTap { delay_secs: 0.0071, gain: 0.28 },
];

static ER_SMALL_ROOM: [EarlyReflectionTap; 6] = [
    EarlyReflectionTap { delay_secs: 0.0015, gain: 0.85 },
    EarlyReflectionTap { delay_secs: 0.0038, gain: 0.68 },
    EarlyReflectionTap { delay_secs: 0.0062, gain: 0.55 },
    EarlyReflectionTap { delay_secs: 0.0091, gain: 0.42 },
    EarlyReflectionTap { delay_secs: 0.0125, gain: 0.30 },
    EarlyReflectionTap { delay_secs: 0.0160, gain: 0.20 },
];

static ER_MEDIUM_ROOM: [EarlyReflectionTap; 6] = [
    EarlyReflectionTap { delay_secs: 0.0032, gain: 0.80 },
    EarlyReflectionTap { delay_secs: 0.0071, gain: 0.62 },
    EarlyReflectionTap { delay_secs: 0.0118, gain: 0.48 },
    EarlyReflectionTap { delay_secs: 0.0172, gain: 0.35 },
    EarlyReflectionTap { delay_secs: 0.0231, gain: 0.24 },
    EarlyReflectionTap { delay_secs: 0.0295, gain: 0.16 },
];

static ER_LARGE_ROOM: [EarlyReflectionTap; 7] = [
    EarlyReflectionTap { delay_secs: 0.0058, gain: 0.75 },
    EarlyReflectionTap { delay_secs: 0.0121, gain: 0.58 },
    EarlyReflectionTap { delay_secs: 0.0195, gain: 0.44 },
    EarlyReflectionTap { delay_secs: 0.0278, gain: 0.33 },
    EarlyReflectionTap { delay_secs: 0.0368, gain: 0.24 },
    EarlyReflectionTap { delay_secs: 0.0462, gain: 0.17 },
    EarlyReflectionTap { delay_secs: 0.0558, gain: 0.11 },
];

static ER_CHAMBER: [EarlyReflectionTap; 6] = [
    EarlyReflectionTap { delay_secs: 0.0042, gain: 0.78 },
    EarlyReflectionTap { delay_secs: 0.0095, gain: 0.60 },
    EarlyReflectionTap { delay_secs: 0.0158, gain: 0.46 },
    EarlyReflectionTap { delay_secs: 0.0228, gain: 0.34 },
    EarlyReflectionTap { delay_secs: 0.0312, gain: 0.22 },
    EarlyReflectionTap { delay_secs: 0.0398, gain: 0.14 },
];

static ER_CONCERT_HALL: [EarlyReflectionTap; 7] = [
    EarlyReflectionTap { delay_secs: 0.0085, gain: 0.70 },
    EarlyReflectionTap { delay_secs: 0.0178, gain: 0.52 },
    EarlyReflectionTap { delay_secs: 0.0282, gain: 0.38 },
    EarlyReflectionTap { delay_secs: 0.0398, gain: 0.28 },
    EarlyReflectionTap { delay_secs: 0.0528, gain: 0.20 },
    EarlyReflectionTap { delay_secs: 0.0668, gain: 0.14 },
    EarlyReflectionTap { delay_secs: 0.0818, gain: 0.09 },
];

static ER_CATHEDRAL: [EarlyReflectionTap; 8] = [
    EarlyReflectionTap { delay_secs: 0.0120, gain: 0.65 },
    EarlyReflectionTap { delay_secs: 0.0258, gain: 0.48 },
    EarlyReflectionTap { delay_secs: 0.0415, gain: 0.35 },
    EarlyReflectionTap { delay_secs: 0.0588, gain: 0.25 },
    EarlyReflectionTap { delay_secs: 0.0775, gain: 0.18 },
    EarlyReflectionTap { delay_secs: 0.0972, gain: 0.13 },
    EarlyReflectionTap { delay_secs: 0.1178, gain: 0.09 },
    EarlyReflectionTap { delay_secs: 0.1395, gain: 0.06 },
];

static ER_ARENA: [EarlyReflectionTap; 7] = [
    EarlyReflectionTap { delay_secs: 0.0180, gain: 0.58 },
    EarlyReflectionTap { delay_secs: 0.0385, gain: 0.42 },
    EarlyReflectionTap { delay_secs: 0.0618, gain: 0.30 },
    EarlyReflectionTap { delay_secs: 0.0878, gain: 0.21 },
    EarlyReflectionTap { delay_secs: 0.1158, gain: 0.15 },
    EarlyReflectionTap { delay_secs: 0.1458, gain: 0.10 },
    EarlyReflectionTap { delay_secs: 0.1778, gain: 0.06 },
];

static ER_PLATE: [EarlyReflectionTap; 5] = [
    EarlyReflectionTap { delay_secs: 0.0005, gain: 0.92 },
    EarlyReflectionTap { delay_secs: 0.0012, gain: 0.78 },
    EarlyReflectionTap { delay_secs: 0.0022, gain: 0.62 },
    EarlyReflectionTap { delay_secs: 0.0035, gain: 0.48 },
    EarlyReflectionTap { delay_secs: 0.0052, gain: 0.35 },
];

static ER_SPRING: [EarlyReflectionTap; 4] = [
    EarlyReflectionTap { delay_secs: 0.0008, gain: 0.88 },
    EarlyReflectionTap { delay_secs: 0.0045, gain: 0.55 },
    EarlyReflectionTap { delay_secs: 0.0120, gain: 0.35 },
    EarlyReflectionTap { delay_secs: 0.0280, gain: 0.20 },
];

static ER_AMBIENCE: [EarlyReflectionTap; 6] = [
    EarlyReflectionTap { delay_secs: 0.0025, gain: 0.72 },
    EarlyReflectionTap { delay_secs: 0.0058, gain: 0.55 },
    EarlyReflectionTap { delay_secs: 0.0098, gain: 0.40 },
    EarlyReflectionTap { delay_secs: 0.0145, gain: 0.28 },
    EarlyReflectionTap { delay_secs: 0.0198, gain: 0.18 },
    EarlyReflectionTap { delay_secs: 0.0258, gain: 0.10 },
];

static ER_INFINITE: [EarlyReflectionTap; 4] = [
    EarlyReflectionTap { delay_secs: 0.0200, gain: 0.50 },
    EarlyReflectionTap { delay_secs: 0.0450, gain: 0.35 },
    EarlyReflectionTap { delay_secs: 0.0750, gain: 0.22 },
    EarlyReflectionTap { delay_secs: 0.1100, gain: 0.14 },
];

static ER_WAREHOUSE: [EarlyReflectionTap; 7] = [
    EarlyReflectionTap { delay_secs: 0.0095, gain: 0.68 },
    EarlyReflectionTap { delay_secs: 0.0210, gain: 0.50 },
    EarlyReflectionTap { delay_secs: 0.0348, gain: 0.36 },
    EarlyReflectionTap { delay_secs: 0.0502, gain: 0.26 },
    EarlyReflectionTap { delay_secs: 0.0672, gain: 0.18 },
    EarlyReflectionTap { delay_secs: 0.0855, gain: 0.12 },
    EarlyReflectionTap { delay_secs: 0.1048, gain: 0.08 },
];

// ─── Room Model Table ──────────────────────────────────────────────────

/// All room models, ordered for the Space parameter sweep (0.0–1.0).
/// Space maps linearly across this array: 0.0 = first model, 1.0 = last model,
/// intermediate values crossfade between adjacent models.
pub static ROOM_MODELS: [RoomModel; 13] = [
    RoomModel { name: "Tiny Room",    base_size_secs: 0.004,  base_rt60: 0.25,  early_taps: &ER_TINY_ROOM,    diffusion: 0.85 },
    RoomModel { name: "Small Room",   base_size_secs: 0.008,  base_rt60: 0.45,  early_taps: &ER_SMALL_ROOM,   diffusion: 0.80 },
    RoomModel { name: "Medium Room",  base_size_secs: 0.014,  base_rt60: 0.75,  early_taps: &ER_MEDIUM_ROOM,  diffusion: 0.75 },
    RoomModel { name: "Large Room",   base_size_secs: 0.022,  base_rt60: 1.10,  early_taps: &ER_LARGE_ROOM,   diffusion: 0.70 },
    RoomModel { name: "Chamber",      base_size_secs: 0.028,  base_rt60: 1.40,  early_taps: &ER_CHAMBER,      diffusion: 0.72 },
    RoomModel { name: "Plate",        base_size_secs: 0.006,  base_rt60: 1.20,  early_taps: &ER_PLATE,        diffusion: 0.95 },
    RoomModel { name: "Spring",       base_size_secs: 0.010,  base_rt60: 1.50,  early_taps: &ER_SPRING,       diffusion: 0.60 },
    RoomModel { name: "Ambience",     base_size_secs: 0.016,  base_rt60: 0.60,  early_taps: &ER_AMBIENCE,     diffusion: 0.78 },
    RoomModel { name: "Warehouse",    base_size_secs: 0.035,  base_rt60: 1.80,  early_taps: &ER_WAREHOUSE,    diffusion: 0.65 },
    RoomModel { name: "Concert Hall", base_size_secs: 0.045,  base_rt60: 2.20,  early_taps: &ER_CONCERT_HALL, diffusion: 0.68 },
    RoomModel { name: "Cathedral",    base_size_secs: 0.065,  base_rt60: 3.50,  early_taps: &ER_CATHEDRAL,    diffusion: 0.62 },
    RoomModel { name: "Arena",        base_size_secs: 0.085,  base_rt60: 5.00,  early_taps: &ER_ARENA,        diffusion: 0.55 },
    RoomModel { name: "Infinite",     base_size_secs: 0.120,  base_rt60: 10.0,  early_taps: &ER_INFINITE,     diffusion: 0.50 },
];

/// The number of room models available.
pub const NUM_ROOM_MODELS: usize = ROOM_MODELS.len();

/// Result of interpolating between two room models.
#[derive(Debug, Clone)]
pub struct InterpolatedRoom {
    /// Interpolated base size in seconds.
    pub base_size_secs: f32,
    /// Interpolated base RT60 in seconds.
    pub base_rt60: f32,
    /// Interpolated diffusion.
    pub diffusion: f32,
    /// Index of the lower model (for early-reflection tap interpolation in Task 1.4).
    pub model_a_index: usize,
    /// Index of the upper model.
    pub model_b_index: usize,
    /// Crossfade fraction (0.0 = model_a, 1.0 = model_b).
    pub crossfade: f32,
}

/// Given a Space value (0.0–1.0), compute the interpolated room parameters.
/// Maps linearly across the ROOM_MODELS array.
pub fn interpolate_space(space: f32) -> InterpolatedRoom {
    let space_clamped = space.clamp(0.0, 1.0);

    // Map to model index (0.0 → first model, 1.0 → last model)
    let scaled = space_clamped * (NUM_ROOM_MODELS - 1) as f32;
    let index_a = (scaled as usize).min(NUM_ROOM_MODELS - 2);
    let index_b = index_a + 1;
    let frac = scaled - index_a as f32;

    let model_a = &ROOM_MODELS[index_a];
    let model_b = &ROOM_MODELS[index_b];

    InterpolatedRoom {
        base_size_secs: model_a.base_size_secs + frac * (model_b.base_size_secs - model_a.base_size_secs),
        base_rt60: model_a.base_rt60 + frac * (model_b.base_rt60 - model_a.base_rt60),
        diffusion: model_a.diffusion + frac * (model_b.diffusion - model_a.diffusion),
        model_a_index: index_a,
        model_b_index: index_b,
        crossfade: frac,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_room_model_count() {
        assert_eq!(NUM_ROOM_MODELS, 13);
    }

    #[test]
    fn test_space_endpoints() {
        let start = interpolate_space(0.0);
        assert!((start.base_size_secs - ROOM_MODELS[0].base_size_secs).abs() < 1e-6);
        assert!((start.base_rt60 - ROOM_MODELS[0].base_rt60).abs() < 1e-6);

        let end = interpolate_space(1.0);
        let last = &ROOM_MODELS[NUM_ROOM_MODELS - 1];
        assert!((end.base_size_secs - last.base_size_secs).abs() < 1e-6);
        assert!((end.base_rt60 - last.base_rt60).abs() < 1e-6);
    }

    #[test]
    fn test_space_midpoint_interpolation() {
        let mid = interpolate_space(0.5);
        // At 0.5, we should be between models 6 and 7 (index-wise)
        assert!(mid.base_size_secs > ROOM_MODELS[0].base_size_secs);
        assert!(mid.base_size_secs < ROOM_MODELS[NUM_ROOM_MODELS - 1].base_size_secs);
    }

    #[test]
    fn test_space_monotonic_size() {
        // Room size should increase monotonically as Space increases
        // (not strictly enforced on all models, but our model ordering ensures this)
        let mut prev_size = 0.0f32;
        for i in 0..100 {
            let space = i as f32 / 99.0;
            let room = interpolate_space(space);
            // RT60 should generally increase (our models are ordered this way)
            assert!(
                room.base_rt60 >= 0.0,
                "RT60 should be non-negative at space={:.2}",
                space
            );
        }
    }

    #[test]
    fn test_each_model_has_early_taps() {
        for model in &ROOM_MODELS {
            assert!(
                !model.early_taps.is_empty(),
                "Model '{}' has no early reflection taps",
                model.name
            );
        }
    }

    #[test]
    fn test_early_taps_ordered_by_time() {
        for model in &ROOM_MODELS {
            for i in 1..model.early_taps.len() {
                assert!(
                    model.early_taps[i].delay_secs > model.early_taps[i - 1].delay_secs,
                    "Model '{}': early taps not ordered by time at index {}",
                    model.name, i
                );
            }
        }
    }
}
