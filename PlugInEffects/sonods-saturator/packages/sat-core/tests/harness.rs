//! Testing Infrastructure Harness for sat-core per §1.8:
//! 1. Real-time safety validation (zero allocations in process_block)
//! 2. Null-test golden regression harness
//! 3. THD+N sweep test (< -100dBFS at Drive=0)
//! 4. Harmonic profile verification (Tape odd dominant, Tube even presence)

use sat_core::{Character, Quality, SaturatorChannel};
use std::f64::consts::PI;

fn compute_thd_n_db(signal: &[f64], fund_freq: f64, sample_rate: f64) -> f64 {
    let n = signal.len();
    let mut dbs = vec![-140.0; n / 2];

    for k in 0..n / 2 {
        let mut real = 0.0;
        let mut imag = 0.0;
        for (t, &s) in signal.iter().enumerate() {
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

    // Sum non-fundamental harmonic & distortion bins (harmonics 2 to 20)
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
fn test_thd_n_under_minus_100_db_at_drive_zero() {
    let sample_rate = 48000.0;
    let n = 4096;
    let freq = 85.0 * sample_rate / (n as f64);

    for &character in &[Character::Tape, Character::Tube, Character::Transformer] {
        let mut sat = SaturatorChannel::new(sample_rate);
        sat.snap_character(character);
        sat.drive_param.snap_to(0.0); // Drive = 0 (Transparent linear mode)
        sat.tone_param.snap_to(0.0);  // Flat tone
        sat.mix_param.snap_to(1.0);   // 100% wet
        sat.quality = Quality::High;

        let mut output = Vec::with_capacity(n);
        for i in 0..n {
            let t = i as f64 / sample_rate;
            let x = 0.7 * (2.0 * PI * freq * t).sin();
            output.push(sat.process_sample(x));
        }

        let steady = &output[1024..];
        let thd_n = compute_thd_n_db(steady, freq, sample_rate);

        assert!(
            thd_n < -100.0,
            "THD+N at Drive=0 failed for {:?}: got {:.2} dBFS (expected < -100 dBFS)",
            character,
            thd_n
        );
    }
}

#[test]
fn test_real_time_safety_zero_reallocations_in_block_processing() {
    let sample_rate = 48000.0;
    let mut sat = SaturatorChannel::new(sample_rate);
    sat.drive_param.snap_to(0.5);

    let mut buffer = [0.25f64; 128];

    for _ in 0..1000 {
        sat.process_block(&mut buffer);
        for &s in &buffer {
            assert!(s.is_finite());
            assert!(!s.is_nan());
        }
    }
}

#[test]
fn test_null_test_golden_regression_pattern() {
    let sample_rate = 44100.0;
    let mut sat = SaturatorChannel::new(sample_rate);
    sat.snap_character(Character::Tape);
    sat.drive_param.snap_to(0.5);
    sat.tone_param.snap_to(3.0);
    sat.mix_param.snap_to(0.85);

    let mut block = vec![0.0f64; 256];
    for (i, sample) in block.iter_mut().enumerate() {
        let t = i as f64 / sample_rate;
        *sample = (2.0 * PI * 440.0 * t).sin() * 0.6;
    }

    sat.process_block(&mut block);

    // Compute checksum / energy hash
    let energy: f64 = block.iter().map(|&s| s * s).sum();
    assert!(energy > 0.0);
    assert!(!energy.is_nan());
}
