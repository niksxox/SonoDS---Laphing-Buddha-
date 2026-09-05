/// Multiband Stereo Imager Core DSP Engine.
///
/// Combines LR4 crossover network with per-band width controls and mono-safe bass defaults.
/// Ships with default configuration:
///   - 4 bands
///   - Crossover cutoffs: 140 Hz, 1500 Hz, 6000 Hz
///   - Band 0 (Bass <140Hz) default width = 0.0 (Mono-safe bx_control philosophy)
///   - Band 1, 2, 3 default width = 1.0 (Unity/Unchanged)

use crate::correlation::CorrelationMeter;
use crate::crossover::MultibandCrossover;
use crate::width::apply_width_sample;

/// Default crossover frequency cutoffs in Hz.
pub const DEFAULT_CROSSOVERS: [f32; 3] = [140.0, 1500.0, 6000.0];

/// Default per-band widths (Band 0 is mono-safe 0.0).
pub const DEFAULT_BAND_WIDTHS: [f32; 4] = [0.0, 1.0, 1.0, 1.0];

#[derive(Debug, Clone)]
pub struct MultibandImager {
    sample_rate: f32,
    crossover_l: MultibandCrossover,
    crossover_r: MultibandCrossover,
    band_widths: [f32; 4],
    band_meters: Vec<CorrelationMeter>,
    overall_meter: CorrelationMeter,
}

impl MultibandImager {
    pub fn new(sample_rate: f32) -> Self {
        let crossover_l = MultibandCrossover::new(sample_rate);
        let crossover_r = MultibandCrossover::new(sample_rate);
        let band_meters = vec![CorrelationMeter::new(sample_rate, 0.3); 4];
        let overall_meter = CorrelationMeter::new(sample_rate, 0.3);

        Self {
            sample_rate,
            crossover_l,
            crossover_r,
            band_widths: DEFAULT_BAND_WIDTHS,
            band_meters,
            overall_meter,
        }
    }

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    pub fn num_bands(&self) -> usize {
        self.crossover_l.num_bands()
    }

    pub fn set_num_bands(&mut self, num_bands: usize) {
        let num = num_bands.clamp(1, 4);
        self.crossover_l.set_num_bands(num);
        self.crossover_r.set_num_bands(num);
    }

    pub fn crossovers(&self) -> &[f32; 3] {
        self.crossover_l.crossovers()
    }

    pub fn set_crossovers(&mut self, f1: f32, f2: f32, f3: f32) {
        self.crossover_l.set_crossovers(f1, f2, f3);
        self.crossover_r.set_crossovers(f1, f2, f3);
    }

    pub fn band_widths(&self) -> &[f32; 4] {
        &self.band_widths
    }

    pub fn set_band_width(&mut self, band: usize, width: f32) {
        if band < 4 {
            self.band_widths[band] = width.clamp(0.0, 2.0);
        }
    }

    pub fn set_all_band_widths(&mut self, widths: [f32; 4]) {
        for i in 0..4 {
            self.band_widths[i] = widths[i].clamp(0.0, 2.0);
        }
    }

    pub fn reset(&mut self) {
        self.crossover_l.reset();
        self.crossover_r.reset();
        for meter in &mut self.band_meters {
            meter.reset();
        }
        self.overall_meter.reset();
    }

    /// Process a single sample pair (Left, Right) and update telemetry meters.
    #[inline]
    pub fn process_sample(&mut self, left: f32, right: f32) -> (f32, f32) {
        let num_bands = self.num_bands();

        let mut l_bands = [0.0f32; 4];
        let mut r_bands = [0.0f32; 4];

        self.crossover_l.process_sample(left, &mut l_bands);
        self.crossover_r.process_sample(right, &mut r_bands);

        let mut l_out_sum = 0.0f32;
        let mut r_out_sum = 0.0f32;

        for b in 0..num_bands {
            let width = self.band_widths[b];
            let (l_processed, r_processed) = apply_width_sample(l_bands[b], r_bands[b], width);

            self.band_meters[b].process_sample(l_processed, r_processed);

            l_out_sum += l_processed;
            r_out_sum += r_processed;
        }

        self.overall_meter.process_sample(l_out_sum, r_out_sum);

        (l_out_sum, r_out_sum)
    }

    /// Process stereo sample buffers in place.
    pub fn process_buffers(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        for i in 0..len {
            let (l_out, r_out) = self.process_sample(left[i], right[i]);
            left[i] = l_out;
            right[i] = r_out;
        }
    }

    /// Get current phase correlation for a specific band.
    pub fn band_correlation(&self, band: usize) -> f32 {
        if band < self.band_meters.len() {
            self.band_meters[band].correlation()
        } else {
            1.0
        }
    }

    /// Get overall output phase correlation.
    pub fn overall_correlation(&self) -> f32 {
        self.overall_meter.correlation()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn test_shipped_default_preset_bass_mono_safety() {
        let sample_rate = 44100.0;
        let mut imager = MultibandImager::new(sample_rate);

        // Confirm shipped defaults
        assert_eq!(*imager.band_widths(), DEFAULT_BAND_WIDTHS);
        assert_eq!(imager.band_widths()[0], 0.0); // Low band mono safe
        assert_eq!(imager.band_widths()[1], 1.0);
        assert_eq!(imager.band_widths()[2], 1.0);
        assert_eq!(imager.band_widths()[3], 1.0);

        // Run wide stereo low-frequency bass signal (50 Hz with wide stereo phase separation)
        let len = 44100;
        let mut left = vec![0.0f32; len];
        let mut right = vec![0.0f32; len];

        for i in 0..len {
            let t = i as f32 / sample_rate;
            left[i] = (2.0 * PI * 50.0 * t).sin();
            right[i] = (2.0 * PI * 50.0 * t + 1.2).sin(); // Phase offset = wide stereo bass
        }

        imager.process_buffers(&mut left, &mut right);

        // Band 0 (bass < 140Hz) correlation must be ≈ +1.0 (perfectly mono)
        let bass_corr = imager.band_correlation(0);
        assert!(
            (bass_corr - 1.0).abs() < 0.01,
            "Default bass band correlation was {}, expected +1.0 (mono safe)",
            bass_corr
        );
    }

    #[test]
    fn test_per_band_width_independence() {
        let sample_rate = 44100.0;
        let mut imager = MultibandImager::new(sample_rate);
        imager.set_crossovers(150.0, 1500.0, 6000.0);

        // Generate test signal with independent bass (60Hz) and mid (800Hz) stereo components
        let len = 44100;
        let mut l_in = vec![0.0f32; len];
        let mut r_in = vec![0.0f32; len];

        for i in 0..len {
            let t = i as f32 / sample_rate;
            let bass_l = (2.0 * PI * 60.0 * t).sin();
            let bass_r = (2.0 * PI * 60.0 * t + 1.0).sin();

            let mid_l = (2.0 * PI * 800.0 * t).sin();
            let mid_r = (2.0 * PI * 800.0 * t + 1.0).sin();

            l_in[i] = bass_l + mid_l;
            r_in[i] = bass_r + mid_r;
        }

        // Test 1: Band 0 (Bass) width = 0.0 (Mono), Band 1 (Mid) width = 1.8 (Wide)
        imager.set_band_width(0, 0.0);
        imager.set_band_width(1, 1.8);

        let mut l_1 = l_in.clone();
        let mut r_1 = r_in.clone();
        imager.process_buffers(&mut l_1, &mut r_1);

        let bass_corr_1 = imager.band_correlation(0);
        let mid_corr_1 = imager.band_correlation(1);

        assert!((bass_corr_1 - 1.0).abs() < 0.01, "Bass correlation was not mono");

        // Test 2: Change Band 0 (Bass) width to 1.5 while keeping Band 1 width constant
        imager.reset();
        imager.set_band_width(0, 1.5);
        imager.set_band_width(1, 1.8);

        let mut l_2 = l_in.clone();
        let mut r_2 = r_in.clone();
        imager.process_buffers(&mut l_2, &mut r_2);

        let bass_corr_2 = imager.band_correlation(0);
        let mid_corr_2 = imager.band_correlation(1);

        // Changing Band 0 width changed Band 0 correlation, while Band 1 correlation remained identical
        assert!(bass_corr_2 < bass_corr_1, "Bass correlation did not decrease when widened");
        assert!((mid_corr_2 - mid_corr_1).abs() < 0.02, "Mid band correlation was affected by bass band change");
    }
}
