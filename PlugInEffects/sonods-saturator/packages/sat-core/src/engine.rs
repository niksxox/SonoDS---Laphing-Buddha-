//! Stereo Saturator Engine and Web Audio WASM interface.

use crate::chain::SaturatorChannel;
use crate::oversampling::Quality;
use crate::waveshaper::{shape, Character};

const MAX_BLOCK_SIZE: usize = 1024;

/// Stereo Saturator DSP Engine.
#[derive(Debug, Clone)]
pub struct SaturatorEngine {
    pub left: SaturatorChannel,
    pub right: SaturatorChannel,
    pub sample_rate: f64,
    scratch_l: Vec<f64>,
    scratch_r: Vec<f64>,
}

impl SaturatorEngine {
    pub fn new(sample_rate: f64) -> Self {
        Self {
            left: SaturatorChannel::new(sample_rate),
            right: SaturatorChannel::new(sample_rate),
            sample_rate,
            scratch_l: vec![0.0; MAX_BLOCK_SIZE],
            scratch_r: vec![0.0; MAX_BLOCK_SIZE],
        }
    }

    pub fn reset(&mut self) {
        self.left.reset();
        self.right.reset();
    }

    pub fn set_sample_rate(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate;
        self.left.set_sample_rate(sample_rate);
        self.right.set_sample_rate(sample_rate);
    }

    pub fn set_drive(&mut self, drive: f64) {
        let d = drive.clamp(0.0, 1.0);
        self.left.drive_param.set_target(d);
        self.right.drive_param.set_target(d);
    }

    pub fn set_tone(&mut self, tone_db: f64) {
        let t = tone_db.clamp(-24.0, 24.0);
        self.left.tone_param.set_target(t);
        self.right.tone_param.set_target(t);
    }

    pub fn set_character(&mut self, character: Character) {
        self.left.set_character(character);
        self.right.set_character(character);
    }

    pub fn snap_character(&mut self, character: Character) {
        self.left.snap_character(character);
        self.right.snap_character(character);
    }

    pub fn set_mix(&mut self, mix: f64) {
        let m = mix.clamp(0.0, 1.0);
        self.left.mix_param.set_target(m);
        self.right.mix_param.set_target(m);
    }

    pub fn set_output_gain(&mut self, gain_db: f64) {
        let g = gain_db.clamp(-36.0, 36.0);
        self.left.output_param.set_target(g);
        self.right.output_param.set_target(g);
    }

    pub fn set_auto_gain(&mut self, enabled: bool) {
        self.left.auto_gain_enabled = enabled;
        self.right.auto_gain_enabled = enabled;
    }

    pub fn set_quality(&mut self, quality: Quality) {
        self.left.quality = quality;
        self.right.quality = quality;
    }

    pub fn latency_samples(&self) -> u32 {
        self.left.sat_primary.latency_samples(self.left.quality) as u32
    }

    /// Process a stereo block of f32 samples in place.
    pub fn process_block(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        if len == 0 {
            return;
        }

        if self.scratch_l.len() < len {
            self.scratch_l.resize(len, 0.0);
            self.scratch_r.resize(len, 0.0);
        }

        // Convert f32 input to f64 scratch
        for i in 0..len {
            self.scratch_l[i] = left[i] as f64;
            self.scratch_r[i] = right[i] as f64;
        }

        // Process DSP
        self.left.process_block(&mut self.scratch_l[..len]);
        self.right.process_block(&mut self.scratch_r[..len]);

        // Convert f64 back to f32 output
        for i in 0..len {
            left[i] = self.scratch_l[i] as f32;
            right[i] = self.scratch_r[i] as f32;
        }
    }

    /// Compute transfer curve mapping for the visualizer.
    pub fn get_transfer_curve(&self, in_grid: &[f64], out_grid: &mut [f64]) {
        let drive = 3.5 * self.left.drive_param.get_current().powf(1.25);
        let charac = self.left.crossfader.current_char;
        let len = in_grid.len().min(out_grid.len());

        for i in 0..len {
            out_grid[i] = shape(in_grid[i], drive, charac);
        }
    }
}
