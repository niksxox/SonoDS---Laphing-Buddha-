// SonoDS Reverb - Pre-Delay Module with Tempo Sync
// Task 1.10: Pre-delay prior to Early Reflections / FDN processing.

use crate::delay_line::DelayLine;
use crate::SmoothedParam;

/// Tempo division options for synced pre-delay.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TempoDivision {
    Sixteenth,       // 1/16
    SixteenthDotted, // 1/16d
    Eighth,          // 1/8
    EighthDotted,    // 1/8d
    Quarter,         // 1/4
    QuarterDotted,   // 1/4d
    Half,            // 1/2
}

impl TempoDivision {
    /// Get multiplier relative to 1 quarter note.
    pub fn beat_multiplier(&self) -> f32 {
        match self {
            TempoDivision::Sixteenth => 0.25,
            TempoDivision::SixteenthDotted => 0.375,
            TempoDivision::Eighth => 0.5,
            TempoDivision::EighthDotted => 0.75,
            TempoDivision::Quarter => 1.0,
            TempoDivision::QuarterDotted => 1.5,
            TempoDivision::Half => 2.0,
        }
    }
}

pub struct PreDelay {
    delay_line_l: DelayLine,
    delay_line_r: DelayLine,
    delay_samples: SmoothedParam,
    ms_manual: f32,
    tempo_sync_enabled: bool,
    tempo_bpm: f32,
    tempo_division: TempoDivision,
    sample_rate: f32,
}

const MAX_PREDELAY_SAMPLES: usize = 96000; // ~2 seconds at 48kHz

impl PreDelay {
    pub fn new(sample_rate: f32) -> Self {
        let ms_manual = 0.0; // Default 0ms predelay
        let initial_samples = (ms_manual * 0.001 * sample_rate).clamp(0.0, MAX_PREDELAY_SAMPLES as f32 - 1.0);

        Self {
            delay_line_l: DelayLine::new(MAX_PREDELAY_SAMPLES),
            delay_line_r: DelayLine::new(MAX_PREDELAY_SAMPLES),
            delay_samples: SmoothedParam::new(initial_samples, 0.02, sample_rate),
            ms_manual,
            tempo_sync_enabled: false,
            tempo_bpm: 120.0,
            tempo_division: TempoDivision::Quarter,
            sample_rate,
        }
    }

    /// Set manual pre-delay in milliseconds (0.0 to 500.0 ms).
    pub fn set_delay_ms(&mut self, ms: f32) {
        self.ms_manual = ms.clamp(0.0, 500.0);
        self.update_target_delay();
    }

    pub fn delay_ms(&self) -> f32 {
        self.ms_manual
    }

    /// Enable or disable tempo sync.
    pub fn set_tempo_sync(&mut self, enabled: bool) {
        self.tempo_sync_enabled = enabled;
        self.update_target_delay();
    }

    pub fn is_tempo_sync(&self) -> bool {
        self.tempo_sync_enabled
    }

    /// Set host BPM (20.0 to 300.0).
    pub fn set_bpm(&mut self, bpm: f32) {
        self.tempo_bpm = bpm.clamp(20.0, 300.0);
        self.update_target_delay();
    }

    /// Set tempo division enum.
    pub fn set_division(&mut self, division: TempoDivision) {
        self.tempo_division = division;
        self.update_target_delay();
    }

    fn update_target_delay(&mut self) {
        let target_ms = if self.tempo_sync_enabled {
            let seconds_per_beat = 60.0 / self.tempo_bpm;
            let sync_seconds = seconds_per_beat * self.tempo_division.beat_multiplier();
            sync_seconds * 1000.0
        } else {
            self.ms_manual
        };

        let target_samples = (target_ms * 0.001 * self.sample_rate)
            .clamp(0.0, (MAX_PREDELAY_SAMPLES - 1) as f32);
        self.delay_samples.set_target(target_samples);
    }

    pub fn snap_params(&mut self) {
        self.delay_samples.snap();
    }

    /// Process a stereo sample through pre-delay.
    #[inline]
    pub fn process(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let current_delay = self.delay_samples.next();
        
        self.delay_line_l.write(input_l);
        self.delay_line_r.write(input_r);

        let out_l = if current_delay < 0.5 {
            input_l
        } else {
            self.delay_line_l.read_interpolated(current_delay)
        };

        let out_r = if current_delay < 0.5 {
            input_r
        } else {
            self.delay_line_r.read_interpolated(current_delay)
        };

        (out_l, out_r)
    }

    pub fn clear(&mut self) {
        self.delay_line_l.clear();
        self.delay_line_r.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_predelay_50ms() {
        let sample_rate = 44100.0;
        let mut predelay = PreDelay::new(sample_rate);
        predelay.set_delay_ms(50.0); // 50ms = 2205 samples at 44.1kHz
        predelay.snap_params();

        // Feed impulse at sample 0
        let (out_l0, out_r0) = predelay.process(1.0, 1.0);
        assert_eq!(out_l0, 0.0);
        assert_eq!(out_r0, 0.0);

        // Process samples up to 2204
        for _ in 1..2205 {
            let (l, r) = predelay.process(0.0, 0.0);
            assert_eq!(l, 0.0);
            assert_eq!(r, 0.0);
        }

        // At sample 2205, impulse should arrive
        let (out_l_delayed, out_r_delayed) = predelay.process(0.0, 0.0);
        assert!(
            (out_l_delayed - 1.0).abs() < 1e-3,
            "Impulse should arrive after 2205 samples: got {}",
            out_l_delayed
        );
        assert!(
            (out_r_delayed - 1.0).abs() < 1e-3,
            "Impulse should arrive after 2205 samples: got {}",
            out_r_delayed
        );
    }

    #[test]
    fn test_predelay_tempo_sync() {
        let sample_rate = 44100.0;
        let mut predelay = PreDelay::new(sample_rate);
        predelay.set_bpm(120.0); // 120 BPM = 0.5s per quarter note = 500ms
        predelay.set_division(TempoDivision::Quarter);
        predelay.set_tempo_sync(true);
        predelay.snap_params();

        // 500ms at 44.1kHz = 22050 samples
        predelay.process(1.0, 1.0);
        for _ in 1..22050 {
            predelay.process(0.0, 0.0);
        }

        let (out_l, out_r) = predelay.process(0.0, 0.0);
        assert!((out_l - 1.0).abs() < 1e-3, "Tempo sync 1/4 at 120 BPM should be 500ms (22050 samples)");
    }
}
