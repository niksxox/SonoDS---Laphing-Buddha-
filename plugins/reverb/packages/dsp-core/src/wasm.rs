// SonoDS Reverb - WebAssembly Bindings
// Exposes ReverbProcessor to JavaScript/TypeScript AudioWorklet.

use crate::{FilterType, ReverbProcessor, TempoDivision};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmReverbProcessor {
    processor: ReverbProcessor,
    input_buffer_l: Vec<f32>,
    input_buffer_r: Vec<f32>,
    output_buffer_l: Vec<f32>,
    output_buffer_r: Vec<f32>,
    max_block_size: usize,
}

#[wasm_bindgen]
impl WasmReverbProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32, max_block_size: usize) -> Self {
        let size = max_block_size.max(128);
        Self {
            processor: ReverbProcessor::new(sample_rate),
            input_buffer_l: vec![0.0; size],
            input_buffer_r: vec![0.0; size],
            output_buffer_l: vec![0.0; size],
            output_buffer_r: vec![0.0; size],
            max_block_size: size,
        }
    }

    pub fn input_ptr_l(&self) -> *const f32 {
        self.input_buffer_l.as_ptr()
    }

    pub fn input_ptr_r(&self) -> *const f32 {
        self.input_buffer_r.as_ptr()
    }

    pub fn output_ptr_l(&self) -> *const f32 {
        self.output_buffer_l.as_ptr()
    }

    pub fn output_ptr_r(&self) -> *const f32 {
        self.output_buffer_r.as_ptr()
    }

    /// Mutable input buffers access for writing directly from Float32Array in JS
    pub fn input_mut_ptr_l(&mut self) -> *mut f32 {
        self.input_buffer_l.as_mut_ptr()
    }

    pub fn input_mut_ptr_r(&mut self) -> *mut f32 {
        self.input_buffer_r.as_mut_ptr()
    }

    /// Process `frames` samples from WASM input buffers into WASM output buffers.
    pub fn process(&mut self, frames: usize) {
        let n = frames.min(self.max_block_size);
        for i in 0..n {
            let (ol, or) = self
                .processor
                .process_sample(self.input_buffer_l[i], self.input_buffer_r[i]);
            self.output_buffer_l[i] = ol;
            self.output_buffer_r[i] = or;
        }
    }

    // Parameter setters
    pub fn set_space(&mut self, space: f32) {
        self.processor.early_reflections.set_from_space(space);
        let room_size = 200.0 + space * 7800.0;
        self.processor.fdn.set_room_size(room_size);
    }

    pub fn set_rt60(&mut self, rt60_secs: f32) {
        self.processor.fdn.set_rt60(rt60_secs);
    }

    pub fn set_brightness(&mut self, brightness: f32) {
        self.processor.brightness.set_brightness(brightness);
    }

    pub fn set_character(&mut self, character: f32) {
        self.processor.character.set_character(character);
    }

    pub fn set_distance(&mut self, distance: f32) {
        self.processor.early_reflections.set_distance(distance);
    }

    pub fn set_thickness(&mut self, thickness: f32) {
        self.processor.thickness.set_thickness(thickness);
    }

    pub fn set_stereo_width(&mut self, width: f32) {
        self.processor.width.set_width(width);
    }

    pub fn set_predelay_ms(&mut self, ms: f32) {
        self.processor.predelay.set_delay_ms(ms);
    }

    pub fn set_predelay_sync(&mut self, enabled: bool) {
        self.processor.predelay.set_tempo_sync(enabled);
    }

    pub fn set_predelay_bpm(&mut self, bpm: f32) {
        self.processor.predelay.set_bpm(bpm);
    }

    pub fn set_predelay_division(&mut self, division_idx: usize) {
        let div = match division_idx {
            0 => TempoDivision::Sixteenth,
            1 => TempoDivision::SixteenthDotted,
            2 => TempoDivision::Eighth,
            3 => TempoDivision::EighthDotted,
            4 => TempoDivision::Quarter,
            5 => TempoDivision::QuarterDotted,
            6 => TempoDivision::Half,
            _ => TempoDivision::Quarter,
        };
        self.processor.predelay.set_division(div);
    }

    pub fn set_decay_rate_band(
        &mut self,
        band_idx: usize,
        enabled: bool,
        freq_hz: f32,
        decay_rate_percent: f32,
        q: f32,
    ) {
        // Convert decay rate percent (50% to 200%) back to dB gain for internal feedback loop
        // decay_rate_percent = 10^(gain_db / 20) * 100
        // gain_db = 20 * log10(decay_rate_percent / 100)
        let gain_db = if decay_rate_percent > 0.0 {
            20.0 * (decay_rate_percent / 100.0).log10()
        } else {
            0.0
        };

        let params = crate::decay_rate_eq::DecayEqBandParams {
            enabled,
            filter_type: FilterType::Bell,
            freq_hz,
            gain_db,
            q,
        };

        self.processor.decay_eq.set_band(band_idx, params);
    }

    pub fn set_post_eq_band(
        &mut self,
        band_idx: usize,
        enabled: bool,
        filter_type_idx: usize,
        freq_hz: f32,
        gain_db: f32,
        q: f32,
    ) {
        let ft = match filter_type_idx {
            0 => FilterType::LowShelf,
            1 => FilterType::Bell,
            2 => FilterType::HighShelf,
            3 => FilterType::Notch,
            _ => FilterType::Bell,
        };
        self.processor
            .post_eq
            .set_band(band_idx, enabled, ft, freq_hz, gain_db, q);
    }

    pub fn set_ducking_amount(&mut self, amount: f32) {
        self.processor.ducking.set_amount(amount);
    }

    pub fn set_auto_gate(&mut self, enabled: bool, threshold_db: f32) {
        self.processor.auto_gate.set_enabled(enabled);
        self.processor.auto_gate.set_threshold_db(threshold_db);
    }

    pub fn set_freeze(&mut self, freeze: bool) {
        self.processor.fdn.set_freeze(freeze);
    }

    pub fn set_mix_percent(&mut self, percent: f32) {
        self.processor.mix.set_mix_percent(percent);
    }

    pub fn force_set_mix_percent(&mut self, percent: f32) {
        self.processor.mix.force_set_mix_percent(percent);
    }

    pub fn set_dry_gain_db(&mut self, db: f32) {
        self.processor.mix.set_dry_gain_db(db);
    }

    pub fn set_wet_gain_db(&mut self, db: f32) {
        self.processor.mix.set_wet_gain_db(db);
    }

    pub fn set_mix_locked(&mut self, locked: bool) {
        self.processor.mix.set_mix_locked(locked);
    }

    pub fn get_decay_rate_curve(&self, freqs: &[f32], out_decay_percent: &mut [f32]) {
        let len = freqs.len().min(out_decay_percent.len());
        for i in 0..len {
            let mag = self.processor.decay_eq.magnitude_at(freqs[i]);
            out_decay_percent[i] = mag * 100.0;
        }
    }

    pub fn get_post_eq_curve(&self, freqs: &[f32], out_db: &mut [f32]) {
        let len = freqs.len().min(out_db.len());
        for i in 0..len {
            out_db[i] = self.processor.post_eq.magnitude_db_at(freqs[i]);
        }
    }

    pub fn snap_all_params(&mut self) {
        self.processor.snap_all_params();
    }

    pub fn clear_buffers(&mut self) {
        self.processor.clear_buffers();
    }
}
