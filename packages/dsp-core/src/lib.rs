/// SonoDS Stereo Imager — DSP Core
///
/// Modules:
/// - ms_matrix: Mid/Side encode/decode
/// - correlation: Phase correlation meter
/// - width: Single-band and per-band width control
/// - crossover: Multiband crossover (up to 4 bands)
/// - stereoize: Haas/decorrelation-based mono-to-stereo enhancement
/// - shuffler: Bass-width workflow control
/// - asymmetry: L/R balance control
/// - recover_sides: Side-channel energy recovery during narrowing

pub mod ms_matrix;
pub mod correlation;
pub mod width;
pub mod crossover;
pub mod multiband_imager;
pub mod stereoize;
pub mod shuffler;
pub mod asymmetry;
pub mod recover_sides;
pub mod wasm_api;

#[cfg(test)]
pub mod fuzz_tests;

#[cfg(test)]
mod tests {
    #[test]
    fn crate_loads() {
        assert!(true);
    }
}
