//! CLI debug harness and CPU benchmark tool for SonoDS Saturator DSP core.

use sat_core::{Character, Quality, SaturatorChannel};
use std::env;
use std::f64::consts::PI;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::time::Instant;

fn write_wav_header(w: &mut impl Write, num_samples: usize, sample_rate: u32, num_channels: u16) -> std::io::Result<()> {
    let byte_rate = sample_rate * num_channels as u32 * 2;
    let block_align = num_channels * 2;
    let data_chunk_size = (num_samples * num_channels as usize * 2) as u32;
    let file_size = 36 + data_chunk_size;

    w.write_all(b"RIFF")?;
    w.write_all(&file_size.to_le_bytes())?;
    w.write_all(b"WAVE")?;
    w.write_all(b"fmt ")?;
    w.write_all(&16u32.to_le_bytes())?; // Subchunk1Size (16 for PCM)
    w.write_all(&1u16.to_le_bytes())?;  // AudioFormat (1 = PCM)
    w.write_all(&num_channels.to_le_bytes())?;
    w.write_all(&sample_rate.to_le_bytes())?;
    w.write_all(&byte_rate.to_le_bytes())?;
    w.write_all(&block_align.to_le_bytes())?;
    w.write_all(&16u16.to_le_bytes())?; // BitsPerSample
    w.write_all(b"data")?;
    w.write_all(&data_chunk_size.to_le_bytes())?;
    Ok(())
}

fn run_benchmark() {
    println!("==================================================");
    println!(" SonoDS Saturator DSP — Real-Time CPU Benchmark ");
    println!("==================================================");

    let sample_rate: f64 = 48000.0;
    let block_size = 128;
    let num_blocks = 20000;

    let mut left = SaturatorChannel::new(sample_rate);
    let mut right = SaturatorChannel::new(sample_rate);

    left.snap_character(Character::Tape);
    right.snap_character(Character::Tape);
    left.quality = Quality::Standard; // 2x oversampling + ADAA2 per spec
    right.quality = Quality::Standard;
    left.drive_param.snap_to(0.75);
    right.drive_param.snap_to(0.75);
    left.tone_param.snap_to(3.0);
    right.tone_param.snap_to(3.0);

    // Realistic DAW L1 cache buffer
    let mut ref_block_l = [0.0f64; 128];
    let mut ref_block_r = [0.0f64; 128];
    for i in 0..128 {
        let t = i as f64 / sample_rate;
        ref_block_l[i] = (2.0 * PI * 440.0 * t).sin() * 0.7;
        ref_block_r[i] = (2.0 * PI * 880.0 * t).sin() * 0.7;
    }

    let mut block_l = ref_block_l;
    let mut block_r = ref_block_r;

    // Warm-up
    for _ in 0..500 {
        block_l.copy_from_slice(&ref_block_l);
        block_r.copy_from_slice(&ref_block_r);
        left.process_block(&mut block_l);
        right.process_block(&mut block_r);
    }

    let start = Instant::now();
    for _ in 0..num_blocks {
        block_l.copy_from_slice(&ref_block_l);
        block_r.copy_from_slice(&ref_block_r);
        left.process_block(&mut block_l);
        right.process_block(&mut block_r);
    }
    let elapsed = start.elapsed();

    let total_audio_duration_sec = (num_blocks * block_size) as f64 / sample_rate;
    let elapsed_sec = elapsed.as_secs_f64();
    let per_block_us = (elapsed_sec / num_blocks as f64) * 1_000_000.0;
    let deadline_us = (block_size as f64 / sample_rate) * 1_000_000.0;
    let per_channel_load_pct = (per_block_us / 2.0 / deadline_us) * 100.0;
    let stereo_total_load_pct = (per_block_us / deadline_us) * 100.0;

    println!("Audio Duration:    {:.2} s ({} blocks of {} samples)", total_audio_duration_sec, num_blocks, block_size);
    println!("Execution Time:    {:.4} s", elapsed_sec);
    println!("Per-Block Time:    {:.2} µs (Stereo 2-channel)", per_block_us);
    println!("Block Deadline:    {:.2} µs", deadline_us);
    println!("Per-Channel Load:  {:.3}% of real-time audio thread", per_channel_load_pct);
    println!("Stereo Total Load: {:.3}% of real-time audio thread", stereo_total_load_pct);
    println!("Target Ceiling:    < 0.500% (Task 1.11 / §1.6)");
    println!("==================================================");

    if per_channel_load_pct <= 0.50 {
        println!("PASSED: Benchmark is cleanly within the < 0.5% real-time audio budget!");
    } else {
        panic!("FAILED: Per-channel CPU load {:.3}% exceeded the 0.5% limit!", per_channel_load_pct);
    }
}

fn render_wav_sweep(filename: &str) {
    println!("Rendering 2-second logarithmic chirp sweep (20Hz - 20kHz) to {}...", filename);

    let sample_rate: f64 = 48000.0;
    let duration_sec: f64 = 2.0;
    let num_samples = (sample_rate * duration_sec) as usize;

    let mut left = SaturatorChannel::new(sample_rate);
    let mut right = SaturatorChannel::new(sample_rate);

    left.snap_character(Character::Tape);
    right.snap_character(Character::Tube);
    left.quality = Quality::Standard;
    right.quality = Quality::Standard;
    left.drive_param.snap_to(0.8);
    right.drive_param.snap_to(0.8);
    left.tone_param.snap_to(4.0);
    right.tone_param.snap_to(-2.0);

    let mut file = BufWriter::new(File::create(filename).expect("Failed to create WAV file"));
    write_wav_header(&mut file, num_samples, sample_rate as u32, 2).expect("Failed to write WAV header");

    let f0: f64 = 20.0;
    let f1: f64 = 20000.0;
    let k: f64 = (f1 / f0).powf(1.0 / duration_sec);

    let mut pcm_bytes = Vec::with_capacity(num_samples * 4);
    for i in 0..num_samples {
        let t = i as f64 / sample_rate;
        let phase = 2.0 * PI * f0 * (k.powf(t) - 1.0) / k.ln();
        let dry_sample = phase.sin() * 0.75;

        let out_l = left.process_sample(dry_sample);
        let out_r = right.process_sample(dry_sample);

        let i16_l = (out_l.clamp(-1.0, 1.0) * 32767.0) as i16;
        let i16_r = (out_r.clamp(-1.0, 1.0) * 32767.0) as i16;

        pcm_bytes.extend_from_slice(&i16_l.to_le_bytes());
        pcm_bytes.extend_from_slice(&i16_r.to_le_bytes());
    }

    file.write_all(&pcm_bytes).expect("Failed to write PCM data");
    println!("Successfully rendered {} (Stereo, 48kHz, 16-bit PCM).", filename);
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.iter().any(|arg| arg == "--bench") {
        run_benchmark();
    } else {
        render_wav_sweep("saturator_test_sweep.wav");
    }
}
