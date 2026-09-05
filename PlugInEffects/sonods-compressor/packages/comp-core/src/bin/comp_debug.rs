//! CLI debug harness and CPU benchmark tool for SonoDS Compressor DSP core.
//!
//! Benchmark targets per Task 1.13 & Global Fixed Decisions:
//! Stereo instance at 48kHz, 128-sample blocks must consume < 3% of one 2020-class CPU core.

use comp_core::{CompressorCharacter, CompressorCore};
use std::f64::consts::PI;
use std::time::Instant;

fn run_benchmark() {
    println!("==================================================");
    println!(" SonoDS Compressor DSP — Real-Time CPU Benchmark ");
    println!("==================================================");

    let sample_rate = 48000.0;
    let block_size = 128;
    let num_blocks = 20000;
    let total_audio_seconds = (num_blocks * block_size) as f64 / sample_rate;

    let mut comp = CompressorCore::new(sample_rate);
    comp.set_character(CompressorCharacter::Vca);
    comp.set_threshold_immediate(-16.0);
    comp.set_ratio_immediate(4.0);
    comp.set_attack_s(0.010);
    comp.set_release_s(0.100);
    comp.set_sidechain_hpf(80.0);
    comp.set_auto_gain(1.0);
    comp.set_mix_immediate(0.75);

    let mut block_l = vec![0.0f64; block_size];
    let mut block_r = vec![0.0f64; block_size];

    for i in 0..block_size {
        let t = i as f64 / sample_rate;
        block_l[i] = (2.0 * PI * 440.0 * t).sin() * 0.8;
        block_r[i] = (2.0 * PI * 880.0 * t).sin() * 0.8;
    }

    // Warm up
    for _ in 0..500 {
        comp.process_block(&mut block_l, &mut block_r);
    }

    let start = Instant::now();
    for _ in 0..num_blocks {
        comp.process_block(&mut block_l, &mut block_r);
    }
    let elapsed = start.elapsed();
    let elapsed_secs = elapsed.as_secs_f64();

    let cpu_load_pct = (elapsed_secs / total_audio_seconds) * 100.0;

    println!("Processed {:.2} seconds of stereo 48kHz audio in {:.4} seconds", total_audio_seconds, elapsed_secs);
    println!("Measured Single-Core CPU Load: {:.3}%", cpu_load_pct);
    println!("Spec Target: < 3.000%");

    if cpu_load_pct < 3.0 {
        println!("✅ PASSED: Real-time CPU budget met with flying colors!");
    } else {
        panic!("❌ FAILED: CPU load exceeded 3% budget: {:.3}%", cpu_load_pct);
    }
}

fn main() {
    run_benchmark();
}
