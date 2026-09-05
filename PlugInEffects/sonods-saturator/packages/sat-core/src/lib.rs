pub mod adaa;
pub mod antideriv;
pub mod chain;
pub mod dynamic_bias;
pub mod engine;
pub mod filters;
pub mod oversampling;
pub mod smoothing;
pub mod tape_hysteresis;
pub mod waveshaper;

pub use chain::SaturatorChannel;
pub use dynamic_bias::DynamicBiasTracker;
pub use engine::SaturatorEngine;
pub use oversampling::Quality;
pub use tape_hysteresis::JilesAthertonTape;
pub use waveshaper::{Character, TUBE_DEFAULT_BIAS};

#[no_mangle]
pub extern "C" fn create_saturator(sample_rate: f64) -> *mut SaturatorEngine {
    let engine = Box::new(SaturatorEngine::new(sample_rate));
    Box::into_raw(engine)
}

#[no_mangle]
pub extern "C" fn destroy_saturator(ptr: *mut SaturatorEngine) {
    if !ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(ptr);
        }
    }
}

#[no_mangle]
pub extern "C" fn set_sample_rate(ptr: *mut SaturatorEngine, sample_rate: f64) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.set_sample_rate(sample_rate);
    }
}

#[no_mangle]
pub extern "C" fn set_drive(ptr: *mut SaturatorEngine, drive: f64) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.set_drive(drive);
    }
}

#[no_mangle]
pub extern "C" fn set_tone(ptr: *mut SaturatorEngine, tone_db: f64) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.set_tone(tone_db);
    }
}

#[no_mangle]
pub extern "C" fn set_character(ptr: *mut SaturatorEngine, char_id: u32) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        let character = match char_id {
            0 => Character::Tape,
            1 => Character::Tube,
            2 => Character::Transformer,
            _ => Character::Tape,
        };
        engine.set_character(character);
    }
}

#[no_mangle]
pub extern "C" fn set_mix(ptr: *mut SaturatorEngine, mix: f64) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.set_mix(mix);
    }
}

#[no_mangle]
pub extern "C" fn set_output_gain(ptr: *mut SaturatorEngine, gain_db: f64) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.set_output_gain(gain_db);
    }
}

#[no_mangle]
pub extern "C" fn set_auto_gain(ptr: *mut SaturatorEngine, enabled_val: u32) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.set_auto_gain(enabled_val != 0);
    }
}

#[no_mangle]
pub extern "C" fn set_quality(ptr: *mut SaturatorEngine, quality_id: u32) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        let quality = match quality_id {
            0 => Quality::Standard,
            1 => Quality::High,
            _ => Quality::Standard,
        };
        engine.set_quality(quality);
    }
}

#[no_mangle]
pub extern "C" fn get_latency_samples(ptr: *mut SaturatorEngine) -> u32 {
    if let Some(engine) = unsafe { ptr.as_ref() } {
        engine.latency_samples()
    } else {
        0
    }
}

#[no_mangle]
pub extern "C" fn process_block(
    ptr: *mut SaturatorEngine,
    left_ptr: *mut f32,
    right_ptr: *mut f32,
    len: usize,
) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        if !left_ptr.is_null() && !right_ptr.is_null() && len > 0 {
            let left = unsafe { std::slice::from_raw_parts_mut(left_ptr, len) };
            let right = unsafe { std::slice::from_raw_parts_mut(right_ptr, len) };
            engine.process_block(left, right);
        }
    }
}

#[no_mangle]
pub extern "C" fn get_transfer_curve(
    ptr: *mut SaturatorEngine,
    in_ptr: *const f64,
    out_ptr: *mut f64,
    len: usize,
) {
    if let Some(engine) = unsafe { ptr.as_ref() } {
        if !in_ptr.is_null() && !out_ptr.is_null() && len > 0 {
            let in_grid = unsafe { std::slice::from_raw_parts(in_ptr, len) };
            let out_grid = unsafe { std::slice::from_raw_parts_mut(out_ptr, len) };
            engine.get_transfer_curve(in_grid, out_grid);
        }
    }
}

#[no_mangle]
pub extern "C" fn allocate_f32_buffer(len: usize) -> *mut f32 {
    let mut vec = vec![0.0f32; len];
    let ptr = vec.as_mut_ptr();
    std::mem::forget(vec);
    ptr
}

#[no_mangle]
pub extern "C" fn deallocate_f32_buffer(ptr: *mut f32, len: usize) {
    if !ptr.is_null() {
        unsafe {
            let _ = Vec::from_raw_parts(ptr, len, len);
        }
    }
}

#[no_mangle]
pub extern "C" fn allocate_f64_buffer(len: usize) -> *mut f64 {
    let mut vec = vec![0.0f64; len];
    let ptr = vec.as_mut_ptr();
    std::mem::forget(vec);
    ptr
}

#[no_mangle]
pub extern "C" fn deallocate_f64_buffer(ptr: *mut f64, len: usize) {
    if !ptr.is_null() {
        unsafe {
            let _ = Vec::from_raw_parts(ptr, len, len);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_c_wasm_api_lifecycle_and_processing() {
        let ptr = create_saturator(48000.0);
        assert!(!ptr.is_null());

        set_drive(ptr, 0.7);
        set_tone(ptr, 3.0);
        set_character(ptr, 1); // Tube
        set_mix(ptr, 0.9);
        set_output_gain(ptr, -1.5);
        set_auto_gain(ptr, 1);
        set_quality(ptr, 0);

        let mut left = vec![0.5f32; 128];
        let mut right = vec![0.5f32; 128];
        process_block(ptr, left.as_mut_ptr(), right.as_mut_ptr(), 128);

        for &sample in &left {
            assert!(sample.is_finite());
            assert!(!sample.is_nan());
        }

        let in_grid = [-1.0, -0.5, 0.0, 0.5, 1.0];
        let mut out_grid = [0.0f64; 5];
        get_transfer_curve(ptr, in_grid.as_ptr(), out_grid.as_mut_ptr(), 5);

        assert!(out_grid[0] < out_grid[4]);
        assert_eq!(out_grid[2], 0.0);

        destroy_saturator(ptr);
    }
}
