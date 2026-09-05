//! Numerical safety and denormal protection utilities.

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
