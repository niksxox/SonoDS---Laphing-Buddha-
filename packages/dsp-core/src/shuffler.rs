/// Shuffler (Waves S1-style bass-width workflow control layer).
///
/// Maps bass cutoff frequency and bass width directly onto the underlying
/// MultibandImager's low-frequency band (Band 0 crossover & width).

use crate::multiband_imager::MultibandImager;

#[derive(Debug, Clone, Copy)]
pub struct ShufflerControl {
    bass_cutoff: f32, // Hz (20.0 to 400.0)
    bass_width: f32,  // 0.0 to 2.0
}

impl ShufflerControl {
    pub fn new(bass_cutoff: f32, bass_width: f32) -> Self {
        Self {
            bass_cutoff: bass_cutoff.clamp(20.0, 400.0),
            bass_width: bass_width.clamp(0.0, 2.0),
        }
    }

    pub fn bass_cutoff(&self) -> f32 {
        self.bass_cutoff
    }

    pub fn set_bass_cutoff(&mut self, cutoff: f32) {
        self.bass_cutoff = cutoff.clamp(20.0, 400.0);
    }

    pub fn bass_width(&self) -> f32 {
        self.bass_width
    }

    pub fn set_bass_width(&mut self, width: f32) {
        self.bass_width = width.clamp(0.0, 2.0);
    }

    /// Synchronizes this Shuffler workflow view onto the underlying engine state.
    pub fn apply_to_imager(&self, imager: &mut MultibandImager) {
        let current_crossovers = *imager.crossovers();
        imager.set_crossovers(self.bass_cutoff, current_crossovers[1], current_crossovers[2]);
        imager.set_band_width(0, self.bass_width);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shuffler_matches_underlying_band_zero_processing() {
        let sample_rate = 44100.0;

        // Engine 1: Configured via Shuffler workflow layer
        let mut imager_shuffler = MultibandImager::new(sample_rate);
        let shuffler = ShufflerControl::new(120.0, 0.4);
        shuffler.apply_to_imager(&mut imager_shuffler);

        // Engine 2: Configured directly on MultibandImager
        let mut imager_direct = MultibandImager::new(sample_rate);
        imager_direct.set_crossovers(120.0, 1500.0, 6000.0);
        imager_direct.set_band_width(0, 0.4);

        // Verify configuration parity
        assert_eq!(imager_shuffler.crossovers()[0], 120.0);
        assert_eq!(imager_shuffler.band_widths()[0], 0.4);
        assert_eq!(imager_shuffler.crossovers(), imager_direct.crossovers());
        assert_eq!(imager_shuffler.band_widths(), imager_direct.band_widths());

        // Verify identical output processing across 1,000 samples
        let len = 1000;
        for i in 0..len {
            let l_in = (i as f32 * 0.1).sin();
            let r_in = (i as f32 * 0.12 + 0.3).cos();

            let (l_shuf, r_shuf) = imager_shuffler.process_sample(l_in, r_in);
            let (l_dir, r_dir) = imager_direct.process_sample(l_in, r_in);

            assert_eq!(
                l_shuf, l_dir,
                "Left output differed between Shuffler and direct at sample {}",
                i
            );
            assert_eq!(
                r_shuf, r_dir,
                "Right output differed between Shuffler and direct at sample {}",
                i
            );
        }
    }
}
