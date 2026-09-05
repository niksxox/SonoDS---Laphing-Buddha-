//! Numerical safety and denormal protection utilities.
//!
//! Subnormal floating-point numbers (denormals) cause CPU pipeline stalls
//! when processed by standard FPUs. We provide zero-cost flush-to-zero helpers.

#[inline(always)]
pub fn flush_denormal(val: f64) -> f64 {
    if val.abs() < 1e-15 {
        0.0
    } else {
        val
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flush_denormal() {
        let tiny = 1e-25;
        assert_eq!(flush_denormal(tiny), 0.0);
        assert_eq!(flush_denormal(-tiny), 0.0);

        let normal = 0.001;
        assert_eq!(flush_denormal(normal), normal);
    }
}
