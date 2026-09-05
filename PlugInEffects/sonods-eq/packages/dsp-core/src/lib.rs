pub mod band;
pub mod biquad;
pub mod coeffs;
pub mod engine;
pub mod linear_phase;
pub mod smoothing;

use coeffs::Shape;
use engine::{EqEngine, PhaseMode};

#[no_mangle]
pub extern "C" fn create_engine(sample_rate: f64) -> *mut EqEngine {
    let engine = Box::new(EqEngine::new(sample_rate));
    Box::into_raw(engine)
}

#[no_mangle]
pub extern "C" fn destroy_engine(ptr: *mut EqEngine) {
    if !ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(ptr);
        }
    }
}

#[no_mangle]
pub extern "C" fn set_sample_rate(ptr: *mut EqEngine, sample_rate: f64) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.set_sample_rate(sample_rate);
    }
}

#[no_mangle]
pub extern "C" fn set_phase_mode(ptr: *mut EqEngine, mode: u32) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        let phase_mode = match mode {
            0 => PhaseMode::ZeroLatency,
            1 => PhaseMode::NaturalPhase,
            2 => PhaseMode::LinearPhase,
            _ => PhaseMode::ZeroLatency,
        };
        engine.set_phase_mode(phase_mode);
    }
}

#[no_mangle]
pub extern "C" fn set_band(
    ptr: *mut EqEngine,
    index: usize,
    shape_val: u32,
    freq: f64,
    gain: f64,
    q: f64,
    enabled_val: u32,
) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        let shape = match shape_val {
            0 => Shape::Bell,
            1 => Shape::LowShelf,
            2 => Shape::HighShelf,
            3 => Shape::LowCut,
            4 => Shape::HighCut,
            _ => Shape::Bell,
        };
        engine.set_band(index, shape, freq, gain, q, enabled_val != 0);
    }
}

#[no_mangle]
pub extern "C" fn snap_band(
    ptr: *mut EqEngine,
    index: usize,
    shape_val: u32,
    freq: f64,
    gain: f64,
    q: f64,
    enabled_val: u32,
) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        let shape = match shape_val {
            0 => Shape::Bell,
            1 => Shape::LowShelf,
            2 => Shape::HighShelf,
            3 => Shape::LowCut,
            4 => Shape::HighCut,
            _ => Shape::Bell,
        };
        engine.snap_band(index, shape, freq, gain, q, enabled_val != 0);
    }
}

#[no_mangle]
pub extern "C" fn clear_bands(ptr: *mut EqEngine) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.clear_bands();
    }
}

#[no_mangle]
pub extern "C" fn remove_band(ptr: *mut EqEngine, index: usize) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.remove_band(index);
    }
}

#[no_mangle]
pub extern "C" fn set_band_param(ptr: *mut EqEngine, band_index: usize, param_id: u32, value: f64) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        engine.set_band_param(band_index, param_id, value);
    }
}

#[no_mangle]
pub extern "C" fn process_block(
    ptr: *mut EqEngine,
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
pub extern "C" fn get_magnitude_response(
    ptr: *mut EqEngine,
    freqs_ptr: *const f64,
    out_ptr: *mut f64,
    len: usize,
) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        if !freqs_ptr.is_null() && !out_ptr.is_null() && len > 0 {
            let freqs = unsafe { std::slice::from_raw_parts(freqs_ptr, len) };
            let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, len) };
            let mags = engine.magnitude_response_db(freqs);
            out.copy_from_slice(&mags);
        }
    }
}

#[no_mangle]
pub extern "C" fn get_band_magnitude_response(
    ptr: *mut EqEngine,
    band_index: usize,
    freqs_ptr: *const f64,
    out_ptr: *mut f64,
    len: usize,
) {
    if let Some(engine) = unsafe { ptr.as_mut() } {
        if !freqs_ptr.is_null() && !out_ptr.is_null() && len > 0 {
            let freqs = unsafe { std::slice::from_raw_parts(freqs_ptr, len) };
            let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, len) };
            let mags = engine.band_magnitude_response_db(band_index, freqs);
            out.copy_from_slice(&mags);
        }
    }
}

#[no_mangle]
pub extern "C" fn get_latency_samples(ptr: *mut EqEngine) -> u32 {
    if let Some(engine) = unsafe { ptr.as_ref() } {
        engine.latency_samples
    } else {
        0
    }
}

/// Helper to allocate memory in WASM for buffer transfers
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
    fn engine_lifecycle_and_block_processing() {
        let ptr = create_engine(48000.0);
        assert!(!ptr.is_null());

        set_band(ptr, 0, 0, 1000.0, 6.0, 1.0, 1);
        set_band_param(ptr, 0, 1, 9.0); // update gain to 9dB

        let mut left = vec![1.0f32; 128];
        let mut right = vec![1.0f32; 128];

        process_block(ptr, left.as_mut_ptr(), right.as_mut_ptr(), 128);

        let freqs = [20.0, 1000.0, 20000.0];
        let mut mags = [0.0f64; 3];
        get_magnitude_response(ptr, freqs.as_ptr(), mags.as_mut_ptr(), 3);

        assert!(mags[1] > mags[0]); // 1000Hz should have boost

        destroy_engine(ptr);
    }
}
