"""
test_classify_grouping.py — Tests for classify/ and grouping/ modules.

Coverage:
    1. Role enum completeness and display names
    2. Filename-based classification (keyword matching)
    3. Heuristic (audio-feature) classification
    4. Bus rules mapping
    5. Grouping on the 9 real stems in backend/audio/stems/
    6. Grouping on a synthetic 18-track set with edge cases
"""

import pytest
import json
from pathlib import Path
from collections import OrderedDict

from classify.roles import Role, ROLE_DISPLAY_NAMES, ROLE_TO_BUS
from classify.filename_hints import classify_by_filename
from classify.heuristic_classifier import classify_by_audio
from grouping.bus_rules import BUS_ORDER, FALLBACK_BUS, get_bus_for_role
from grouping.grouping import group_tracks


# ═══════════════════════════════════════════════════════════════════════
# 1. ROLE DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════

class TestRoles:
    def test_role_enum_has_17_members(self):
        assert len(Role) == 17

    def test_every_role_has_display_name(self):
        for role in Role:
            assert role in ROLE_DISPLAY_NAMES, f"Missing display name for {role}"

    def test_every_role_has_bus_mapping(self):
        for role in Role:
            assert role in ROLE_TO_BUS, f"Missing bus mapping for {role}"

    def test_frontend_display_names_match(self):
        """Verify the display names used by the frontend stemConfig.js."""
        assert ROLE_DISPLAY_NAMES[Role.LEAD_VOCAL] == "Lead Vocals"
        assert ROLE_DISPLAY_NAMES[Role.BACKING_VOCAL] == "Backing Vox"
        assert ROLE_DISPLAY_NAMES[Role.BASS] == "Bass"
        assert ROLE_DISPLAY_NAMES[Role.DRUMS] == "Drums"
        assert ROLE_DISPLAY_NAMES[Role.GUITAR] == "Guitar"
        assert ROLE_DISPLAY_NAMES[Role.KEYS] == "Keys"
        assert ROLE_DISPLAY_NAMES[Role.PIANO] == "Piano"
        assert ROLE_DISPLAY_NAMES[Role.STRINGS] == "Strings"
        assert ROLE_DISPLAY_NAMES[Role.BRASS] == "Brass"

    def test_role_values_are_snake_case_strings(self):
        """Role enum values should be str (for JSON serialization)."""
        for role in Role:
            assert isinstance(role.value, str)
            assert role.value == role.value.lower()


# ═══════════════════════════════════════════════════════════════════════
# 2. FILENAME-BASED CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════

class TestFilenameClassification:
    """Tests for classify_by_filename()."""

    # --- The 9 real stem filenames ---
    @pytest.mark.parametrize("filename, expected_role", [
        ("Jam Session - Charlie Puth - Lead Vocals_1.wav", Role.LEAD_VOCAL),
        ("Jam Session - Charlie Puth - Backing Vocals_1.wav", Role.BACKING_VOCAL),
        ("Jam Session - Charlie Puth - Bass_1.wav", Role.BASS),
        ("Jam Session - Charlie Puth - Drums_1.wav", Role.DRUMS),
        ("Jam Session - Charlie Puth - Guitar_1.wav", Role.GUITAR),
        ("Jam Session - Charlie Puth - Keys_1.wav", Role.KEYS),
        ("Jam Session - Charlie Puth - Piano_1.wav", Role.PIANO),
        ("Jam Session - Charlie Puth - Strings_1.wav", Role.STRINGS),
        ("Jam Session - Charlie Puth - Brass_1.wav", Role.BRASS),
    ])
    def test_real_stem_filenames(self, filename, expected_role):
        role, confidence = classify_by_filename(filename)
        assert role == expected_role, f"'{filename}' classified as {role}, expected {expected_role}"
        assert confidence >= 0.70, f"Low confidence {confidence} for '{filename}'"

    # --- Common DAW naming conventions ---
    @pytest.mark.parametrize("filename, expected_role", [
        ("Lead Vox Take 3.wav", Role.LEAD_VOCAL),
        ("MainVocal_final.wav", Role.LEAD_VOCAL),
        ("LD VOX comp.wav", Role.LEAD_VOCAL),
        ("BGV_harmonies.wav", Role.BACKING_VOCAL),
        ("Backing_Vox_2.wav", Role.BACKING_VOCAL),
        ("choir_section.wav", Role.BACKING_VOCAL),
        ("Kick_Sample.wav", Role.KICK),
        ("snare_top.wav", Role.SNARE),
        ("HiHat_closed.wav", Role.HIHAT),
        ("hi-hat open.wav", Role.HIHAT),
        ("sub_bass_808.wav", Role.SUB_BASS),
        ("bass guitar DI.wav", Role.BASS),
        ("synth_lead.wav", Role.LEAD_SYNTH),
        ("pad_ambient.wav", Role.PAD),
        ("Rhodes_solo.wav", Role.KEYS),
        ("acoustic_guitar.wav", Role.GUITAR),
        ("GTR_crunch.wav", Role.GUITAR),
        ("violin_section_A.wav", Role.STRINGS),
        ("trumpet_solo.wav", Role.BRASS),
        ("FX_riser.wav", Role.FX),
        ("foley_footsteps.wav", Role.FX),
    ])
    def test_common_naming_conventions(self, filename, expected_role):
        role, confidence = classify_by_filename(filename)
        assert role == expected_role, f"'{filename}' → {role}, expected {expected_role}"
        assert confidence > 0.0

    # --- Edge cases ---
    def test_empty_filename(self):
        role, conf = classify_by_filename("")
        assert role == Role.OTHER
        assert conf == 0.0

    def test_totally_uninformative_filename(self):
        role, conf = classify_by_filename("Track_042_take7_final_v3.wav")
        assert role == Role.OTHER
        assert conf == 0.0

    def test_case_insensitivity(self):
        role, _ = classify_by_filename("LEAD VOCALS mix.wav")
        assert role == Role.LEAD_VOCAL

        role, _ = classify_by_filename("DRUMS_bounce.wav")
        assert role == Role.DRUMS

    def test_multi_keyword_picks_first_match(self):
        """'Lead Vocal' should match before plain 'Vocal'."""
        role, conf = classify_by_filename("Lead Vocal take 2.wav")
        assert role == Role.LEAD_VOCAL
        assert conf >= 0.90


# ═══════════════════════════════════════════════════════════════════════
# 3. HEURISTIC (AUDIO) CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════

class TestHeuristicClassification:
    """Tests for classify_by_audio() with synthetic analysis dicts."""

    def _make_analysis(self, **overrides):
        """Build a minimal analysis dict with sensible defaults."""
        base = {
            "spectrum": {
                "spectral_centroid": 1000.0,
                "sub_energy": 0.05,
                "bass_energy": 0.10,
                "low_mid_energy": 0.15,
                "mid_energy": 0.25,
                "upper_mid_energy": 0.20,
                "presence_energy": 0.15,
                "air_energy": 0.10,
            },
            "dynamics": {
                "crest_factor_db": 6.0,
                "dynamic_range_db": 8.0,
            },
            "loudness": {
                "integrated_lufs": -18.0,
            },
        }
        # Allow overriding nested keys
        for key, val in overrides.items():
            if "." in key:
                section, field = key.split(".", 1)
                base[section][field] = val
            else:
                base[key] = val
        return base

    def test_bass_detection(self):
        analysis = self._make_analysis(
            **{
                "spectrum.sub_energy": 0.30,
                "spectrum.bass_energy": 0.40,
                "spectrum.spectral_centroid": 120.0,
            }
        )
        role, conf = classify_by_audio(analysis)
        assert role in (Role.BASS, Role.SUB_BASS)
        assert conf > 0.0

    def test_sub_bass_detection(self):
        analysis = self._make_analysis(
            **{
                "spectrum.sub_energy": 0.55,
                "spectrum.bass_energy": 0.20,
                "spectrum.spectral_centroid": 60.0,
            }
        )
        role, conf = classify_by_audio(analysis)
        assert role == Role.SUB_BASS
        assert conf >= 0.50

    def test_drums_high_transients(self):
        analysis = self._make_analysis(
            **{
                "dynamics.crest_factor_db": 15.0,
                "dynamics.dynamic_range_db": 12.0,
                "spectrum.sub_energy": 0.05,
                "spectrum.bass_energy": 0.10,
                "spectrum.air_energy": 0.05,
                "spectrum.presence_energy": 0.05,
            }
        )
        role, conf = classify_by_audio(analysis)
        assert role in (Role.DRUMS, Role.KICK, Role.SNARE, Role.HIHAT)
        assert conf > 0.0

    def test_silent_track_returns_other(self):
        analysis = self._make_analysis(**{"loudness.integrated_lufs": -100.0})
        role, conf = classify_by_audio(analysis)
        assert role == Role.OTHER
        assert conf == 0.0

    def test_vocal_detection(self):
        analysis = self._make_analysis(
            **{
                "spectrum.mid_energy": 0.30,
                "spectrum.upper_mid_energy": 0.25,
                "spectrum.spectral_centroid": 2000.0,
                "dynamics.crest_factor_db": 6.0,
            }
        )
        role, conf = classify_by_audio(analysis)
        assert role == Role.LEAD_VOCAL
        assert conf > 0.0

    def test_pad_smooth_dynamics(self):
        analysis = self._make_analysis(
            **{
                "dynamics.crest_factor_db": 3.0,
                "dynamics.dynamic_range_db": 3.0,
                "spectrum.spectral_centroid": 800.0,
                "spectrum.mid_energy": 0.20,
                "spectrum.upper_mid_energy": 0.10,
                "spectrum.sub_energy": 0.05,
                "spectrum.bass_energy": 0.10,
            }
        )
        role, conf = classify_by_audio(analysis)
        assert role == Role.PAD
        assert conf > 0.0


# ═══════════════════════════════════════════════════════════════════════
# 4. BUS RULES
# ═══════════════════════════════════════════════════════════════════════

class TestBusRules:
    def test_bus_order_has_6_entries(self):
        assert len(BUS_ORDER) == 6

    def test_fallback_bus_in_order(self):
        assert FALLBACK_BUS in BUS_ORDER

    def test_vocal_roles_map_to_vocals_bus(self):
        assert get_bus_for_role(Role.LEAD_VOCAL) == "Vocals"
        assert get_bus_for_role(Role.BACKING_VOCAL) == "Vocals"

    def test_drum_roles_map_to_drums_bus(self):
        for role in (Role.KICK, Role.SNARE, Role.HIHAT, Role.DRUMS):
            assert get_bus_for_role(role) == "Drums"

    def test_bass_roles_map_to_bass_bus(self):
        assert get_bus_for_role(Role.BASS) == "Bass"
        assert get_bus_for_role(Role.SUB_BASS) == "Bass"

    def test_instrument_roles_map_to_instruments_bus(self):
        for role in (Role.LEAD_SYNTH, Role.PAD, Role.PIANO, Role.KEYS,
                     Role.GUITAR, Role.STRINGS, Role.BRASS):
            assert get_bus_for_role(role) == "Instruments"

    def test_fx_maps_to_fx_bus(self):
        assert get_bus_for_role(Role.FX) == "FX"

    def test_other_maps_to_unclassified(self):
        assert get_bus_for_role(Role.OTHER) == "Unclassified"


# ═══════════════════════════════════════════════════════════════════════
# 5. GROUPING — 9 REAL STEMS
# ═══════════════════════════════════════════════════════════════════════

class TestGroupingRealStems:
    """Test group_tracks() on the 9 real stems (filename-based classification)."""

    STEMS_DIR = Path(__file__).parent.parent.parent / "audio" / "stems"

    @pytest.fixture
    def real_tracks(self):
        stem_files = sorted(self.STEMS_DIR.glob("*.wav"))
        assert len(stem_files) == 9, f"Expected 9 stems, found {len(stem_files)}"
        return [{"filename": f.name} for f in stem_files]

    def test_all_9_tracks_classified(self, real_tracks):
        result = group_tracks(real_tracks)
        assert result["track_count"] == 9

    def test_no_unclassified_tracks(self, real_tracks):
        result = group_tracks(real_tracks)
        assert result["unclassified_count"] == 0, (
            f"Unclassified tracks: {result['buses'].get('Unclassified', [])}"
        )

    def test_correct_bus_assignments(self, real_tracks):
        result = group_tracks(real_tracks)
        buses = result["buses"]

        # Lead Vocals + Backing Vocals → Vocals bus
        vocals = buses.get("Vocals", [])
        vocal_roles = {t["role"] for t in vocals}
        assert "lead_vocal" in vocal_roles
        assert "backing_vocal" in vocal_roles
        assert len(vocals) == 2

        # Drums → Drums bus
        drums = buses.get("Drums", [])
        assert len(drums) == 1
        assert drums[0]["role"] == "drums"

        # Bass → Bass bus
        bass = buses.get("Bass", [])
        assert len(bass) == 1
        assert bass[0]["role"] == "bass"

        # Guitar, Keys, Piano, Strings, Brass → Instruments bus
        instruments = buses.get("Instruments", [])
        inst_roles = {t["role"] for t in instruments}
        assert inst_roles == {"guitar", "keys", "piano", "strings", "brass"}
        assert len(instruments) == 5

    def test_result_is_json_serializable(self, real_tracks):
        result = group_tracks(real_tracks)
        json_str = json.dumps(result)
        assert len(json_str) > 100

    def test_bus_summary_matches_tracks(self, real_tracks):
        result = group_tracks(real_tracks)
        total_from_summary = sum(result["bus_summary"].values())
        assert total_from_summary == 9

    def test_bus_ordering(self, real_tracks):
        result = group_tracks(real_tracks)
        bus_names = list(result["buses"].keys())
        # Verify that the order follows BUS_ORDER
        order_indices = [BUS_ORDER.index(b) for b in bus_names]
        assert order_indices == sorted(order_indices), (
            f"Buses not in canonical order: {bus_names}"
        )


# ═══════════════════════════════════════════════════════════════════════
# 6. GROUPING — SYNTHETIC 18-TRACK SET
# ═══════════════════════════════════════════════════════════════════════

class TestGroupingSyntheticLargeSet:
    """Test group_tracks() on a synthetic 18-track session with edge cases."""

    @pytest.fixture
    def synthetic_tracks(self):
        return [
            # --- Vocals (3) ---
            {"filename": "01_Lead_Vocal_comp.wav"},
            {"filename": "02_Backing_Vox_L.wav"},
            {"filename": "03_BGV_harmonies.wav"},
            # --- Drums (4) ---
            {"filename": "04_Kick_in.wav"},
            {"filename": "05_Snare_top.wav"},
            {"filename": "06_HiHat_closed.wav"},
            {"filename": "07_Drum_OH_stereo.wav"},
            # --- Bass (2) ---
            {"filename": "08_Bass_DI.wav"},
            {"filename": "09_Sub_Bass_808.wav"},
            # --- Instruments (5) ---
            {"filename": "10_Piano_grand.wav"},
            {"filename": "11_Guitar_crunch.wav"},
            {"filename": "12_Strings_ensemble.wav"},
            {"filename": "13_Brass_section.wav"},
            {"filename": "14_Synth_Lead.wav"},
            # --- FX (2) ---
            {"filename": "15_FX_riser.wav"},
            {"filename": "16_foley_rain.wav"},
            # --- Unclassified (2) ---
            {"filename": "17_Track_42_final.wav"},
            {"filename": "18_bounce_print.wav"},
        ]

    def test_total_track_count(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        assert result["track_count"] == 18

    def test_vocals_bus(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        vocals = result["buses"].get("Vocals", [])
        assert len(vocals) == 3
        roles = {t["role"] for t in vocals}
        assert "lead_vocal" in roles
        assert "backing_vocal" in roles

    def test_drums_bus(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        drums = result["buses"].get("Drums", [])
        assert len(drums) == 4
        roles = {t["role"] for t in drums}
        assert "kick" in roles
        assert "snare" in roles
        assert "hihat" in roles

    def test_bass_bus(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        bass = result["buses"].get("Bass", [])
        assert len(bass) == 2
        roles = {t["role"] for t in bass}
        assert "bass" in roles
        assert "sub_bass" in roles

    def test_instruments_bus(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        instruments = result["buses"].get("Instruments", [])
        assert len(instruments) == 5
        roles = {t["role"] for t in instruments}
        assert roles == {"piano", "guitar", "strings", "brass", "lead_synth"}

    def test_fx_bus(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        fx = result["buses"].get("FX", [])
        assert len(fx) == 2

    def test_unclassified_fallback(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        unclassified = result["buses"].get("Unclassified", [])
        assert len(unclassified) == 2
        assert result["unclassified_count"] == 2
        # Verify these are the expected tracks
        filenames = {t["filename"] for t in unclassified}
        assert "17_Track_42_final.wav" in filenames
        assert "18_bounce_print.wav" in filenames

    def test_every_track_has_enriched_fields(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        for bus_name, bus_tracks in result["buses"].items():
            for t in bus_tracks:
                assert "role" in t
                assert "role_display" in t
                assert "confidence" in t
                assert "bus" in t
                assert isinstance(t["confidence"], float)

    def test_bus_summary_totals(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        total = sum(result["bus_summary"].values())
        assert total == 18

    def test_confidence_ranges(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        for bus_name, bus_tracks in result["buses"].items():
            for t in bus_tracks:
                assert 0.0 <= t["confidence"] <= 1.0

    def test_result_is_json_serializable(self, synthetic_tracks):
        result = group_tracks(synthetic_tracks)
        json_str = json.dumps(result)
        parsed = json.loads(json_str)
        assert parsed["track_count"] == 18


# ═══════════════════════════════════════════════════════════════════════
# 7. INTEGRATION — REAL STEMS WITH ANALYSIS DATA
# ═══════════════════════════════════════════════════════════════════════

class TestGroupingWithAnalysis:
    """
    Integration test: load real stems, run analysis, then group.
    Verifies the full pipeline works end-to-end.
    """

    STEMS_DIR = Path(__file__).parent.parent.parent / "audio" / "stems"

    @pytest.fixture
    def analyzed_tracks(self):
        """Load 2 seconds of each stem, run analysis, build track dicts."""
        try:
            import librosa
            from analysis import analyze_track
        except ImportError:
            pytest.skip("librosa or analysis module not available")

        stem_files = sorted(self.STEMS_DIR.glob("*.wav"))
        if len(stem_files) != 9:
            pytest.skip(f"Expected 9 stems, found {len(stem_files)}")

        tracks = []
        for f in stem_files:
            y, sr = librosa.load(f, sr=22050, duration=2.0, mono=True)
            analysis_data = analyze_track(y, sr, track_id=f.stem)
            tracks.append({
                "filename": f.name,
                "analysis": analysis_data,
            })
        return tracks

    def test_full_pipeline_all_classified(self, analyzed_tracks):
        result = group_tracks(analyzed_tracks)
        assert result["track_count"] == 9
        # With good filenames, nothing should be unclassified
        assert result["unclassified_count"] == 0

    def test_full_pipeline_enriched_with_analysis(self, analyzed_tracks):
        result = group_tracks(analyzed_tracks)
        for bus_tracks in result["buses"].values():
            for t in bus_tracks:
                assert "analysis" in t
                assert "role" in t
                assert "bus" in t
