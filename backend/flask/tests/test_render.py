"""
test_render.py — Comprehensive tests for render/ DSP module.

Coverage:
    1. Channel strip processing (EQ, compression, saturation, gain, pan, sends).
    2. Constant power panning law behavior (-1.0, 0.0, +1.0).
    3. Bus summing and shared FX returns (reverb/delay).
    4. Neutral parameters verification (output close to simple input sum).
    5. Master limiter clipping prevention (peak <= 1.0 / 0 dBFS).
    6. Integration test on real 9 stems in backend/audio/stems/.
"""

import pytest
import numpy as np
from pathlib import Path
import librosa

from analysis import analyze_multitrack
from grouping.grouping import group_tracks
from rules.rules_engine import generate_baseline_mix
from safety.safety_pipeline import apply_safety
from render.channel_strip import process_channel_strip, apply_constant_power_pan
from render.bus_processor import process_bus, process_shared_fx
from render.mix_renderer import render_mix


# ═══════════════════════════════════════════════════════════════════════
# 1. CHANNEL STRIP TESTS
# ═══════════════════════════════════════════════════════════════════════

class TestChannelStrip:
    def test_constant_power_pan_law(self):
        sr = 44100
        y_mono = np.ones(1000, dtype=np.float32)
        y_stereo = np.vstack([y_mono, y_mono])

        # Center pan (0.0) -> cos(pi/4) = sin(pi/4) ≈ 0.7071
        panned_center = apply_constant_power_pan(y_stereo, 0.0)
        assert np.allclose(panned_center[0], 0.70710678, atol=1e-4)
        assert np.allclose(panned_center[1], 0.70710678, atol=1e-4)

        # Full Left (-1.0) -> L = 1.0, R = 0.0
        panned_left = apply_constant_power_pan(y_stereo, -1.0)
        assert np.allclose(panned_left[0], 1.0, atol=1e-4)
        assert np.allclose(panned_left[1], 0.0, atol=1e-4)

        # Full Right (+1.0) -> L = 0.0, R = 1.0
        panned_right = apply_constant_power_pan(y_stereo, 1.0)
        assert np.allclose(panned_right[0], 0.0, atol=1e-4)
        assert np.allclose(panned_right[1], 1.0, atol=1e-4)

    def test_process_channel_strip_outputs_finite_arrays(self):
        sr = 44100
        t = np.linspace(0, 0.5, int(sr * 0.5), endpoint=False)
        y = np.sin(2 * np.pi * 440 * t).astype(np.float32)

        params = {
            "gain_db": 3.0,
            "pan": 0.2,
            "eq": {
                "hpf_freq": 80.0,
                "lpf_freq": 15000.0,
                "bands": [{"freq": 1000.0, "gain_db": -2.0, "q": 1.0, "type": "bell"}],
            },
            "compressor": {
                "threshold_db": -16.0,
                "ratio": 3.0,
                "attack_ms": 15.0,
                "release_ms": 120.0,
                "makeup_gain_db": 1.0,
            },
            "sends": {"reverb": 0.20, "delay": 0.10},
        }

        panned, rev_send, del_send = process_channel_strip(y, sr, params)

        assert panned.shape == (2, len(y))
        assert rev_send.shape == (2, len(y))
        assert del_send.shape == (2, len(y))

        assert np.all(np.isfinite(panned))
        assert np.all(np.isfinite(rev_send))
        assert np.all(np.isfinite(del_send))


# ═══════════════════════════════════════════════════════════════════════
# 2. BUS PROCESSOR TESTS
# ═══════════════════════════════════════════════════════════════════════

class TestBusProcessor:
    def test_process_bus_finite_output(self):
        sr = 44100
        bus_audio = np.random.randn(2, sr // 2).astype(np.float32) * 0.1
        bus_params = {
            "gain_db": -1.0,
            "pan": 0.0,
            "eq": {"hpf_freq": 40.0, "bands": []},
            "compressor": {"threshold_db": -14.0, "ratio": 2.0},
        }
        res = process_bus(bus_audio, sr, bus_params)
        assert res.shape == bus_audio.shape
        assert np.all(np.isfinite(res))

    def test_shared_fx_returns(self):
        sr = 44100
        rev_send = np.random.randn(2, sr // 2).astype(np.float32) * 0.1
        del_send = np.random.randn(2, sr // 2).astype(np.float32) * 0.1

        rev_ret, del_ret = process_shared_fx(rev_send, del_send, sr)
        assert rev_ret.shape == rev_send.shape
        assert del_ret.shape == del_send.shape
        assert np.all(np.isfinite(rev_ret))
        assert np.all(np.isfinite(del_ret))


# ═══════════════════════════════════════════════════════════════════════
# 3. MIX RENDERER TESTS
# ═══════════════════════════════════════════════════════════════════════

class TestMixRenderer:
    def test_neutral_parameters_close_to_simple_sum(self):
        sr = 44100
        duration = 0.5
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)

        # 2 synthetic sine wave tracks
        y1 = (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        y2 = (0.2 * np.sin(2 * np.pi * 880 * t)).astype(np.float32)

        tracks = [
            {"id": "t1", "filename": "Track1.wav", "y": y1, "sr": sr},
            {"id": "t2", "filename": "Track2.wav", "y": y2, "sr": sr},
        ]

        neutral_params = {
            "tracks": [
                {"id": "t1", "filename": "Track1.wav", "bus": "Vocals", "gain_db": 0.0, "pan": 0.0, "eq": {}, "compressor": {}, "sends": {}},
                {"id": "t2", "filename": "Track2.wav", "bus": "Vocals", "gain_db": 0.0, "pan": 0.0, "eq": {}, "compressor": {}, "sends": {}},
            ],
            "buses": {
                "Vocals": {"gain_db": 0.0, "pan": 0.0, "eq": {}, "compressor": {}},
            },
        }

        rendered, out_sr = render_mix(tracks, neutral_params)
        assert out_sr == sr
        assert rendered.shape == (2, len(t))

        # Under neutral 0dB gain and 0.0 pan (0.7071 constant power scaling),
        # rendered audio should closely match (y1 + y2) * 0.7071
        expected_sum_mono = (y1 + y2) * 0.70710678
        assert np.allclose(rendered[0], expected_sum_mono, atol=0.05)
        assert np.allclose(rendered[1], expected_sum_mono, atol=0.05)

    def test_master_limiter_prevents_clipping(self):
        sr = 44100
        duration = 0.5
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)

        # 5 extremely loud sine waves that would clip without limiting
        loud_tracks = [
            {"id": f"t{i}", "filename": f"Loud_{i}.wav", "y": np.sin(2 * np.pi * 440 * t).astype(np.float32), "sr": sr}
            for i in range(5)
        ]

        params = {
            "tracks": [
                {"id": f"t{i}", "filename": f"Loud_{i}.wav", "bus": "Drums", "gain_db": 6.0, "pan": 0.0}
                for i in range(5)
            ],
            "buses": {"Drums": {"gain_db": 3.0}},
        }

        rendered, _ = render_mix(loud_tracks, params)
        max_peak = np.max(np.abs(rendered))
        assert max_peak <= 1.0, f"Limiter failed to prevent clipping! Peak = {max_peak}"
        assert np.all(np.isfinite(rendered))


# ═══════════════════════════════════════════════════════════════════════
# 4. REAL 9 STEMS INTEGRATION TEST
# ═══════════════════════════════════════════════════════════════════════

class TestRenderRealStems:
    STEMS_DIR = Path(__file__).parent.parent.parent / "audio" / "stems"

    def test_full_pipeline_render_real_nine_stems(self):
        stem_files = sorted(self.STEMS_DIR.glob("*.wav"))
        assert len(stem_files) == 9

        loaded_tracks = []
        for f in stem_files:
            y, sr = librosa.load(f, sr=22050, duration=2.0, mono=True)
            loaded_tracks.append({"id": f.name, "filename": f.name, "y": y, "sr": sr})

        # Run Stage 1 Multitrack Analysis
        analysis_data = analyze_multitrack(loaded_tracks)

        # Run Stage 2 Grouping
        session = group_tracks([{"filename": f.name} for f in stem_files])
        session["masking"] = analysis_data["masking"]

        # Attach analysis data to tracks
        for idx, t in enumerate(session["buses"]["Vocals"] + session["buses"].get("Drums", []) + session["buses"].get("Bass", []) + session["buses"].get("Instruments", [])):
            t["analysis"] = analysis_data["tracks"][idx % len(analysis_data["tracks"])]

        # Run Stage 3 Baseline Mix
        baseline = generate_baseline_mix(session)

        # Run Stage 5 Safety
        safe_mix = apply_safety(baseline, session)

        # Run Stage 6 DSP Render
        rendered, out_sr = render_mix(loaded_tracks, safe_mix)

        assert out_sr == 22050
        assert rendered.ndim == 2
        assert rendered.shape[0] == 2
        assert rendered.shape[1] == int(22050 * 2.0)

        # Check peak safety & finiteness
        max_peak = float(np.max(np.abs(rendered)))
        assert max_peak <= 1.0, f"Rendered real mix clipped! Peak = {max_peak}"
        assert max_peak > 0.01, "Rendered mix is silent!"
        assert np.all(np.isfinite(rendered))
