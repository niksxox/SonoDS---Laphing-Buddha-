use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FirQuality {
    Medium, // 1024 taps (latency ~512 samples)
    High,   // 2048 taps (latency ~1024 samples)
}

impl FirQuality {
    pub fn num_taps(&self) -> usize {
        match self {
            FirQuality::Medium => 1024,
            FirQuality::High => 2048,
        }
    }
}

/// Blackman-Harris 4-term window function
pub fn blackman_harris_window(size: usize) -> Vec<f64> {
    let a0 = 0.35875;
    let a1 = 0.48829;
    let a2 = 0.14128;
    let a3 = 0.01168;

    let n_minus_1 = (size - 1) as f64;
    (0..size)
        .map(|i| {
            let n = i as f64;
            let term1 = a1 * (2.0 * PI * n / n_minus_1).cos();
            let term2 = a2 * (4.0 * PI * n / n_minus_1).cos();
            let term3 = a3 * (6.0 * PI * n / n_minus_1).cos();
            a0 - term1 + term2 - term3
        })
        .collect()
}

/// Compute a linear-phase FIR filter kernel matching a target frequency-magnitude response
pub fn design_linear_phase_fir(
    target_mag_fn: impl Fn(f64) -> f64,
    sample_rate: f64,
    num_taps: usize,
) -> Vec<f64> {
    let n = num_taps;
    let half_n = (n as f64 - 1.0) / 2.0;
    let num_freq_bins = n / 2;

    // Sample target linear gains at frequency bins
    let mut gains = Vec::with_capacity(num_freq_bins + 1);
    for k in 0..=num_freq_bins {
        let freq = k as f64 * sample_rate / (n as f64);
        let mag_db = target_mag_fn(freq);
        let linear_gain = 10f64.powf(mag_db / 20.0);
        gains.push(linear_gain);
    }

    // Inverse Discrete Fourier Transform for symmetric zero-phase FIR
    let mut kernel = vec![0.0; n];
    let window = blackman_harris_window(n);

    for (i, val) in kernel.iter_mut().enumerate().take(n) {
        let t = i as f64 - half_n;
        let mut sum = 0.5 * gains[0] + 0.5 * gains[num_freq_bins] * (PI * t).cos();
        for (k, &gain) in gains.iter().enumerate().take(num_freq_bins).skip(1) {
            let w = 2.0 * PI * (k as f64) / (n as f64);
            sum += gain * (w * t).cos();
        }
        *val = (2.0 / (n as f64)) * sum * window[i];
    }

    kernel
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linear_phase_fir_flat_is_impulse() {
        let kernel = design_linear_phase_fir(|_| 0.0, 48000.0, 1024);
        let center = 511; // Center of 1024 taps (halfway)
        let center_sum: f64 = kernel[center - 1..=center + 2].iter().sum();
        assert!(
            (center_sum - 1.0).abs() < 0.2,
            "Center area should sum near 1.0 for unity response"
        );
    }
}
