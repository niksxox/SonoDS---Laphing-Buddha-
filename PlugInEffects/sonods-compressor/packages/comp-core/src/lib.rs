//! SonoDS Compressor DSP Core
//!
//! Architecture decisions:
//! - Task 0.1: Self-contained minimal crate without external workspace coupling.
//! - Task 0.3: Feedforward detection topology for Phase 1-4; feedback character in Phase 5.
//! - Task 0.4: Fixed per-character soft knee default conforming to 4-knob hardware layout.
//!
//! Formula references:
//! Giannoulis, Massberg & Reiss, "Digital Dynamic Range Compressor Design — A Tutorial and Analysis",
//! JAES vol. 60 no. 6, 2012.

pub mod compressor;
pub mod denormals;
pub mod detector;
pub mod gain_computer;
pub mod lookahead;
pub mod param_smoother;
pub mod sidechain;
pub mod smoother;

pub use compressor::{CompressorCharacter, CompressorCore};

#[no_mangle]
pub extern "C" fn comp_core_version() -> u32 {
    1
}

// =========================================================================
// C / WASM FFI Exports for AudioWorklet Integration (Phase 2)
// =========================================================================

#[no_mangle]
pub extern "C" fn create_compressor(sample_rate: f64) -> *mut CompressorCore {
    let core = Box::new(CompressorCore::new(sample_rate));
    Box::into_raw(core)
}

#[no_mangle]
pub extern "C" fn destroy_compressor(ptr: *mut CompressorCore) {
    if !ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(ptr);
        }
    }
}

#[no_mangle]
pub extern "C" fn set_sample_rate(ptr: *mut CompressorCore, sample_rate: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_sample_rate(sample_rate);
    }
}

#[no_mangle]
pub extern "C" fn set_threshold(ptr: *mut CompressorCore, threshold_db: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_threshold_db(threshold_db);
    }
}

#[no_mangle]
pub extern "C" fn set_ratio(ptr: *mut CompressorCore, ratio: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_ratio(ratio);
    }
}

#[no_mangle]
pub extern "C" fn set_attack(ptr: *mut CompressorCore, attack_s: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_attack_s(attack_s);
    }
}

#[no_mangle]
pub extern "C" fn set_release(ptr: *mut CompressorCore, release_s: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_release_s(release_s);
    }
}

#[no_mangle]
pub extern "C" fn set_knee(ptr: *mut CompressorCore, knee_db: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_knee_db(knee_db);
    }
}

#[no_mangle]
pub extern "C" fn set_stereo_link(ptr: *mut CompressorCore, link: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_link(link);
    }
}

#[no_mangle]
pub extern "C" fn set_mix(ptr: *mut CompressorCore, mix: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_mix(mix);
    }
}

#[no_mangle]
pub extern "C" fn set_output_gain(ptr: *mut CompressorCore, gain_db: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_output_gain_db(gain_db);
    }
}

#[no_mangle]
pub extern "C" fn set_auto_gain(ptr: *mut CompressorCore, amount: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_auto_gain(amount);
    }
}

#[no_mangle]
pub extern "C" fn set_sidechain_hpf(ptr: *mut CompressorCore, cutoff_hz: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_sidechain_hpf(cutoff_hz);
    }
}

#[no_mangle]
pub extern "C" fn set_lookahead(ptr: *mut CompressorCore, lookahead_s: f64) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        comp.set_lookahead(lookahead_s);
    }
}

#[no_mangle]
pub extern "C" fn set_character(ptr: *mut CompressorCore, char_id: u32) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        let character = match char_id {
            0 => CompressorCharacter::Vca,
            1 => CompressorCharacter::Opto,
            2 => CompressorCharacter::Fet,
            _ => CompressorCharacter::Vca,
        };
        comp.set_character(character);
    }
}

#[no_mangle]
pub extern "C" fn get_gain_reduction_db(ptr: *mut CompressorCore) -> f64 {
    if let Some(comp) = unsafe { ptr.as_ref() } {
        comp.current_gain_reduction_db()
    } else {
        0.0
    }
}

#[no_mangle]
pub extern "C" fn get_input_level_db(ptr: *mut CompressorCore) -> f64 {
    if let Some(comp) = unsafe { ptr.as_ref() } {
        comp.current_input_level_db()
    } else {
        -60.0
    }
}

#[no_mangle]
pub extern "C" fn get_detected_level_db(ptr: *mut CompressorCore) -> f64 {
    if let Some(comp) = unsafe { ptr.as_ref() } {
        comp.current_detected_level_db()
    } else {
        -60.0
    }
}

#[no_mangle]
pub extern "C" fn get_output_level_db(ptr: *mut CompressorCore) -> f64 {
    if let Some(comp) = unsafe { ptr.as_ref() } {
        comp.current_output_level_db()
    } else {
        -60.0
    }
}

#[no_mangle]
pub extern "C" fn get_telemetry_frame(ptr: *mut CompressorCore, out_ptr: *mut f32) {
    if let Some(comp) = unsafe { ptr.as_ref() } {
        if !out_ptr.is_null() {
            let out_slice = unsafe { std::slice::from_raw_parts_mut(out_ptr, 4) };
            out_slice[0] = comp.current_input_level_db() as f32;
            out_slice[1] = comp.current_detected_level_db() as f32;
            out_slice[2] = comp.current_output_level_db() as f32;
            out_slice[3] = comp.current_gain_reduction_db() as f32;
        }
    }
}

#[no_mangle]
pub extern "C" fn process_block(
    ptr: *mut CompressorCore,
    left_ptr: *mut f32,
    right_ptr: *mut f32,
    len: usize,
) {
    if let Some(comp) = unsafe { ptr.as_mut() } {
        if !left_ptr.is_null() && !right_ptr.is_null() && len > 0 {
            let left = unsafe { std::slice::from_raw_parts_mut(left_ptr, len) };
            let right = unsafe { std::slice::from_raw_parts_mut(right_ptr, len) };
            let mut in_sum_sq = 0.0f64;
            let mut in_peak = 0.0f64;
            let mut out_sum_sq = 0.0f64;
            let mut out_peak = 0.0f64;
            let mut max_gr = 0.0f64;
            let mut max_det = -60.0f64;

            for i in 0..len {
                let inl = left[i] as f64;
                let inr = right[i] as f64;
                let ins = inl.abs().max(inr.abs());
                in_sum_sq += inl * inl + inr * inr;
                in_peak = in_peak.max(ins);

                let (out_l, out_r) = comp.process_sample(inl, inr);
                left[i] = out_l as f32;
                right[i] = out_r as f32;

                let outs = out_l.abs().max(out_r.abs());
                out_sum_sq += out_l * out_l + out_r * out_r;
                out_peak = out_peak.max(outs);

                let cur_gr = comp.current_gain_reduction_db();
                max_gr = max_gr.max(cur_gr);

                let cur_det = comp.current_detected_level_db();
                max_det = max_det.max(cur_det);
            }

            let in_rms = (in_sum_sq / (2.0 * len as f64).max(1.0)).sqrt();
            let in_level = 0.7 * in_peak + 0.3 * in_rms;
            let in_db = if in_level > 1e-5 { 20.0 * in_level.log10() } else { -60.0 };

            let out_rms = (out_sum_sq / (2.0 * len as f64).max(1.0)).sqrt();
            let out_level = 0.7 * out_peak + 0.3 * out_rms;
            let out_db = if out_level > 1e-5 { 20.0 * out_level.log10() } else { -60.0 };

            comp.set_last_telemetry(in_db, max_det, out_db, max_gr);
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

#[cfg(test)]
mod silence_transient_tests {
    use super::*;

    #[test]
    fn test_silence_then_transient_denormal_safety() {
        let mut comp = CompressorCore::new(48000.0);
        comp.set_threshold_immediate(-12.0);
        comp.set_ratio_immediate(4.0);

        for _ in 0..50000 {
            let (l, r) = comp.process_sample(0.0, 0.0);
            assert!(!l.is_nan(), "Left channel became NaN during silence");
            assert!(!r.is_nan(), "Right channel became NaN during silence");
            assert_eq!(l, 0.0);
            assert_eq!(r, 0.0);
        }

        let (tl, tr) = comp.process_sample(0.95, 0.95);
        assert!(!tl.is_nan(), "Transient caused NaN on left");
        assert!(!tr.is_nan(), "Transient caused NaN on right");
        assert!(tl.is_finite());
        assert!(tr.is_finite());
    }
}
