use dsp_core::multiband_imager::MultibandImager;
use std::time::Instant;

#[test]
fn bench_multiband_imager_processing_performance() {
    let mut imager = MultibandImager::new(44100.0);
    imager.set_crossovers(140.0, 1500.0, 6000.0);
    imager.set_all_band_widths([0.0, 1.2, 1.5, 0.8]);

    let num_blocks = 10000;
    let block_size = 128;
    let mut left = vec![0.5f32; block_size];
    let mut right = vec![-0.2f32; block_size];

    let start = Instant::now();

    for _ in 0..num_blocks {
        for i in 0..block_size {
            let (out_l, out_r) = imager.process_sample(left[i], right[i]);
            left[i] = out_l;
            right[i] = out_r;
        }
    }

    let elapsed = start.elapsed();
    let nanos_per_block = elapsed.as_nanos() as f64 / num_blocks as f64;
    let micros_per_block = nanos_per_block / 1000.0;

    println!(
        "\n--- DSP Core Performance Benchmark ---\nTotal time for {} blocks ({:.2}s audio @ 44.1kHz): {:?}\nAverage processing time per 128-sample block: {:.3} µs\n--------------------------------------",
        num_blocks,
        (num_blocks * block_size) as f64 / 44100.0,
        elapsed,
        micros_per_block
    );

    // Acceptance Check: A 128-sample audio block at 44.1kHz lasts ~2900 µs (2.9ms).
    // Processing time must be under 50 µs per block (< 1.7% CPU load).
    assert!(
        micros_per_block < 50.0,
        "DSP processing per block took {:.3} µs, exceeding performance threshold",
        micros_per_block
    );
}
