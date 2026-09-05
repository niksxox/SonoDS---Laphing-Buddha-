"""
llm_mixer.py — Merges LLM reasoning adjustments into rules-engine baseline mix.

`get_llm_adjusted_mix(session, baseline_params)` orchestrates prompt creation,
LLM API invocation, schema validation, and parameter merging.
"""

from __future__ import annotations
from copy import deepcopy

from classify.roles import Role
from .prompt_builder import build_mixing_prompt
from .llm_client import generate_mix_adjustments
from .schema import MixAdjustmentSchema


CENTER_ROLES = {
    Role.LEAD_VOCAL.value,
    Role.KICK.value,
    Role.SNARE.value,
    Role.BASS.value,
    Role.SUB_BASS.value,
}


def get_llm_adjusted_mix(
    session: dict,
    baseline_params: dict,
    api_key: str | None = None,
    client_func=generate_mix_adjustments,
) -> dict:
    """
    Generate LLM-refined mix parameters by merging LLM adjustments into baseline_params.

    Parameters
    ----------
    session : dict
        Stage 2 grouped session object.
    baseline_params : dict
        Stage 3 baseline mix output from `rules_engine.generate_baseline_mix()`.
    api_key : str | None
        Optional API key override for Gemini API.
    client_func : callable
        Function to call for generating adjustments (allows easy mocking in tests).

    Returns
    -------
    dict
        Enriched, merged mix configuration with LLM offsets and track-by-track reasoning.
    """
    merged_mix = deepcopy(baseline_params)

    # 1. Format prompts
    sys_prompt, user_prompt = build_mixing_prompt(session, baseline_params)

    # 2. Get validated adjustments from LLM (or fallback)
    adjustments: MixAdjustmentSchema = client_func(sys_prompt, user_prompt, api_key=api_key)

    # 3. Attach overall reasoning
    merged_mix["mix_summary"]["overall_reasoning"] = adjustments.overall_mix_reasoning

    # Index track adjustments by track_id
    track_adj_map = {t.track_id: t for t in adjustments.track_adjustments}
    bus_adj_map = {b.bus_name: b for b in adjustments.bus_adjustments}

    # 4. Merge track adjustments
    for track in merged_mix.get("tracks", []):
        t_id = track.get("id", track.get("filename"))
        adj = track_adj_map.get(t_id)

        if not adj:
            # Default reasoning if LLM made no specific tweak
            track["reasoning"] = "Baseline rules engine parameters applied. Signal is well-balanced."
            continue

        # Gain adjustment
        raw_gain = track.get("gain_db", 0.0) + adj.gain_db_offset
        track["gain_db"] = round(max(-24.0, min(12.0, raw_gain)), 1)

        # Pan adjustment
        role_val = track.get("role", "")
        if role_val in CENTER_ROLES:
            track["pan"] = 0.0  # Enforce center anchor invariant
        else:
            raw_pan = track.get("pan", 0.0) + adj.pan_offset
            track["pan"] = round(max(-1.0, min(1.0, raw_pan)), 2)

        # EQ adjustments
        if adj.eq_adjustments:
            eq = track.get("eq", {})
            if adj.eq_adjustments.hpf_freq is not None:
                eq["hpf_freq"] = round(adj.eq_adjustments.hpf_freq, 1)
            if adj.eq_adjustments.lpf_freq is not None:
                eq["lpf_freq"] = round(adj.eq_adjustments.lpf_freq, 1)
            for new_b in adj.eq_adjustments.additional_bands:
                eq.setdefault("bands", []).append(new_b.model_dump())

        # Compressor adjustments
        if adj.compressor_adjustments:
            comp = track.get("compressor", {})
            if adj.compressor_adjustments.threshold_db_offset is not None:
                comp["threshold_db"] = round(comp.get("threshold_db", -18.0) + adj.compressor_adjustments.threshold_db_offset, 1)
            if adj.compressor_adjustments.ratio_offset is not None:
                comp["ratio"] = round(max(1.0, comp.get("ratio", 2.0) + adj.compressor_adjustments.ratio_offset), 1)

        # Sends adjustments
        if adj.sends_adjustments:
            sends = track.get("sends", {})
            if adj.sends_adjustments.reverb_offset is not None:
                sends["reverb"] = round(max(0.0, min(1.0, sends.get("reverb", 0.0) + adj.sends_adjustments.reverb_offset)), 2)
            if adj.sends_adjustments.delay_offset is not None:
                sends["delay"] = round(max(0.0, min(1.0, sends.get("delay", 0.0) + adj.sends_adjustments.delay_offset)), 2)

        # Attach track-specific reasoning
        track["reasoning"] = adj.reasoning

    # 5. Merge bus adjustments
    for bus_name, bus_data in merged_mix.get("buses", {}).items():
        bus_adj = bus_adj_map.get(bus_name)
        if bus_adj:
            bus_data["gain_db"] = round(bus_data.get("gain_db", 0.0) + bus_adj.gain_db_offset, 1)
            bus_data["reasoning"] = bus_adj.reasoning
        else:
            bus_data["reasoning"] = f"Standard {bus_name} bus processing applied."

    return merged_mix
