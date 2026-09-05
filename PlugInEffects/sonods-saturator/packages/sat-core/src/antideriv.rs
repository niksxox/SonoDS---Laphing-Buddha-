//! First and second antiderivatives for Tape, Tube, and Transformer waveshapers,
//! verified against numerical integration (Simpson's rule reference).

use crate::waveshaper::{
    Character, TRANSFORMER_K_SCALE, TRANSFORMER_TUBE_BLEND, TUBE_DEFAULT_BIAS,
};
use std::f64::consts::{LN_2, PI};

/// Robust evaluation of ln(cosh(u)) preventing float overflow.
#[inline(always)]
pub fn ln_cosh(u: f64) -> f64 {
    let abs_u = u.abs();
    if abs_u > 20.0 {
        abs_u - LN_2
    } else {
        u.cosh().ln()
    }
}

/// Evaluation of G(u) = \int_0^u ln(cosh(t)) dt.
#[inline(always)]
pub fn g_antideriv_ln_cosh(u: f64) -> f64 {
    let abs_u = u.abs();
    let sign = if u >= 0.0 { 1.0 } else { -1.0 };

    if abs_u < 0.6 {
        let u2 = abs_u * abs_u;
        let u3 = u2 * abs_u;
        let u5 = u3 * u2;
        let u7 = u5 * u2;
        let u9 = u7 * u2;
        let u11 = u9 * u2;
        let res = u3 / 6.0 - u5 / 60.0 + u7 / 315.0 - 17.0 * u9 / 22680.0 + 31.0 * u11 / 155925.0;
        sign * res
    } else {
        let z = (-2.0 * abs_u).exp();
        let z2 = z * z;
        let z3 = z2 * z;
        let z4 = z3 * z;
        let z5 = z4 * z;
        let z6 = z5 * z;
        let z7 = z6 * z;
        let z8 = z7 * z;
        let li2_neg_z = -z + z2 / 4.0 - z3 / 9.0 + z4 / 16.0 - z5 / 25.0 + z6 / 36.0 - z7 / 49.0 + z8 / 64.0;

        let integral_pos = 0.5 * abs_u * abs_u - abs_u * LN_2 + 0.5 * li2_neg_z + (PI * PI / 24.0);
        sign * integral_pos
    }
}

/// 1st antiderivative F_1(x) = \int_0^x f(t) dt.
#[inline(always)]
pub fn antideriv1(x: f64, drive: f64, character: Character) -> f64 {
    let drive_tanh = drive.tanh();
    antideriv1_with_tanh(x, drive, drive_tanh, character)
}

/// 1st antiderivative F_1(x) with precomputed drive_tanh.
#[inline(always)]
pub fn antideriv1_with_tanh(x: f64, drive: f64, drive_tanh: f64, character: Character) -> f64 {
    match character {
        Character::Tape => {
            if drive.abs() < 1e-4 {
                0.5 * x * x
            } else {
                let denom = drive * drive_tanh;
                if denom.abs() < 1e-7 {
                    0.5 * x * x
                } else {
                    ln_cosh(drive * x) / denom
                }
            }
        }
        Character::Tube => {
            if drive.abs() < 1e-4 {
                0.5 * x * x
            } else {
                let bias = TUBE_DEFAULT_BIAS;
                let denom = drive * drive_tanh;
                if denom.abs() < 1e-7 {
                    0.5 * x * x
                } else {
                    let unscaled = (ln_cosh(drive * (x + bias)) - ln_cosh(drive * bias)) / drive
                        - x * (drive * bias).tanh();
                    unscaled / drive_tanh
                }
            }
        }
        Character::Transformer => {
            if drive.abs() < 1e-4 {
                0.5 * x * x
            } else {
                let k = TRANSFORMER_K_SCALE * (drive / (1.0 + drive.abs()));
                let tape_f1 = antideriv1_with_tanh(x, drive, drive_tanh, Character::Tape);
                let sign = if x >= 0.0 { 1.0 } else { -1.0 };
                let a = drive_tanh;
                let a2 = a * a;
                let int_tanh2 = if drive.abs() < 1e-7 || a2.abs() < 1e-7 {
                    (x * x * x) / 3.0
                } else {
                    (x - (drive * x).tanh() / drive) / a2
                };
                let quad_f1 = tape_f1 - sign * k * int_tanh2;
                let tube_f1 = antideriv1_with_tanh(x, drive, drive_tanh, Character::Tube);
                (1.0 - TRANSFORMER_TUBE_BLEND) * quad_f1 + TRANSFORMER_TUBE_BLEND * tube_f1
            }
        }
    }
}

/// 2nd antiderivative F_2(x) = \int_0^x F_1(t) dt.
#[inline(always)]
pub fn antideriv2(x: f64, drive: f64, character: Character) -> f64 {
    let drive_tanh = drive.tanh();
    antideriv2_with_tanh(x, drive, drive_tanh, character)
}

/// 2nd antiderivative F_2(x) with precomputed drive_tanh.
#[inline(always)]
pub fn antideriv2_with_tanh(x: f64, drive: f64, drive_tanh: f64, character: Character) -> f64 {
    match character {
        Character::Tape => {
            if drive.abs() < 1e-4 {
                x.powi(3) / 6.0
            } else {
                let denom = drive * drive * drive_tanh;
                if denom.abs() < 1e-7 {
                    x.powi(3) / 6.0
                } else {
                    g_antideriv_ln_cosh(drive * x) / denom
                }
            }
        }
        Character::Tube => {
            if drive.abs() < 1e-4 {
                x.powi(3) / 6.0
            } else {
                let bias = TUBE_DEFAULT_BIAS;
                let g_val = (g_antideriv_ln_cosh(drive * (x + bias))
                    - g_antideriv_ln_cosh(drive * bias))
                    / (drive * drive);
                let lin_part1 = (x * ln_cosh(drive * bias)) / drive;
                let lin_part2 = 0.5 * x * x * (drive * bias).tanh();
                let unscaled = g_val - lin_part1 - lin_part2;
                unscaled / drive_tanh
            }
        }
        Character::Transformer => {
            if drive.abs() < 1e-4 {
                x.powi(3) / 6.0
            } else {
                let k = TRANSFORMER_K_SCALE * (drive / (1.0 + drive.abs()));
                let tape_f2 = antideriv2_with_tanh(x, drive, drive_tanh, Character::Tape);
                let sign = if x >= 0.0 { 1.0 } else { -1.0 };
                let a = drive_tanh;
                let a2 = a * a;
                let int_tanh2_f2 = if drive.abs() < 1e-7 || a2.abs() < 1e-7 {
                    (x * x * x * x) / 12.0
                } else {
                    (0.5 * x * x - ln_cosh(drive * x) / (drive * drive)) / a2
                };
                let quad_f2 = tape_f2 - sign * k * int_tanh2_f2;
                let tube_f2 = antideriv2_with_tanh(x, drive, drive_tanh, Character::Tube);
                (1.0 - TRANSFORMER_TUBE_BLEND) * quad_f2 + TRANSFORMER_TUBE_BLEND * tube_f2
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::waveshaper::shape;

    fn simpson_integrate<F: Fn(f64) -> f64>(f: F, a: f64, b: f64, n_intervals: usize) -> f64 {
        let n = if n_intervals % 2 != 0 {
            n_intervals + 1
        } else {
            n_intervals
        };
        let h = (b - a) / (n as f64);
        let mut sum = f(a) + f(b);

        for i in 1..n {
            let x = a + (i as f64) * h;
            if i % 2 == 1 {
                sum += 4.0 * f(x);
            } else {
                sum += 2.0 * f(x);
            }
        }
        sum * h / 3.0
    }

    #[test]
    fn test_antideriv1_matches_numerical_integration() {
        let characters = [Character::Tape, Character::Tube, Character::Transformer];
        let drives = [0.2, 0.5, 1.0, 2.5, 5.0];
        let x_test_points = [-1.5, -0.8, -0.2, 0.0, 0.3, 0.9, 1.4];

        for &charac in &characters {
            for &drive in &drives {
                for &x in &x_test_points {
                    let num_int = simpson_integrate(|t| shape(t, drive, charac), 0.0, x, 2000);
                    let analytic_f1 = antideriv1(x, drive, charac) - antideriv1(0.0, drive, charac);

                    let diff = (analytic_f1 - num_int).abs();
                    assert!(
                        diff < 1e-4,
                        "F1 mismatch for {:?} at x={}, drive={}: analytic={}, numerical={}, diff={}",
                        charac,
                        x,
                        drive,
                        analytic_f1,
                        num_int,
                        diff
                    );
                }
            }
        }
    }

    #[test]
    fn test_antideriv2_matches_numerical_integration() {
        let characters = [Character::Tape, Character::Tube, Character::Transformer];
        let drives = [0.2, 0.5, 1.0, 2.5, 5.0];
        let x_test_points = [-1.5, -0.8, -0.2, 0.0, 0.3, 0.9, 1.4];

        for &charac in &characters {
            for &drive in &drives {
                for &x in &x_test_points {
                    let num_f2 = simpson_integrate(
                        |t| antideriv1(t, drive, charac) - antideriv1(0.0, drive, charac),
                        0.0,
                        x,
                        2000,
                    );
                    let analytic_f2 = antideriv2(x, drive, charac) - antideriv2(0.0, drive, charac);

                    let diff = (analytic_f2 - num_f2).abs();
                    assert!(
                        diff < 1e-3,
                        "F2 mismatch for {:?} at x={}, drive={}: analytic={}, numerical={}, diff={}",
                        charac,
                        x,
                        drive,
                        analytic_f2,
                        num_f2,
                        diff
                    );
                }
            }
        }
    }
}
