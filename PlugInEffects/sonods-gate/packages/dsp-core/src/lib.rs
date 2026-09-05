//! SonoDS Gate / Expander DSP Core — C & WASM FFI Exports.

pub mod biquad;
pub mod denormals;
pub mod detector;
pub mod gain_computer;
pub mod gate;
pub mod lookahead;
pub mod sidechain;
pub mod state_machine;
pub mod style;

pub use detector::DetectorMode;
pub use gate::SonodsGateProcessor;
pub use sidechain::{GateMode, SidechainSource};
pub use style::GateStyle;

#[no_mangle]
pub extern "C" fn gate_core_version() -> u32 {
    1
}

// =========================================================================
// C / WASM FFI Exports for AudioWorklet Integration
// =========================================================================

#[no_mangle]
pub extern "C" fn create_gate(sample_rate: f64) -> *mut SonodsGateProcessor {
    let proc = Box::new(SonodsGateProcessor::new(sample_rate));
    Box::into_raw(proc)
}

#[no_mangle]
pub extern "C" fn destroy_gate(ptr: *mut SonodsGateProcessor) {
    if !ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(ptr);
        }
    }
}

#[no_mangle]
pub extern "C" fn set_sample_rate(ptr: *mut SonodsGateProcessor, sample_rate: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_sample_rate(sample_rate);
    }
}

#[no_mangle]
pub extern "C" fn set_threshold(ptr: *mut SonodsGateProcessor, threshold_db: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_threshold(threshold_db);
    }
}

#[no_mangle]
pub extern "C" fn set_range(ptr: *mut SonodsGateProcessor, range_db: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_range(range_db);
    }
}

#[no_mangle]
pub extern "C" fn set_ratio(ptr: *mut SonodsGateProcessor, ratio: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_ratio(ratio);
    }
}

#[no_mangle]
pub extern "C" fn set_knee(ptr: *mut SonodsGateProcessor, knee_db: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_knee(knee_db);
    }
}

#[no_mangle]
pub extern "C" fn set_attack(ptr: *mut SonodsGateProcessor, attack_s: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_attack(attack_s);
    }
}

#[no_mangle]
pub extern "C" fn set_hold(ptr: *mut SonodsGateProcessor, hold_s: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_hold(hold_s);
    }
}

#[no_mangle]
pub extern "C" fn set_release(ptr: *mut SonodsGateProcessor, release_s: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_release(release_s);
    }
}

#[no_mangle]
pub extern "C" fn set_lookahead(ptr: *mut SonodsGateProcessor, lookahead_s: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_lookahead(lookahead_s);
    }
}

#[no_mangle]
pub extern "C" fn set_style(ptr: *mut SonodsGateProcessor, style_id: u32) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        let style = match style_id {
            0 => GateStyle::Classic,
            1 => GateStyle::Clean,
            2 => GateStyle::Vocal,
            3 => GateStyle::Guitar,
            _ => GateStyle::Classic,
        };
        gate.set_style(style);
    }
}

#[no_mangle]
pub extern "C" fn set_mode(ptr: *mut SonodsGateProcessor, mode_id: u32) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        let mode = match mode_id {
            0 => GateMode::Gate,
            1 => GateMode::Upward,
            2 => GateMode::Ducking,
            _ => GateMode::Gate,
        };
        gate.set_mode(mode);
    }
}

#[no_mangle]
pub extern "C" fn set_detector_mode(ptr: *mut SonodsGateProcessor, mode_id: u32) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        let mode = match mode_id {
            0 => DetectorMode::Peak,
            1 => DetectorMode::Rms,
            _ => DetectorMode::Peak,
        };
        gate.set_detector_mode(mode);
    }
}

#[no_mangle]
pub extern "C" fn set_sidechain_source(ptr: *mut SonodsGateProcessor, source_id: u32) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        let source = match source_id {
            0 => SidechainSource::Internal,
            1 => SidechainSource::External,
            _ => SidechainSource::Internal,
        };
        gate.set_sidechain_source(source);
    }
}

#[no_mangle]
pub extern "C" fn set_sidechain_listen(ptr: *mut SonodsGateProcessor, listen: u32) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_sidechain_listen(listen != 0);
    }
}

#[no_mangle]
pub extern "C" fn set_sidechain_hpf(ptr: *mut SonodsGateProcessor, freq_hz: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_sidechain_hpf(freq_hz);
    }
}

#[no_mangle]
pub extern "C" fn set_sidechain_lpf(ptr: *mut SonodsGateProcessor, freq_hz: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_sidechain_lpf(freq_hz);
    }
}

#[no_mangle]
pub extern "C" fn set_stereo_link(ptr: *mut SonodsGateProcessor, link: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_stereo_link(link);
    }
}

#[no_mangle]
pub extern "C" fn set_mix(ptr: *mut SonodsGateProcessor, mix: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_mix(mix);
    }
}

#[no_mangle]
pub extern "C" fn set_output_gain(ptr: *mut SonodsGateProcessor, gain_db: f64) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_output_gain(gain_db);
    }
}

#[no_mangle]
pub extern "C" fn set_midi_force_open(ptr: *mut SonodsGateProcessor, force: u32) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        gate.set_midi_force_open(force != 0);
    }
}

#[no_mangle]
pub extern "C" fn get_latency_samples(ptr: *mut SonodsGateProcessor) -> u32 {
    if let Some(gate) = unsafe { ptr.as_ref() } {
        gate.latency_samples() as u32
    } else {
        0
    }
}

#[no_mangle]
pub extern "C" fn get_telemetry_frame(ptr: *mut SonodsGateProcessor, out_ptr: *mut f32) {
    if let Some(gate) = unsafe { ptr.as_ref() } {
        if !out_ptr.is_null() {
            let out_slice = unsafe { std::slice::from_raw_parts_mut(out_ptr, 5) };
            let t = gate.latest_telemetry();
            out_slice[0] = t.input_db as f32;
            out_slice[1] = t.detected_db as f32;
            out_slice[2] = t.output_db as f32;
            out_slice[3] = t.gr_db as f32;
            out_slice[4] = match t.state {
                crate::state_machine::GateState::Closed => 0.0,
                crate::state_machine::GateState::Attacking => 1.0,
                crate::state_machine::GateState::Open => 2.0,
                crate::state_machine::GateState::Holding => 3.0,
                crate::state_machine::GateState::Releasing => 4.0,
            };
        }
    }
}

#[no_mangle]
pub extern "C" fn process_block(
    ptr: *mut SonodsGateProcessor,
    left_ptr: *mut f32,
    right_ptr: *mut f32,
    sc_left_ptr: *mut f32,
    sc_right_ptr: *mut f32,
    len: usize,
) {
    if let Some(gate) = unsafe { ptr.as_mut() } {
        if !left_ptr.is_null() && !right_ptr.is_null() && len > 0 {
            let left = unsafe { std::slice::from_raw_parts_mut(left_ptr, len) };
            let right = unsafe { std::slice::from_raw_parts_mut(right_ptr, len) };

            let mut in_l = vec![0.0f64; len];
            let mut in_r = vec![0.0f64; len];
            let mut out_l = vec![0.0f64; len];
            let mut out_r = vec![0.0f64; len];

            for i in 0..len {
                in_l[i] = left[i] as f64;
                in_r[i] = right[i] as f64;
            }

            let (ext_sc_l, ext_sc_r) = if !sc_left_ptr.is_null() && !sc_right_ptr.is_null() {
                let sc_l_slice = unsafe { std::slice::from_raw_parts(sc_left_ptr, len) };
                let sc_r_slice = unsafe { std::slice::from_raw_parts(sc_right_ptr, len) };
                let mut sc_l_vec = vec![0.0f64; len];
                let mut sc_r_vec = vec![0.0f64; len];
                for i in 0..len {
                    sc_l_vec[i] = sc_l_slice[i] as f64;
                    sc_r_vec[i] = sc_r_slice[i] as f64;
                }
                (sc_l_vec, sc_r_vec)
            } else {
                (vec![0.0f64; len], vec![0.0f64; len])
            };

            gate.process_block(&in_l, &in_r, &mut out_l, &mut out_r, &ext_sc_l, &ext_sc_r);

            for i in 0..len {
                left[i] = out_l[i] as f32;
                right[i] = out_r[i] as f32;
            }
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
