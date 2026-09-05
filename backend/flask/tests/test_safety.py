"""
test_safety.py — Comprehensive test suite for safety module.

Coverage:
    1. Bounds checking & hard-clamping for all parameters.
    2. Center anchor invariant enforcement (Resetting pan to 0.0 for Lead Vocal, Kick, Bass, etc.).
    3. Health score calculations (Already Good Detector).
    4. Dynamic safe deviation range calculation (tight range for healthy tracks, expanded for poor tracks).
    5. Neutral session fallback defaults.
    6. Safety pipeline integration on real 9-stem project.
"""

import pytest
import json
from pathlib import Path

from grouping.grouping import group_tracks
from rules.rules_engine import generate_baseline_mix
from safety.bounds_check import clamp_track_parameters, clamp_bus_parameters, PARAM_BOUNDS
from safety.already_good_detector import compute_track_health_score, compute_session_health
from safety.safety_pipeline import calculate_safe_deviation_range, apply_safety


# ═══════════════════════════════════════════════════════════════════════
# 1. BOUNDS CHECKING & HARD-CLAMPING
# ═══════════════════════════════════════════════════════════════════════

class TestBoundsCheck:
    def test_gain_db_clamping(self):
        track_high = {"gain_db": 18.0}
        clamped, is_c, warnings = clamp_track_parameters(track_high)
        assert clamped["gain_db"] == 12.0
        assert is_c is True
        assert len(warnings) == 1

        track_low = {"gain_db": -35.0}
        clamped_low, is_c2, warnings2 = clamp_track_parameters(track_low)
        assert clamped_low["gain_db"] == -24.0
        assert is_c2 is True

    def test_center_anchor_pan_enforcement(self):
        lead_vocal = {"role": "lead_vocal", "pan": 0.40}
        clamped, is_c, warnings = clamp_track_parameters(lead_vocal)
        assert clamped["pan"] == 0.0
        assert is_c is True
        assert "center anchor" in warnings[0]

        kick = {"role": "kick", "pan": -0.25}
        clamped_k, is_c_k, _ = clamp_track_parameters(kick)
        assert clamped_k["pan"] == 0.0

    def test_non_anchor_pan_clamping(self):
        guitar = {"role": "guitar", "pan": -1.5}
        clamped, is_c, warnings = clamp_track_parameters(guitar)
        assert clamped["pan"] == -1.0
        assert is_c is True

    def test_compressor_parameters_clamping(self):
        track_comp = {
            "compressor": {
                "threshold_db": -50.0,  # Below min -40
                "ratio": 25.0,           # Above max 20
                "attack_ms": 0.01,       # Below min 0.1
                "release_ms": 4000.0,    # Above max 3000
                "makeup_gain_db": 25.0,  # Above max 18
            }
        }
        clamped, is_c, warnings = clamp_track_parameters(track_comp)
        c = clamped["compressor"]
        assert c["threshold_db"] == -40.0
        assert c["ratio"] == 20.0
        assert c["attack_ms"] == 0.1
        assert c["release_ms"] == 3000.0
        assert c["makeup_gain_db"] == 18.0
        assert is_c is True
        assert len(warnings) == 5

    def test_sends_clamping(self):
        track_sends = {"sends": {"reverb": 1.5, "delay": -0.2}}
        clamped, is_c, warnings = clamp_track_parameters(track_sends)
        s = clamped["sends"]
        assert s["reverb"] == 1.0
        assert s["delay"] == 0.0
        assert is_c is True


# ═══════════════════════════════════════════════════════════════════════
# 2. ALREADY GOOD DETECTOR (HEALTH SCORING)
# ═══════════════════════════════════════════════════════════════════════

class TestAlreadyGoodDetector:
    def test_healthy_vocal_track_scores_high(self):
        healthy_track = {
            "role": "lead_vocal",
            "analysis": {
                "loudness": {"integrated_lufs": -18.0},  # Matches target
                "dynamics": {"crest_factor_db": 9.0, "dynamic_range_db": 10.0},  # Healthy
                "spectrum": {"mid_energy": 0.35, "sub_energy": 0.02},  # Good vocal spectrum
            },
        }
        score = compute_track_health_score(healthy_track, anchor_lufs=-18.0)
        assert score >= 0.85

    def test_poor_unbalanced_track_scores_low(self):
        poor_track = {
            "role": "lead_vocal",
            "analysis": {
                "loudness": {"integrated_lufs": -32.0},  # 14dB lower than target
                "dynamics": {"crest_factor_db": 2.0, "dynamic_range_db": 1.0},  # Severely clipped/flat
                "spectrum": {"sub_energy": 0.40, "mid_energy": 0.05},  # Severe low mud on vocal
            },
        }
        score = compute_track_health_score(poor_track, anchor_lufs=-18.0)
        assert score <= 0.35


# ═══════════════════════════════════════════════════════════════════════
# 3. SAFETY PIPELINE & DYNAMIC TOLERANCE RANGES
# ═══════════════════════════════════════════════════════════════════════

class TestSafetyPipeline:
    def test_calculate_safe_deviation_range_scaling(self):
        # 100% healthy track gets tight safe range (2.0 dB)
        tight_range = calculate_safe_deviation_range(1.0)
        assert tight_range == 2.0

        # Poorly measured track gets expanded safe range (6.5 dB)
        expanded_range = calculate_safe_deviation_range(0.0)
        assert expanded_range == 6.5

        # Moderate track (0.5 score) gets middle safe range (~4.2 - 4.3 dB)
        mid_range = calculate_safe_deviation_range(0.5)
        assert 4.0 <= mid_range <= 4.5

    def test_apply_safety_enriches_session(self):
        raw_tracks = [
            {"filename": "01_Lead_Vocal.wav"},
            {"filename": "02_Guitar.wav"},
        ]
        session = group_tracks(raw_tracks)
        baseline = generate_baseline_mix(session)

        # Inject out-of-bounds parameter into guitar for testing
        baseline["tracks"][1]["gain_db"] = 20.0

        safe_mix = apply_safety(baseline, session)

        assert "safety_summary" in safe_mix
        assert safe_mix["safety_summary"]["clamped_tracks_count"] >= 1

        gtr = safe_mix["tracks"][1]
        assert gtr["gain_db"] == 12.0  # Clamped down from 20.0
        assert gtr["is_clamped"] is True
        assert "already_good_score" in gtr
        assert "safe_range_db" in gtr
        assert 2.0 <= gtr["safe_range_db"] <= 6.5


# ═══════════════════════════════════════════════════════════════════════
# 4. REAL 9 STEMS INTEGRATION TEST
# ═══════════════════════════════════════════════════════════════════════

class TestSafetyRealStems:
    STEMS_DIR = Path(__file__).parent.parent.parent / "audio" / "stems"

    @pytest.fixture
    def real_session_and_baseline(self):
        stem_files = sorted(self.STEMS_DIR.glob("*.wav"))
        assert len(stem_files) == 9
        raw_tracks = [{"filename": f.name} for f in stem_files]
        session = group_tracks(raw_tracks)
        baseline = generate_baseline_mix(session)
        return session, baseline

    def test_real_nine_stems_safety_pipeline(self, real_session_and_baseline):
        session, baseline = real_session_and_baseline
        safe_mix = apply_safety(baseline, session)

        assert len(safe_mix["tracks"]) == 9
        for t in safe_mix["tracks"]:
            assert "already_good_score" in t
            assert "safe_range_db" in t
            assert 2.0 <= t["safe_range_db"] <= 6.5
            assert "is_clamped" in t
            assert "warnings" in t

        json_str = json.dumps(safe_mix)
        assert len(json_str) > 500
