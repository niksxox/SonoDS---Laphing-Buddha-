use crate::band::{Band, ProcessingMode};
use crate::coeffs::{CutSlope, Shape};
use crate::linear_phase::{design_linear_phase_fir, FirQuality};

pub const MAX_BANDS: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhaseMode {
    ZeroLatency,
    NaturalPhase,
    LinearPhase,
}

#[derive(Debug, Clone)]
pub struct EqEngine {
    pub bands: [Option<Band>; MAX_BANDS],
    pub sample_rate: f64,
    pub phase_mode: PhaseMode,
    pub fir_quality: FirQuality,

    // FIR buffers for Linear Phase mode
    fir_kernel: Vec<f64>,
    fir_history_l: Vec<f64>,
    fir_history_r: Vec<f64>,
    fir_pos: usize,
    fir_dirty: bool,

    pub latency_samples: u32,
}

impl EqEngine {
    pub fn new(sample_rate: f64) -> Self {
        let fir_quality = FirQuality::Medium;
        let taps = fir_quality.num_taps();
        Self {
            bands: Default::default(),
            sample_rate,
            phase_mode: PhaseMode::ZeroLatency,
            fir_quality,
            fir_kernel: vec![0.0; taps],
            fir_history_l: vec![0.0; taps],
            fir_history_r: vec![0.0; taps],
            fir_pos: 0,
            fir_dirty: true,
            latency_samples: 0,
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate;
        for band in self.bands.iter_mut().flatten() {
            band.recompute_coeffs(sample_rate);
        }
        self.fir_dirty = true;
    }

    pub fn set_phase_mode(&mut self, mode: PhaseMode) {
        self.phase_mode = mode;
        match mode {
            PhaseMode::ZeroLatency => {
                self.latency_samples = 0;
            }
            PhaseMode::NaturalPhase => {
                self.latency_samples = 0;
            }
            PhaseMode::LinearPhase => {
                let taps = self.fir_quality.num_taps();
                self.latency_samples = (taps / 2) as u32;
                self.fir_dirty = true;
            }
        }
    }

    pub fn set_fir_quality(&mut self, quality: FirQuality) {
        self.fir_quality = quality;
        let taps = quality.num_taps();
        self.fir_kernel = vec![0.0; taps];
        self.fir_history_l = vec![0.0; taps];
        self.fir_history_r = vec![0.0; taps];
        self.fir_pos = 0;
        self.fir_dirty = true;
        if self.phase_mode == PhaseMode::LinearPhase {
            self.latency_samples = (taps / 2) as u32;
        }
    }

    pub fn set_band(
        &mut self,
        index: usize,
        shape: Shape,
        freq: f64,
        gain: f64,
        q: f64,
        enabled: bool,
    ) {
        if index >= MAX_BANDS {
            return;
        }
        let sample_rate = self.sample_rate;
        if let Some(band) = &mut self.bands[index] {
            if band.shape != shape {
                band.shape = shape;
                band.recompute_coeffs(sample_rate);
            }
            band.freq.set_target(freq.clamp(10.0, sample_rate * 0.499));
            band.gain.set_target(gain.clamp(-30.0, 30.0));
            band.q.set_target(q.clamp(0.05, 40.0));
            band.set_enabled(enabled);
            band.update_dynamic_coefficients(sample_rate);
        } else {
            let mut band = Band::new(shape, freq, gain, q, sample_rate);
            band.set_enabled(enabled);
            self.bands[index] = Some(band);
        }
        self.fir_dirty = true;
    }

    pub fn snap_band(
        &mut self,
        index: usize,
        shape: Shape,
        freq: f64,
        gain: f64,
        q: f64,
        enabled: bool,
    ) {
        if index >= MAX_BANDS {
            return;
        }
        let sample_rate = self.sample_rate;
        if let Some(band) = &mut self.bands[index] {
            band.snap_to(shape, freq, gain, q, enabled, sample_rate);
        } else {
            let mut band = Band::new(shape, freq, gain, q, sample_rate);
            band.set_enabled(enabled);
            self.bands[index] = Some(band);
        }
        self.fir_dirty = true;
    }

    pub fn clear_bands(&mut self) {
        for band in self.bands.iter_mut() {
            *band = None;
        }
        self.fir_dirty = true;
    }

    pub fn remove_band(&mut self, index: usize) {
        if index < MAX_BANDS {
            self.bands[index] = None;
            self.fir_dirty = true;
        }
    }

    pub fn set_band_param(&mut self, index: usize, param_id: u32, value: f64) {
        if index >= MAX_BANDS {
            return;
        }
        let sample_rate = self.sample_rate;
        if self.bands[index].is_none() {
            // Auto-create bell band if not present
            self.bands[index] = Some(Band::new(
                Shape::Bell,
                1000.0,
                0.0,
                1.0,
                sample_rate,
            ));
        }

        if let Some(band) = &mut self.bands[index] {
            match param_id {
                0 => {
                    // Freq
                    band.freq.set_target(value.clamp(10.0, sample_rate * 0.499));
                    band.update_dynamic_coefficients(sample_rate);
                }
                1 => {
                    // Gain
                    band.gain.set_target(value.clamp(-30.0, 30.0));
                }
                2 => {
                    // Q
                    band.q.set_target(value.clamp(0.05, 40.0));
                }
                3 => {
                    // Shape
                    let shape = match value as u32 {
                        0 => Shape::Bell,
                        1 => Shape::LowShelf,
                        2 => Shape::HighShelf,
                        3 => Shape::LowCut,
                        4 => Shape::HighCut,
                        _ => Shape::Bell,
                    };
                    if band.shape != shape {
                        band.shape = shape;
                        band.recompute_coeffs(sample_rate);
                    }
                }
                4 => {
                    // Cut slope
                    let new_slope = CutSlope::from_db_per_oct(value as i32);
                    if band.cut_slope != new_slope {
                        band.cut_slope = new_slope;
                        band.recompute_coeffs(sample_rate);
                    }
                }
                5 => {
                    // Enabled
                    band.set_enabled(value > 0.5);
                }
                6 => {
                    // Mode
                    band.mode = match value as u32 {
                        0 => ProcessingMode::Stereo,
                        1 => ProcessingMode::Mid,
                        2 => ProcessingMode::Side,
                        3 => ProcessingMode::Left,
                        4 => ProcessingMode::Right,
                        _ => ProcessingMode::Stereo,
                    };
                }
                7 => {
                    // Dynamic enabled
                    band.dynamic_enabled = value > 0.5;
                }
                8 => {
                    // Dynamic threshold
                    band.dynamic_threshold_db = value;
                }
                9 => {
                    // Dynamic range
                    band.dynamic_range_db = value;
                }
                _ => {}
            }
        }
        self.fir_dirty = true;
    }

    /// Update FIR kernel for linear phase mode if parameters changed
    fn update_fir_kernel_if_needed(&mut self) {
        if !self.fir_dirty || self.phase_mode != PhaseMode::LinearPhase {
            return;
        }

        let sample_rate = self.sample_rate;
        let taps = self.fir_quality.num_taps();

        // Create target magnitude function capturing all active bands
        let kernel = design_linear_phase_fir(
            |f| {
                let mut sum_db = 0.0;
                for band in self.bands.iter().flatten() {
                    sum_db += band.magnitude_db(f, sample_rate);
                }
                sum_db
            },
            sample_rate,
            taps,
        );

        self.fir_kernel = kernel;
        self.fir_dirty = false;
    }

    /// Process a block of stereo audio samples in-place
    pub fn process_block(&mut self, left: &mut [f32], right: &mut [f32]) {
        let num_samples = left.len().min(right.len());
        let sample_rate = self.sample_rate;

        match self.phase_mode {
            PhaseMode::ZeroLatency | PhaseMode::NaturalPhase => {
                // IIR cascade processing (zero heap allocation in hot path)
                for i in 0..num_samples {
                    // Advance parameter smoothing per-sample for click-free transitions
                    for band in self.bands.iter_mut().flatten() {
                        band.tick_smoothing(sample_rate);
                    }

                    let mut l = left[i] as f64;
                    let mut r = right[i] as f64;

                    for band in self.bands.iter_mut().flatten() {
                        let (out_l, out_r) = band.process_sample_stereo(l, r);
                        l = out_l;
                        r = out_r;
                    }

                    left[i] = l as f32;
                    right[i] = r as f32;
                }
            }
            PhaseMode::LinearPhase => {
                // FIR kernel redesign is inherently block-based; smooth once per block
                for band in self.bands.iter_mut().flatten() {
                    band.tick_smoothing(sample_rate);
                }

                self.update_fir_kernel_if_needed();
                let taps = self.fir_kernel.len();

                for i in 0..num_samples {
                    self.fir_history_l[self.fir_pos] = left[i] as f64;
                    self.fir_history_r[self.fir_pos] = right[i] as f64;

                    let mut out_l = 0.0;
                    let mut out_r = 0.0;

                    let mut idx = self.fir_pos;
                    for k in 0..taps {
                        let h = self.fir_kernel[k];
                        out_l += h * self.fir_history_l[idx];
                        out_r += h * self.fir_history_r[idx];
                        if idx == 0 {
                            idx = taps - 1;
                        } else {
                            idx -= 1;
                        }
                    }

                    left[i] = out_l as f32;
                    right[i] = out_r as f32;

                    self.fir_pos = (self.fir_pos + 1) % taps;
                }
            }
        }
    }

    /// Combined magnitude response in dB across all active bands at given frequencies
    pub fn magnitude_response_db(&self, freqs_hz: &[f64]) -> Vec<f64> {
        let sample_rate = self.sample_rate;
        freqs_hz
            .iter()
            .map(|&f| {
                let mut sum_db = 0.0;
                for band in self.bands.iter().flatten() {
                    sum_db += band.magnitude_db(f, sample_rate);
                }
                sum_db
            })
            .collect()
    }

    /// Per-band magnitude response for ghost curves
    pub fn band_magnitude_response_db(&self, band_index: usize, freqs_hz: &[f64]) -> Vec<f64> {
        let sample_rate = self.sample_rate;
        if let Some(Some(band)) = self.bands.get(band_index) {
            freqs_hz
                .iter()
                .map(|&f| band.magnitude_db(f, sample_rate))
                .collect()
        } else {
            vec![0.0; freqs_hz.len()]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sine_wave_through_bell_filter_matches_expected_gain() {
        let sample_rate = 48000.0;
        let mut engine = EqEngine::new(sample_rate);
        engine.set_band(0, Shape::Bell, 1000.0, 6.0, 1.0, true);

        let freq = 1000.0;
        let block_size = 4800;
        let mut sample_idx = 0usize;
        let mut left = vec![0.0f32; block_size];
        let mut right = vec![0.0f32; block_size];

        // Process several blocks with continuous phase so smoothed parameters settle
        for _ in 0..10 {
            for i in 0..block_size {
                let t = (sample_idx + i) as f64 / sample_rate;
                let s = (2.0 * std::f64::consts::PI * freq * t).sin() as f32;
                left[i] = s;
                right[i] = s;
            }
            sample_idx += block_size;
            engine.process_block(&mut left, &mut right);
        }

        let rms_out: f64 = (left.iter().map(|&x| (x as f64).powi(2)).sum::<f64>()
            / (block_size as f64))
            .sqrt();
        let rms_in: f64 = (0.5f64).sqrt(); // RMS of pure sine peak 1.0 is ~0.707

        let actual_gain_db = 20.0 * (rms_out / rms_in).log10();
        assert!(
            (actual_gain_db - 6.0).abs() < 0.2,
            "Sine wave RMS gain: expected ~6.0 dB, got {:.2} dB",
            actual_gain_db
        );
    }

    #[test]
    fn denormal_flushing_under_silence_then_impulse() {
        let sample_rate = 48000.0;
        let mut engine = EqEngine::new(sample_rate);
        engine.set_band(0, Shape::Bell, 100.0, 12.0, 20.0, true);

        let mut silence_l = vec![0.0f32; 48000];
        let mut silence_r = vec![0.0f32; 48000];
        engine.process_block(&mut silence_l, &mut silence_r);

        let band = engine.bands[0].as_ref().unwrap();
        assert_eq!(band.biquad_l.z1, 0.0);
        assert_eq!(band.biquad_l.z2, 0.0);
        assert!(!band.biquad_l.z1.is_subnormal());
        assert!(!band.biquad_l.z2.is_subnormal());

        // Single impulse
        let mut impulse_l = vec![0.0f32; 512];
        let mut impulse_r = vec![0.0f32; 512];
        impulse_l[0] = 1.0;
        impulse_r[0] = 1.0;
        engine.process_block(&mut impulse_l, &mut impulse_r);
        assert!(impulse_l[0] > 0.0);
    }

    #[test]
    fn linear_phase_fir_mode_latency_and_filtering() {
        let sample_rate = 48000.0;
        let mut engine = EqEngine::new(sample_rate);
        engine.set_band(0, Shape::Bell, 1000.0, 6.0, 1.0, true);
        engine.set_phase_mode(PhaseMode::LinearPhase);

        // Latency must match half FIR kernel length
        assert_eq!(engine.latency_samples, 512); // Medium preset is 1024 taps

        let block_size = 1024;
        let mut left = vec![1.0f32; block_size];
        let mut right = vec![1.0f32; block_size];
        engine.process_block(&mut left, &mut right);

        // Verify FIR processed non-zero samples
        assert!(left.iter().any(|&x| (x - 1.0).abs() > 1e-4));
    }

    #[test]
    fn dynamic_eq_envelope_gain_compression() {
        let sample_rate = 48000.0;
        let mut engine = EqEngine::new(sample_rate);
        engine.set_band(0, Shape::Bell, 1000.0, 0.0, 1.0, true);
        engine.set_band_param(0, 7, 1.0); // DynamicEnabled = true
        engine.set_band_param(0, 8, -20.0); // DynamicThreshold = -20 dB
        engine.set_band_param(0, 9, -6.0); // DynamicRange = -6 dB (compression)

        let block_size = 4800;
        let mut left = vec![0.8f32; block_size]; // Loud input signal (~ -2 dB)
        let mut right = vec![0.8f32; block_size];

        engine.process_block(&mut left, &mut right);

        let band = engine.bands[0].as_ref().unwrap();
        // Dynamic gain offset must have moved in the negative/compress direction
        assert!(band.dynamic_gain_offset < -0.5);
    }

    #[test]
    fn mid_side_processing_mode_isolation() {
        let sample_rate = 48000.0;
        let mut engine = EqEngine::new(sample_rate);
        // Boost 1000 Hz by +12 dB only on Mid channel
        engine.set_band(0, Shape::Bell, 1000.0, 12.0, 2.0, true);
        engine.set_band_param(0, 6, ProcessingMode::Mid as usize as f64);

        let block_size = 2048;
        // Pure Side signal (L = 1.0, R = -1.0) -> Mid = (L+R)/2 = 0
        let mut left_side = vec![0.5f32; block_size];
        let mut right_side = vec![-0.5f32; block_size];

        engine.process_block(&mut left_side, &mut right_side);

        // Side signal should pass completely unaltered through Mid EQ
        for i in (block_size / 2)..block_size {
            assert!((left_side[i] - 0.5).abs() < 1e-3);
            assert!((right_side[i] - (-0.5)).abs() < 1e-3);
        }
    }
}
