#![allow(dead_code)]
#![allow(missing_docs)]

pub mod config;
pub mod kweight;
pub mod loudness;
pub mod spectrum;
pub mod truepeak;
pub mod correlation;
pub mod gating;
pub mod lra;
pub mod dynamics;
pub mod presets;
pub mod offline;

pub use crate::loudness::{
    LoudnessEngine as Engine,
    LoudnessFrame,
    Momentary,
    ShortTerm,
    Integrated,
};
pub use crate::truepeak::TruePeakDetector;
pub use crate::spectrum::SpectrumAnalyzer;
pub use crate::correlation::StereoCorrelation;
pub use crate::presets::{Preset, TargetSpec, ValidatorResult};
