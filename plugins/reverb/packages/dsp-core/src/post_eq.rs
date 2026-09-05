// SonoDS Reverb - Post EQ Module
// Task 1.11: 6-band parametric Post EQ shaping wet reverb signal output.

use crate::biquad::{Biquad, FilterType};

pub const POST_EQ_BANDS: usize = 6;

#[derive(Debug, Clone, Copy)]
pub struct PostEqBandConfig {
    pub enabled: bool,
    pub filter_type: FilterType,
    pub freq_hz: f32,
    pub gain_db: f32,
    pub q: f32,
}

impl Default for PostEqBandConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            filter_type: FilterType::Bell,
            freq_hz: 1000.0,
            gain_db: 0.0,
            q: 1.0,
        }
    }
}

pub struct PostEq {
    bands_l: [Biquad; POST_EQ_BANDS],
    bands_r: [Biquad; POST_EQ_BANDS],
    configs: [PostEqBandConfig; POST_EQ_BANDS],
    sample_rate: f32,
}

impl PostEq {
    pub fn new(sample_rate: f32) -> Self {
        let configs = [
            PostEqBandConfig {
                enabled: true,
                filter_type: FilterType::LowShelf,
                freq_hz: 80.0,
                gain_db: 0.0,
                q: 0.707,
            },
            PostEqBandConfig {
                enabled: true,
                filter_type: FilterType::Bell,
                freq_hz: 250.0,
                gain_db: 0.0,
                q: 1.0,
            },
            PostEqBandConfig {
                enabled: true,
                filter_type: FilterType::Bell,
                freq_hz: 800.0,
                gain_db: 0.0,
                q: 1.0,
            },
            PostEqBandConfig {
                enabled: true,
                filter_type: FilterType::Bell,
                freq_hz: 2500.0,
                gain_db: 0.0,
                q: 1.0,
            },
            PostEqBandConfig {
                enabled: true,
                filter_type: FilterType::Bell,
                freq_hz: 6000.0,
                gain_db: 0.0,
                q: 1.0,
            },
            PostEqBandConfig {
                enabled: true,
                filter_type: FilterType::HighShelf,
                freq_hz: 12000.0,
                gain_db: 0.0,
                q: 0.707,
            },
        ];

        let bands_l = core::array::from_fn(|i| {
            let c = &configs[i];
            let mut b = Biquad::new();
            b.configure(c.filter_type, c.freq_hz, c.gain_db, c.q, sample_rate);
            b
        });

        let bands_r = core::array::from_fn(|i| {
            let c = &configs[i];
            let mut b = Biquad::new();
            b.configure(c.filter_type, c.freq_hz, c.gain_db, c.q, sample_rate);
            b
        });

        Self {
            bands_l,
            bands_r,
            configs,
            sample_rate,
        }
    }

    /// Set parameters for a specific band (0 to 5).
    pub fn set_band(
        &mut self,
        band_idx: usize,
        enabled: bool,
        filter_type: FilterType,
        freq_hz: f32,
        gain_db: f32,
        q: f32,
    ) {
        if band_idx >= POST_EQ_BANDS {
            return;
        }

        let config = PostEqBandConfig {
            enabled,
            filter_type,
            freq_hz: freq_hz.clamp(10.0, 22000.0),
            gain_db: gain_db.clamp(-24.0, 24.0),
            q: q.clamp(0.1, 10.0),
        };

        self.configs[band_idx] = config;

        self.bands_l[band_idx].configure(config.filter_type, config.freq_hz, config.gain_db, config.q, self.sample_rate);
        self.bands_r[band_idx].configure(config.filter_type, config.freq_hz, config.gain_db, config.q, self.sample_rate);
    }

    pub fn get_band(&self, band_idx: usize) -> Option<&PostEqBandConfig> {
        self.configs.get(band_idx)
    }

    /// Compute total magnitude response at a given frequency in dB (for curve rendering).
    pub fn magnitude_db_at(&self, freq_hz: f32) -> f32 {
        let mut total_db = 0.0f32;
        for i in 0..POST_EQ_BANDS {
            if self.configs[i].enabled {
                let mag_linear = self.bands_l[i].magnitude_at(freq_hz, self.sample_rate);
                if mag_linear > 1e-6 {
                    total_db += 20.0 * mag_linear.log10();
                }
            }
        }
        total_db
    }

    /// Process a stereo wet sample pair through the 6-band EQ cascade.
    #[inline]
    pub fn process(&mut self, wet_l: f32, wet_r: f32) -> (f32, f32) {
        let mut out_l = wet_l;
        let mut out_r = wet_r;

        for i in 0..POST_EQ_BANDS {
            if self.configs[i].enabled {
                out_l = self.bands_l[i].process(out_l);
                out_r = self.bands_r[i].process(out_r);
            }
        }

        (out_l, out_r)
    }

    pub fn reset(&mut self) {
        for b in &mut self.bands_l {
            b.reset();
        }
        for b in &mut self.bands_r {
            b.reset();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn test_post_eq_high_shelf_attenuation() {
        let sample_rate = 44100.0;
        let mut post_eq = PostEq::new(sample_rate);

        // Set band 5 (High Shelf) to -24 dB gain at 5 kHz corner
        post_eq.set_band(5, true, FilterType::HighShelf, 5000.0, -24.0, 0.707);

        // Generate 15 kHz sine wave (well inside high shelf stopband)
        let freq = 15000.0;
        let mut max_input = 0.0f32;
        let mut max_output = 0.0f32;

        for i in 0..1000 {
            let t = i as f32 / sample_rate;
            let sample = (2.0 * PI * freq * t).sin();
            let (out_l, _) = post_eq.process(sample, sample);

            if i > 500 {
                // Ignore transient
                max_input = max_input.max(sample.abs());
                max_output = max_output.max(out_l.abs());
            }
        }

        let gain_linear = max_output / max_input;
        let gain_db = 20.0 * gain_linear.log10();

        // Should be attenuated by ~24 dB (within 2 dB tolerance)
        assert!(
            (gain_db - (-24.0)).abs() < 2.0,
            "Expected ~ -24 dB attenuation at 10 kHz, got {:.2} dB",
            gain_db
        );
    }

    #[test]
    fn test_post_eq_flat_response() {
        let sample_rate = 44100.0;
        let post_eq = PostEq::new(sample_rate);

        // Default post eq has 0 dB gain for all bands
        let mag_1k = post_eq.magnitude_db_at(1000.0);
        assert!(
            mag_1k.abs() < 1e-4,
            "Default Post EQ magnitude should be 0 dB, got {:.6}",
            mag_1k
        );
    }
}
