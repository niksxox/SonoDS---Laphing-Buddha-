/// WASM Bindings for SonoDS Stereo Imager Engine.

use wasm_bindgen::prelude::*;
use crate::asymmetry::AsymmetryControl;
use crate::multiband_imager::MultibandImager;
use crate::recover_sides::RecoverSidesControl;
use crate::stereoize::{StereoizeMode, StereoizeProcessor};

#[wasm_bindgen]
pub struct ImagerEngineWasm {
    imager: MultibandImager,
    stereoize: StereoizeProcessor,
    asymmetry: AsymmetryControl,
    recover: RecoverSidesControl,
}

#[wasm_bindgen]
impl ImagerEngineWasm {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        Self {
            imager: MultibandImager::new(sample_rate),
            stereoize: StereoizeProcessor::new(sample_rate),
            asymmetry: AsymmetryControl::new(0.0),
            recover: RecoverSidesControl::new(0.0),
        }
    }

    pub fn set_num_bands(&mut self, num_bands: usize) {
        self.imager.set_num_bands(num_bands);
    }

    pub fn set_crossovers(&mut self, f1: f32, f2: f32, f3: f32) {
        self.imager.set_crossovers(f1, f2, f3);
    }

    pub fn set_band_width(&mut self, band: usize, width: f32) {
        self.imager.set_band_width(band, width);
    }

    pub fn set_stereoize(&mut self, mode: u32, amount: f32) {
        let st_mode = match mode {
            1 => StereoizeMode::ModeI,
            2 => StereoizeMode::ModeII,
            _ => StereoizeMode::Off,
        };
        self.stereoize.set_mode(st_mode);
        self.stereoize.set_amount(amount);
    }

    pub fn set_asymmetry(&mut self, asymmetry: f32) {
        self.asymmetry.set_asymmetry(asymmetry);
    }

    pub fn set_recover_sides(&mut self, amount: f32) {
        self.recover.set_recover_amount(amount);
    }

    pub fn reset(&mut self) {
        self.imager.reset();
        self.stereoize.reset();
    }

    /// Process Left and Right audio buffers in-place in WASM memory.
    pub fn process_interleaved(&mut self, input_output: &mut [f32]) {
        let frame_count = input_output.len() / 2;
        let b0_width = self.imager.band_widths()[0];

        for i in 0..frame_count {
            let l_in = input_output[i * 2];
            let r_in = input_output[i * 2 + 1];

            let (mid, side) = crate::ms_matrix::encode_sample(l_in, r_in);
            let st_side = self.stereoize.process_mid(mid);
            let (l_st, r_st) = crate::ms_matrix::decode_sample(mid, side + st_side);

            let (l_rec, r_rec) = self.recover.process_sample(l_st, r_st, b0_width);
            let (l_img, r_img) = self.imager.process_sample(l_rec, r_rec);
            let (l_final, r_final) = self.asymmetry.process_sample(l_img, r_img);

            input_output[i * 2] = l_final;
            input_output[i * 2 + 1] = r_final;
        }
    }

    /// Get overall correlation.
    pub fn overall_correlation(&self) -> f32 {
        self.imager.overall_correlation()
    }

    /// Get correlation for a specific band (0 to 3).
    pub fn band_correlation(&self, band: usize) -> f32 {
        self.imager.band_correlation(band)
    }

    /// Get width for a specific band (0 to 3).
    pub fn band_width(&self, band: usize) -> f32 {
        if band < 4 {
            self.imager.band_widths()[band]
        } else {
            1.0
        }
    }
}
