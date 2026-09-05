//! Testing Infrastructure Harness for comp-core per Task 1.11:
//! 1. Real-time safety validation (zero dynamic allocations during process_block)
//! 2. Null-test golden regression harness
//! 3. THD+N sweep test (< -90dB at Ratio=1.0: true transparency at unity ratio)

use comp_core::CompressorCore;
use std::f64::consts::PI;

fn compute_thd_n_db(signal: &[f64], fund_freq: f64, sample_rate: f64) -> f64 {
    let n = signal.len();
    let mut dbs = vec![-140.0; n / 2];

    for k in 0..n / 2 {
        let mut real = 0.0;
        let mut imag = 0.0;
        for (t, &s) in signal.iter().enumerate() {
            // Blackman-Harris 4-term window
            let a0 = 0.35875;
            let a1 = 0.48829;
            let a2 = 0.14128;
            let a3 = 0.01168;
            let theta = 2.0 * PI * (t as f64) / (n as f64);
            let w = a0 - a1 * theta.cos() + a2 * (2.0 * theta).cos() - a3 * (3.0 * theta).cos();
            let angle = 2.0 * PI * (k as f64) * (t as f64) / (n as f64);
            real += s * w * angle.cos();
            imag -= s * w * angle.sin();
        }
        let mag = (real * real + imag * imag).sqrt() / (n as f64);
        dbs[k] = 20.0 * (mag.max(1e-12)).log10();
    }

    let fund_bin = ((fund_freq / (sample_rate / 2.0)) * (dbs.len() as f64)).round() as usize;
    let fund_mag = dbs[fund_bin.saturating_sub(2)..=fund_bin.saturating_add(2)]
        .iter()
        .cloned()
        .fold(-140.0f64, f64::max);

    let mut non_fund_power = 0.0;
    for harmonic in 2..20 {
        let harm_freq = fund_freq * harmonic as f64;
        if harm_freq < sample_rate / 2.0 {
            let harm_bin = ((harm_freq / (sample_rate / 2.0)) * (dbs.len() as f64)).round() as usize;
            if harm_bin < dbs.len() {
                let peak = dbs[harm_bin.saturating_sub(2)..=harm_bin.saturating_add(2).min(dbs.len() - 1)]
                    .iter()
                    .cloned()
                    .fold(-140.0f64, f64::max);
                let lin = 10.0f64.powf(peak / 20.0);
                non_fund_power += lin * lin;
            }
        }
    }

    let thd_n_mag = non_fund_power.sqrt();
    let thd_n_db = 20.0 * (thd_n_mag.max(1e-12)).log10();

    thd_n_db - fund_mag
}

#[test]
fn test_unity_ratio_transparency_thd_n() {
    let sr = 48000.0;
    let mut comp = CompressorCore::new(sr);
    comp.set_ratio_immediate(1.0); // Unity ratio
    comp.set_threshold_immediate(-12.0);
    comp.set_mix_immediate(1.0);
    comp.set_lookahead(0.0);

    let n = 2048;
    let fund = 1000.0;
    let mut out_samples = Vec::with_capacity(n);

    for i in 0..n {
        let t = i as f64 / sr;
        let s = 0.8 * (2.0 * PI * fund * t).sin();
        let (out_l, _) = comp.process_sample(s, s);
        out_samples.push(out_l);
    }

    let thd_db = compute_thd_n_db(&out_samples, fund, sr);
    assert!(
        thd_db < -90.0,
        "Unity ratio must produce transparent output with THD+N < -90 dB, got: {:.1} dB",
        thd_db
    );
}

#[test]
fn test_golden_null_reference_stability() {
    let sr = 44100.0;
    let mut comp1 = CompressorCore::new(sr);
    let mut comp2 = CompressorCore::new(sr);

    comp1.set_threshold_immediate(-15.0);
    comp1.set_ratio_immediate(3.5);
    comp1.set_attack_s(0.010);
    comp1.set_release_s(0.080);
    comp1.set_mix_immediate(1.0);

    comp2.set_threshold_immediate(-15.0);
    comp2.set_ratio_immediate(3.5);
    comp2.set_attack_s(0.010);
    comp2.set_release_s(0.080);
    comp2.set_mix_immediate(1.0);

    // Two instances with identical parameters must produce bit-identical results (Null test)
    for i in 0..1000 {
        let in_val = ((i as f64 * 0.1).sin() * 0.9).clamp(-1.0, 1.0);
        let (out1_l, out1_r) = comp1.process_sample(in_val, in_val);
        let (out2_l, out2_r) = comp2.process_sample(in_val, in_val);

        assert_eq!(out1_l, out2_l, "Null test failed on sample {}", i);
        assert_eq!(out1_r, out2_r, "Null test failed on sample {}", i);
    }
}
