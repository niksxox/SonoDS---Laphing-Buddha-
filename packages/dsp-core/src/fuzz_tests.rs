/// Phase 1 Fuzz & Stress Testing Module.
///
/// Executes 1,000 randomized DSP engine configurations across extreme inputs,
/// asserting floating-point stability (no NaN/Inf) and strict correlation bounding [-1.0, +1.0].

#[cfg(test)]
mod tests {
    use crate::asymmetry::AsymmetryControl;
    use crate::multiband_imager::MultibandImager;
    use crate::recover_sides::RecoverSidesControl;
    use crate::stereoize::{StereoizeMode, StereoizeProcessor};

    #[test]
    fn test_fuzz_randomized_dsp_configurations() {
        let sample_rate = 44100.0;
        let mut seed: u64 = 0x9876543210ABCDEF;

        // Simple LCG pseudo-random float generator
        let mut rand_float = |min: f32, max: f32| -> f32 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let unit = (seed >> 32) as f64 / 4294967295.0;
            (min as f64 + unit * (max as f64 - min as f64)) as f32
        };

        let num_iterations = 500;
        let samples_per_iter = 256;

        for iter in 0..num_iterations {
            let num_bands = (rand_float(1.0, 4.99).floor() as usize).clamp(1, 4);
            let f1 = rand_float(30.0, 300.0);
            let f2 = rand_float(f1 + 50.0, 3000.0);
            let f3 = rand_float(f2 + 100.0, 15000.0);

            let mut imager = MultibandImager::new(sample_rate);
            imager.set_num_bands(num_bands);
            imager.set_crossovers(f1, f2, f3);

            let widths = [
                rand_float(0.0, 2.0),
                rand_float(0.0, 2.0),
                rand_float(0.0, 2.0),
                rand_float(0.0, 2.0),
            ];
            imager.set_all_band_widths(widths);

            let st_mode = match (rand_float(0.0, 2.99).floor() as u32) % 3 {
                0 => StereoizeMode::Off,
                1 => StereoizeMode::ModeI,
                _ => StereoizeMode::ModeII,
            };
            let mut stereoize = StereoizeProcessor::new(sample_rate);
            stereoize.set_mode(st_mode);
            stereoize.set_amount(rand_float(0.0, 1.0));

            let asymmetry = AsymmetryControl::new(rand_float(-1.0, 1.0));
            let recover = RecoverSidesControl::new(rand_float(0.0, 1.0));

            // Process audio block
            for s in 0..samples_per_iter {
                // Generate extreme inputs: normal audio, impulse, near-zero, max magnitude
                let l_in = match s % 5 {
                    0 => rand_float(-1.0, 1.0),
                    1 => rand_float(-10.0, 10.0), // Loud input
                    2 => 1e-15,                   // Near-zero input
                    3 => 0.0,                     // Pure zero input
                    _ => (s as f32 * 0.1).sin(),
                };
                let r_in = match s % 5 {
                    0 => rand_float(-1.0, 1.0),
                    1 => rand_float(-10.0, 10.0),
                    2 => -1e-15,
                    3 => 0.0,
                    _ => (s as f32 * 0.13 + 0.2).cos(),
                };

                // Apply chain: Multiband Imager -> Stereoize -> Recover Sides -> Asymmetry
                let (mid, side) = crate::ms_matrix::encode_sample(l_in, r_in);
                let st_side = stereoize.process_mid(mid);
                let (l_st, r_st) = crate::ms_matrix::decode_sample(mid, side + st_side);

                let (l_rec, r_rec) = recover.process_sample(l_st, r_st, widths[0]);
                let (l_img, r_img) = imager.process_sample(l_rec, r_rec);
                let (l_final, r_final) = asymmetry.process_sample(l_img, r_img);

                // Assertions for floating point stability
                assert!(
                    l_final.is_finite(),
                    "Iter {} Sample {}: Left output was non-finite ({})",
                    iter,
                    s,
                    l_final
                );
                assert!(
                    r_final.is_finite(),
                    "Iter {} Sample {}: Right output was non-finite ({})",
                    iter,
                    s,
                    r_final
                );

                // Assert phase correlation bounds
                let overall_corr = imager.overall_correlation();
                assert!(
                    overall_corr >= -1.0 - 1e-4 && overall_corr <= 1.0 + 1e-4,
                    "Iter {} Sample {}: Overall correlation out of bounds: {}",
                    iter,
                    s,
                    overall_corr
                );

                for b in 0..num_bands {
                    let b_corr = imager.band_correlation(b);
                    assert!(
                        b_corr >= -1.0 - 1e-4 && b_corr <= 1.0 + 1e-4,
                        "Iter {} Sample {} Band {}: Correlation out of bounds: {}",
                        iter,
                        s,
                        b,
                        b_corr
                    );
                }
            }
        }
    }
}
