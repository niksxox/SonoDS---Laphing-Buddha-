// SonoDS Reverb - Mix, Wet/Dry & Lock Module
// Task 1.12: Mix control blending dry input and wet reverb processing with lock support.

use crate::SmoothedParam;

pub struct MixControl {
    mix_percent: SmoothedParam,
    dry_gain_db: SmoothedParam,
    wet_gain_db: SmoothedParam,
    mix_locked: bool,
}

impl MixControl {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            mix_percent: SmoothedParam::new(50.0, 0.02, sample_rate), // Default 50% wet
            dry_gain_db: SmoothedParam::new(0.0, 0.02, sample_rate),  // 0 dB dry gain
            wet_gain_db: SmoothedParam::new(0.0, 0.02, sample_rate),  // 0 dB wet gain
            mix_locked: false,
        }
    }

    pub fn set_mix_percent(&mut self, percent: f32) {
        if !self.mix_locked {
            self.mix_percent.set_target(percent.clamp(0.0, 100.0));
        }
    }

    /// Force set mix percent even if locked (used when user manually adjusts knob in UI).
    pub fn force_set_mix_percent(&mut self, percent: f32) {
        self.mix_percent.set_target(percent.clamp(0.0, 100.0));
    }

    pub fn mix_percent(&self) -> f32 {
        self.mix_percent.current()
    }

    pub fn set_dry_gain_db(&mut self, db: f32) {
        self.dry_gain_db.set_target(db.clamp(-80.0, 12.0));
    }

    pub fn set_wet_gain_db(&mut self, db: f32) {
        self.wet_gain_db.set_target(db.clamp(-80.0, 12.0));
    }

    pub fn set_mix_locked(&mut self, locked: bool) {
        self.mix_locked = locked;
    }

    pub fn is_mix_locked(&self) -> bool {
        self.mix_locked
    }

    pub fn snap_params(&mut self) {
        self.mix_percent.snap();
        self.dry_gain_db.snap();
        self.wet_gain_db.snap();
    }

    /// Process dry and wet signals into final output pair.
    #[inline]
    pub fn process(&mut self, dry_l: f32, dry_r: f32, wet_l: f32, wet_r: f32) -> (f32, f32) {
        let mix_pct = self.mix_percent.next();
        let dry_db = self.dry_gain_db.next();
        let wet_db = self.wet_gain_db.next();

        let dry_lin = if dry_db <= -79.0 { 0.0 } else { 10.0f32.powf(dry_db / 20.0) };
        let wet_lin = if wet_db <= -79.0 { 0.0 } else { 10.0f32.powf(wet_db / 20.0) };

        let dry_weight = (100.0 - mix_pct) / 100.0;
        let wet_weight = mix_pct / 100.0;

        let out_l = dry_l * dry_weight * dry_lin + wet_l * wet_weight * wet_lin;
        let out_r = dry_r * dry_weight * dry_lin + wet_r * wet_weight * wet_lin;

        (out_l, out_r)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mix_0_percent_pure_dry() {
        let sample_rate = 44100.0;
        let mut mix = MixControl::new(sample_rate);
        mix.force_set_mix_percent(0.0);
        mix.snap_params();

        let (out_l, out_r) = mix.process(0.7, 0.7, 0.2, 0.2);
        assert!((out_l - 0.7).abs() < 1e-4, "Mix 0% should return dry signal: got {}", out_l);
        assert!((out_r - 0.7).abs() < 1e-4, "Mix 0% should return dry signal: got {}", out_r);
    }

    #[test]
    fn test_mix_100_percent_pure_wet() {
        let sample_rate = 44100.0;
        let mut mix = MixControl::new(sample_rate);
        mix.force_set_mix_percent(100.0);
        mix.snap_params();

        let (out_l, out_r) = mix.process(0.7, 0.7, 0.2, 0.2);
        assert!((out_l - 0.2).abs() < 1e-4, "Mix 100% should return wet signal: got {}", out_l);
        assert!((out_r - 0.2).abs() < 1e-4, "Mix 100% should return wet signal: got {}", out_r);
    }

    #[test]
    fn test_mix_lock_prevents_preset_overwrite() {
        let sample_rate = 44100.0;
        let mut mix = MixControl::new(sample_rate);
        mix.force_set_mix_percent(30.0);
        mix.snap_params();

        // Lock mix
        mix.set_mix_locked(true);

        // Preset loading tries to set mix to 75%
        mix.set_mix_percent(75.0);
        assert_eq!(mix.mix_percent(), 30.0, "Locked mix should ignore preset change");

        // Unlock mix
        mix.set_mix_locked(false);
        mix.set_mix_percent(75.0);
        mix.snap_params();
        assert_eq!(mix.mix_percent(), 75.0, "Unlocked mix should accept preset change");
    }
}
