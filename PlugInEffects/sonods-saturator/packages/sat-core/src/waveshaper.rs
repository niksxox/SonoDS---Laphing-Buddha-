//! Pure waveshaper transfer curves for Tape, Tube, and Transformer.

/// Tunable bias constant for Tube character (tuned by ear for warm 2nd harmonic richness).
pub const TUBE_DEFAULT_BIAS: f64 = 0.2;

/// Tunable blend ratio for Transformer character (tuned by ear for musical iron saturation).
pub const TRANSFORMER_TUBE_BLEND: f64 = 0.3;

/// Scaling factor for Transformer quadratic soft-clipping term.
pub const TRANSFORMER_K_SCALE: f64 = 0.2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Character {
    Tape,
    Tube,
    Transformer,
}

/// Pure, stateless waveshaper transfer function.
#[inline]
pub fn shape(x: f64, drive: f64, character: Character) -> f64 {
    match character {
        Character::Tape => shape_tape(x, drive),
        Character::Tube => shape_tube(x, drive, TUBE_DEFAULT_BIAS),
        Character::Transformer => shape_transformer(x, drive),
    }
}

#[inline]
pub fn shape_tape(x: f64, drive: f64) -> f64 {
    if drive.abs() < 1e-4 {
        x
    } else {
        let denom = drive.tanh();
        if denom.abs() < 1e-7 {
            x
        } else {
            (drive * x).tanh() / denom
        }
    }
}

#[inline]
pub fn shape_tube(x: f64, drive: f64, bias: f64) -> f64 {
    if drive.abs() < 1e-4 {
        x
    } else {
        let denom = drive.tanh();
        let scale = if denom.abs() < 1e-7 { 1.0 } else { 1.0 / denom };
        // Includes the DC-offset correction term: - tanh(drive * bias)
        ((drive * (x + bias)).tanh() - (drive * bias).tanh()) * scale
    }
}

#[inline]
pub fn shape_transformer(x: f64, drive: f64) -> f64 {
    if drive.abs() < 1e-4 {
        x
    } else {
        let tape_part = shape_tape(x, drive);
        let k = TRANSFORMER_K_SCALE * (drive / (1.0 + drive.abs()));
        let quad = tape_part - k * tape_part * tape_part.abs();
        let tube_part = shape_tube(x, drive, TUBE_DEFAULT_BIAS);
        (1.0 - TRANSFORMER_TUBE_BLEND) * quad + TRANSFORMER_TUBE_BLEND * tube_part
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tube_dc_offset_is_zero_at_x_zero() {
        let drives = [0.0, 0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0];
        let biases = [0.0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.8];

        for &drive in &drives {
            for &bias in &biases {
                let out = shape_tube(0.0, drive, bias);
                assert!(
                    out.abs() < 1e-12,
                    "Tube DC offset not zero at x=0: drive={}, bias={}, out={}",
                    drive,
                    bias,
                    out
                );
            }
        }
    }

    #[test]
    fn test_tape_zero_and_symmetry() {
        let drives = [0.0, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0];
        for &drive in &drives {
            assert!(shape_tape(0.0, drive).abs() < 1e-12);
            for &x in &[0.1, 0.5, 0.9, 1.5] {
                let pos = shape_tape(x, drive);
                let neg = shape_tape(-x, drive);
                assert!((pos + neg).abs() < 1e-10, "Tape should be symmetric odd function");
            }
        }
    }

    #[test]
    fn test_transformer_zero_at_x_zero() {
        let drives = [0.0, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0];
        for &drive in &drives {
            let out = shape_transformer(0.0, drive);
            assert!(
                out.abs() < 1e-12,
                "Transformer not zero at x=0: drive={}, out={}",
                drive,
                out
            );
        }
    }

    #[test]
    fn test_curves_grid_evaluation() {
        let x_grid: Vec<f64> = (-20..=20).map(|i| i as f64 * 0.1).collect();
        let drives = [0.0, 0.2, 0.5, 1.0, 2.0, 4.0, 8.0];

        for &drive in &drives {
            for &x in &x_grid {
                let tape = shape(x, drive, Character::Tape);
                let tube = shape(x, drive, Character::Tube);
                let xfmr = shape(x, drive, Character::Transformer);

                assert!(tape.is_finite());
                assert!(tube.is_finite());
                assert!(xfmr.is_finite());
            }
        }
    }
}
