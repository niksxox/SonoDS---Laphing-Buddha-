"""
test_llm_mixer.py — Tests for the LLM reasoning and refinement layer.

Coverage:
    1. Schema validation (valid and invalid JSON payloads).
    2. Prompt builder output structure.
    3. Merging LLM adjustments into rules-engine baseline mix (mocked API).
    4. Center anchor invariant enforcement (ensuring Lead Vocal, Kick, Bass stay centered).
    5. Fallback behavior when API key is missing or calls fail.
    6. Retry-on-invalid-JSON logic.
    7. Live-API integration test on the real 9-stem project (skipped if no GEMINI_API_KEY).
"""

import os
import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock

from grouping.grouping import group_tracks
from rules.rules_engine import generate_baseline_mix
from llm_mixer.schema import MixAdjustmentSchema, TrackAdjustment, BusAdjustment, EQAdjustment, EQBandAdjustment
from llm_mixer.prompt_builder import build_mixing_prompt
from llm_mixer.llm_client import generate_mix_adjustments
from llm_mixer.llm_mixer import get_llm_adjusted_mix


# ═══════════════════════════════════════════════════════════════════════
# 1. SCHEMA VALIDATION
# ═══════════════════════════════════════════════════════════════════════

class TestSchemaValidation:
    def test_valid_schema_instantiation(self):
        payload = {
            "overall_mix_reasoning": "Slight vocal unmasking required.",
            "track_adjustments": [
                {
                    "track_id": "vocal_1",
                    "gain_db_offset": -1.0,
                    "pan_offset": 0.0,
                    "reasoning": "Tamed vocal gain by -1dB.",
                }
            ],
            "bus_adjustments": [
                {
                    "bus_name": "Vocals",
                    "gain_db_offset": 0.5,
                    "reasoning": "Slight bus boost.",
                }
            ],
        }
        obj = MixAdjustmentSchema.model_validate(payload)
        assert obj.overall_mix_reasoning == "Slight vocal unmasking required."
        assert len(obj.track_adjustments) == 1
        assert obj.track_adjustments[0].gain_db_offset == -1.0

    def test_missing_required_fields_raises_error(self):
        invalid_payload = {"track_adjustments": []}  # Missing overall_mix_reasoning
        with pytest.raises(Exception):
            MixAdjustmentSchema.model_validate(invalid_payload)


# ═══════════════════════════════════════════════════════════════════════
# 2. PROMPT BUILDER
# ═══════════════════════════════════════════════════════════════════════

class TestPromptBuilder:
    def test_build_mixing_prompt_formatting(self):
        raw_tracks = [
            {"filename": "Lead_Vocals.wav"},
            {"filename": "Bass_1.wav"},
        ]
        session = group_tracks(raw_tracks)
        baseline = generate_baseline_mix(session)

        sys_prompt, user_prompt = build_mixing_prompt(session, baseline)

        assert "award-winning mixing engineer" in sys_prompt
        assert "MINIMAL INTERVENTION" in sys_prompt
        assert "Lead_Vocals.wav" in user_prompt
        assert "json_schema_reference" in user_prompt


# ═══════════════════════════════════════════════════════════════════════
# 3. MERGING LOGIC & MOCKED API
# ═══════════════════════════════════════════════════════════════════════

class TestLLMMixerMerge:
    @pytest.fixture
    def sample_session_and_baseline(self):
        raw_tracks = [
            {"filename": "Jam Session - Charlie Puth - Lead Vocals_1.wav"},
            {"filename": "Jam Session - Charlie Puth - Guitar_1.wav"},
            {"filename": "Jam Session - Charlie Puth - Bass_1.wav"},
        ]
        session = group_tracks(raw_tracks)
        baseline = generate_baseline_mix(session)
        return session, baseline

    def test_mocked_llm_adjustments_applied_correctly(self, sample_session_and_baseline):
        session, baseline = sample_session_and_baseline

        mock_adjustments = MixAdjustmentSchema(
            overall_mix_reasoning="Overall mix is clean; trimmed guitar to unmask lead vocal.",
            track_adjustments=[
                TrackAdjustment(
                    track_id="Jam Session - Charlie Puth - Lead Vocals_1.wav",
                    gain_db_offset=1.5,
                    pan_offset=0.5,  # Should be ignored/clamped to 0.0 for Lead Vocal anchor
                    reasoning="Boosted lead vocal clarity.",
                ),
                TrackAdjustment(
                    track_id="Jam Session - Charlie Puth - Guitar_1.wav",
                    gain_db_offset=-2.0,
                    pan_offset=0.1,
                    eq_adjustments=EQAdjustment(
                        additional_bands=[EQBandAdjustment(freq=1000.0, gain_db=-2.5, q=1.5)]
                    ),
                    reasoning="Carved mid range on guitar.",
                ),
            ],
            bus_adjustments=[
                BusAdjustment(bus_name="Vocals", gain_db_offset=0.5, reasoning="Slight vocals bus boost.")
            ],
        )

        mock_client = lambda sys_p, usr_p, api_key=None: mock_adjustments

        final_mix = get_llm_adjusted_mix(session, baseline, client_func=mock_client)

        assert final_mix["mix_summary"]["overall_reasoning"] == "Overall mix is clean; trimmed guitar to unmask lead vocal."

        tracks_by_id = {t["id"]: t for t in final_mix["tracks"]}

        # 1. Lead Vocal check
        lead_vocal = tracks_by_id["Jam Session - Charlie Puth - Lead Vocals_1.wav"]
        assert lead_vocal["gain_db"] == round(baseline["tracks"][0]["gain_db"] + 1.5, 1)
        assert lead_vocal["pan"] == 0.0  # Center anchor invariant strictly enforced!
        assert lead_vocal["reasoning"] == "Boosted lead vocal clarity."

        # 2. Guitar check
        guitar = tracks_by_id["Jam Session - Charlie Puth - Guitar_1.wav"]
        assert guitar["reasoning"] == "Carved mid range on guitar."
        cut_band = [b for b in guitar["eq"]["bands"] if b["freq"] == 1000.0]
        assert len(cut_band) == 1
        assert cut_band[0]["gain_db"] == -2.5

        # 3. Bus check
        vocals_bus = final_mix["buses"]["Vocals"]
        assert vocals_bus["gain_db"] == 0.5
        assert vocals_bus["reasoning"] == "Slight vocals bus boost."


# ═══════════════════════════════════════════════════════════════════════
# 4. FALLBACK & RETRY LOGIC
# ═══════════════════════════════════════════════════════════════════════

class TestLLMClientFallbackAndRetry:
    def test_fallback_when_no_api_key(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        adj = generate_mix_adjustments("sys", "usr", api_key="")
        assert "Fallback" in adj.overall_mix_reasoning
        assert len(adj.track_adjustments) == 0

    def test_retry_logic_handles_invalid_json(self, monkeypatch):
        # Mock Gemini GenerativeModel response
        mock_model = MagicMock()

        # 1st response: Invalid JSON
        # 2nd response: Valid JSON
        valid_json = json.dumps({
            "overall_mix_reasoning": "Recovered from retry.",
            "track_adjustments": [],
            "bus_adjustments": [],
        })

        resp1 = MagicMock()
        resp1.text = "NOT_VALID_JSON"

        resp2 = MagicMock()
        resp2.text = valid_json

        mock_model.generate_content.side_effect = [resp1, resp2]

        # Patch genai
        mock_genai = MagicMock()
        mock_genai.GenerativeModel.return_value = mock_model
        monkeypatch.setattr("llm_mixer.llm_client.HAS_GENAI", True)
        monkeypatch.setattr("llm_mixer.llm_client.genai", mock_genai)

        adj = generate_mix_adjustments("sys", "usr", api_key="dummy_key")
        assert adj.overall_mix_reasoning == "Recovered from retry."


# ═══════════════════════════════════════════════════════════════════════
# 5. LIVE API INTEGRATION TEST (REAL 9 STEMS)
# ═══════════════════════════════════════════════════════════════════════

class TestLLMMixerLiveAPI:
    STEMS_DIR = Path(__file__).parent.parent.parent / "audio" / "stems"

    @pytest.mark.skipif(
        not os.environ.get("GEMINI_API_KEY"),
        reason="GEMINI_API_KEY environment variable not set. Skipping live API test."
    )
    def test_live_gemini_api_real_nine_stems(self):
        stem_files = sorted(self.STEMS_DIR.glob("*.wav"))
        assert len(stem_files) == 9

        raw_tracks = [{"filename": f.name} for f in stem_files]
        session = group_tracks(raw_tracks)
        baseline = generate_baseline_mix(session)

        final_mix = get_llm_adjusted_mix(session, baseline)

        assert "overall_reasoning" in final_mix["mix_summary"]
        assert len(final_mix["tracks"]) == 9
        for t in final_mix["tracks"]:
            assert "reasoning" in t
            assert len(t["reasoning"]) > 0

        # Verify output is valid JSON
        json_str = json.dumps(final_mix)
        assert len(json_str) > 1000
