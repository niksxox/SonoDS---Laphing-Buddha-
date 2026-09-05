"""
test_rules.py — Comprehensive tests for rules/ engine modules.

Coverage:
    1. Knowledge Base constants and priority rules.
    2. Loudness target calculations & headroom management.
    3. EQ defaults and dynamic spectral unmasking cuts.
    4. Compressor defaults and dynamics-aware adjustments.
    5. Panning conventions (center anchors + stereo spreads).
    6. Auxiliary send defaults per role.
    7. Master rules engine baseline mix generation on real 9-stem project.
    8. Master rules engine baseline mix generation on a synthetic 18-track session.
"""

import pytest
import json
from pathlib import Path

from classify.roles import Role
from grouping.grouping import group_tracks
from rules.knowledge_base import MIXING_PRIORITY, FREQUENCY_RANGES, TARGET_MASTER_LUFS
from rules.loudness_targets import calculate_loudness_adjustments, find_anchor_track
from rules.eq_defaults import get_default_eq, resolve_spectral_masking
from rules.compression_defaults import get_default_compression
from rules.pan_defaults import calculate_panning
from rules.send_defaults import get_default_sends
from rules.rules_engine import generate_baseline_mix


# ═══════════════════════════════════════════════════════════════════════
# 1. KNOWLEDGE BASE
# ═══════════════════════════════════════════════════════════════════════

class TestKnowledgeBase:
    def test_every_role_in_mixing_priority(self):
        for r in Role:
            assert r in MIXING_PRIORITY, f"Missing priority for {r}"

    def test_lead_vocal_has_top_priority(self):
        assert MIXING_PRIORITY[Role.LEAD_VOCAL] == 1

    def test_frequency_ranges_coverage(self):
        expected_bands = {"sub", "bass", "low_mid", "mid", "upper_mid", "presence", "air"}
        assert set(FREQUENCY_RANGES.keys()) == expected_bands

    def test_target_master_lufs(self):
        assert TARGET_MASTER_LUFS == -14.0


# ═══════════════════════════════════════════════════════════════════════
# 2. LOUDNESS TARGETS
# ═══════════════════════════════════════════════════════════════════════

class TestLoudnessTargets:
    def test_anchor_selection_prefers_lead_vocal(self):
        tracks = [
            {"filename": "01_Drums.wav", "role": "drums"},
            {"filename": "02_Lead_Vocal.wav", "role": "lead_vocal"},
            {"filename": "03_Bass.wav", "role": "bass"},
        ]
        anchor = find_anchor_track(tracks)
        assert anchor is not None
        assert anchor["role"] == "lead_vocal"

    def test_anchor_fallback_when_no_vocal(self):
        tracks = [
            {"filename": "01_Pad.wav", "role": "pad"},
            {"filename": "02_Kick.wav", "role": "kick"},
        ]
        anchor = find_anchor_track(tracks)
        assert anchor is not None
        assert anchor["role"] == "kick"

    def test_calculate_loudness_adjustments(self):
        tracks = [
            {
                "id": "vocal_1",
                "filename": "Lead_Vocal.wav",
                "role": "lead_vocal",
                "analysis": {"loudness": {"integrated_lufs": -18.0, "peak_db": -6.0}},
            },
            {
                "id": "backing_1",
                "filename": "Backing_Vox.wav",
                "role": "backing_vocal",
                "analysis": {"loudness": {"integrated_lufs": -18.0, "peak_db": -8.0}},
            },
            {
                "id": "hihat_1",
                "filename": "HiHat.wav",
                "role": "hihat",
                "analysis": {"loudness": {"integrated_lufs": -18.0, "peak_db": -10.0}},
            },
        ]
        gains = calculate_loudness_adjustments(tracks)
        assert len(gains) == 3
        # Lead Vocal target relative = 0dB -> gain ~ 0
        assert -1.0 <= gains["vocal_1"] <= 1.0
        # Backing Vocal target relative = -4dB -> gain lower than lead
        assert gains["backing_1"] < gains["vocal_1"]
        # HiHat target relative = -9dB -> gain even lower
        assert gains["hihat_1"] < gains["backing_1"]


# ═══════════════════════════════════════════════════════════════════════
# 3. EQ & SPECTRAL MASKING RESOLUTION
# ═══════════════════════════════════════════════════════════════════════

class TestEQDefaultsAndMasking:
    def test_get_default_eq_returns_copy(self):
        eq1 = get_default_eq(Role.LEAD_VOCAL)
        eq2 = get_default_eq(Role.LEAD_VOCAL)
        assert eq1 == eq2
        eq1["hpf_freq"] = 999.0
        assert eq2["hpf_freq"] != 999.0

    def test_unmasking_cuts_applied(self):
        tracks = [
            {"id": "lead_vox", "filename": "Lead_Vocals.wav", "role": "lead_vocal"},
            {"id": "guitar_1", "filename": "Electric_Guitar.wav", "role": "guitar"},
        ]
        # Simulate severe masking where guitar masks lead vocal in mid band
        masking_data = {
            "pairwise_masking": [
                {
                    "track_1": "lead_vox",
                    "track_2": "guitar_1",
                    "masking_score": 0.50,
                    "dominant_band": "mid",
                }
            ]
        }
        res = resolve_spectral_masking(tracks, masking_data)
        assert "guitar_1" in res
        guitar_eq, remedies = res["guitar_1"]
        # Guitar should have received an extra unmasking cut in mid band
        assert len(remedies) == 1
        assert "Carved" in remedies[0]
        # Check that EQ bands include a negative cut near 1000 Hz
        cut_band = [b for b in guitar_eq["bands"] if b["freq"] == 1000.0]
        assert len(cut_band) == 1
        assert cut_band[0]["gain_db"] < 0.0


# ═══════════════════════════════════════════════════════════════════════
# 4. COMPRESSION DEFAULTS
# ═══════════════════════════════════════════════════════════════════════

class TestCompressionDefaults:
    def test_kick_has_slow_attack_for_punch(self):
        comp = get_default_compression(Role.KICK)
        assert comp["attack_ms"] >= 25.0
        assert comp["ratio"] == 4.0

    def test_dynamics_awareness_high_crest_factor(self):
        comp_norm = get_default_compression(Role.LEAD_VOCAL)
        analysis_high_crest = {"dynamics": {"crest_factor_db": 16.0, "dynamic_range_db": 10.0}}
        comp_dynamic = get_default_compression(Role.LEAD_VOCAL, analysis_high_crest)

        # High crest factor should tighten threshold and increase ratio
        assert comp_dynamic["ratio"] > comp_norm["ratio"]
        assert comp_dynamic["threshold_db"] < comp_norm["threshold_db"]


# ═══════════════════════════════════════════════════════════════════════
# 5. PANNING DEFAULTS
# ═══════════════════════════════════════════════════════════════════════

class TestPanDefaults:
    def test_center_anchors_stay_at_zero(self):
        tracks = [
            {"id": "k", "filename": "Kick.wav", "role": "kick"},
            {"id": "sn", "filename": "Snare.wav", "role": "snare"},
            {"id": "b", "filename": "Bass.wav", "role": "bass"},
            {"id": "v", "filename": "Lead_Vocals.wav", "role": "lead_vocal"},
        ]
        pans = calculate_panning(tracks)
        for t_id in ("k", "sn", "b", "v"):
            assert pans[t_id] == 0.0

    def test_multi_guitars_alternate_left_right(self):
        tracks = [
            {"id": "gtr_1", "filename": "Guitar_L.wav", "role": "guitar"},
            {"id": "gtr_2", "filename": "Guitar_R.wav", "role": "guitar"},
        ]
        pans = calculate_panning(tracks)
        assert pans["gtr_1"] < 0.0  # Left
        assert pans["gtr_2"] > 0.0  # Right


# ═══════════════════════════════════════════════════════════════════════
# 6. AUXILIARY SENDS
# ═══════════════════════════════════════════════════════════════════════

class TestSendDefaults:
    def test_kick_and_bass_have_zero_reverb(self):
        for role in (Role.KICK, Role.BASS, Role.SUB_BASS):
            sends = get_default_sends(role)
            assert sends["reverb"] == 0.0
            assert sends["delay"] == 0.0

    def test_lead_vocal_has_reverb_and_delay(self):
        sends = get_default_sends(Role.LEAD_VOCAL)
        assert sends["reverb"] > 0.0
        assert sends["delay"] > 0.0


# ═══════════════════════════════════════════════════════════════════════
# 7. INTEGRATION — REAL 9 STEMS MIX GENERATION
# ═══════════════════════════════════════════════════════════════════════

class TestRulesEngineRealStems:
    STEMS_DIR = Path(__file__).parent.parent.parent / "audio" / "stems"

    @pytest.fixture
    def real_session(self):
        stem_files = sorted(self.STEMS_DIR.glob("*.wav"))
        assert len(stem_files) == 9
        raw_tracks = [{"filename": f.name} for f in stem_files]
        return group_tracks(raw_tracks)

    def test_generate_baseline_mix_structure(self, real_session):
        mix = generate_baseline_mix(real_session)

        assert "mix_summary" in mix
        assert mix["mix_summary"]["total_tracks"] == 9
        assert mix["mix_summary"]["reference_track"]["role"] == "lead_vocal"

        assert "buses" in mix
        assert len(mix["buses"]) == 4  # Vocals, Drums, Bass, Instruments

        assert "tracks" in mix
        assert len(mix["tracks"]) == 9

    def test_every_track_has_full_parameter_set(self, real_session):
        mix = generate_baseline_mix(real_session)
        for t in mix["tracks"]:
            assert "gain_db" in t
            assert "pan" in t
            assert "eq" in t
            assert "hpf_freq" in t["eq"]
            assert "compressor" in t
            assert "ratio" in t["compressor"]
            assert "sends" in t
            assert "reverb" in t["sends"]
            assert "delay" in t["sends"]

    def test_json_serializability(self, real_session):
        mix = generate_baseline_mix(real_session)
        json_str = json.dumps(mix)
        assert len(json_str) > 500


# ═══════════════════════════════════════════════════════════════════════
# 8. INTEGRATION — SYNTHETIC 18-TRACK SESSION MIX GENERATION
# ═══════════════════════════════════════════════════════════════════════

class TestRulesEngineSyntheticLargeSet:
    @pytest.fixture
    def synthetic_session(self):
        raw_tracks = [
            {"filename": "01_Lead_Vocal.wav"},
            {"filename": "02_Backing_Vox_1.wav"},
            {"filename": "03_Backing_Vox_2.wav"},
            {"filename": "04_Kick.wav"},
            {"filename": "05_Snare.wav"},
            {"filename": "06_HiHat.wav"},
            {"filename": "07_Drum_Overheads.wav"},
            {"filename": "08_Bass_Guitar.wav"},
            {"filename": "09_Sub_808.wav"},
            {"filename": "10_Piano.wav"},
            {"filename": "11_Guitar_Rhythm_L.wav"},
            {"filename": "12_Guitar_Rhythm_R.wav"},
            {"filename": "13_Strings_Section.wav"},
            {"filename": "14_Brass_Horns.wav"},
            {"filename": "15_Synth_Pad.wav"},
            {"filename": "16_FX_Riser.wav"},
            {"filename": "17_Unknown_Track_A.wav"},
            {"filename": "18_Unknown_Track_B.wav"},
        ]
        session = group_tracks(raw_tracks)
        # Add synthetic masking data
        session["masking"] = {
            "pairwise_masking": [
                {
                    "track_1": "11_Guitar_Rhythm_L.wav",
                    "track_2": "01_Lead_Vocal.wav",
                    "masking_score": 0.45,
                    "dominant_band": "mid",
                }
            ]
        }
        return session

    def test_synthetic_baseline_mix_track_count(self, synthetic_session):
        mix = generate_baseline_mix(synthetic_session)
        assert mix["mix_summary"]["total_tracks"] == 18
        assert len(mix["tracks"]) == 18

    def test_unclassified_tracks_get_safe_defaults(self, synthetic_session):
        mix = generate_baseline_mix(synthetic_session)
        unclassified_tracks = [t for t in mix["tracks"] if t["bus"] == "Unclassified"]
        assert len(unclassified_tracks) == 2
        for t in unclassified_tracks:
            assert t["pan"] == 0.0
            assert t["sends"]["reverb"] == 0.10

    def test_masking_remedy_logged_for_guitar(self, synthetic_session):
        mix = generate_baseline_mix(synthetic_session)
        gtr = [t for t in mix["tracks"] if t["filename"] == "11_Guitar_Rhythm_L.wav"][0]
        assert len(gtr["masking_remedies"]) == 1
        assert "Carved" in gtr["masking_remedies"][0]

    def test_json_output_structure(self, synthetic_session):
        mix = generate_baseline_mix(synthetic_session)
        json_str = json.dumps(mix)
        parsed = json.loads(json_str)
        assert parsed["mix_summary"]["total_tracks"] == 18
        assert "Vocals" in parsed["buses"]
        assert "Unclassified" in parsed["buses"]
