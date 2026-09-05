"""
prompt_builder.py — Formats multitrack session data into structured LLM prompts.

Serializes Stage 1 (DSP analysis), Stage 2 (classification & grouping), and
Stage 3 (rules engine baseline mix) into a prompt for the LLM.
"""

from __future__ import annotations
import json
from .schema import MixAdjustmentSchema

SYSTEM_PROMPT = """You are an elite, award-winning mixing engineer and AI Audio Producer mentoring a production team.

YOUR GOAL:
Analyze the multitrack session data (DSP measurements, instrument roles, session grouping, and baseline rules-engine predictions) and propose professional refinements.

RULES & CONSTRAINTS:
1. MINIMAL INTERVENTION: If a track's baseline parameters are already in a healthy, balanced target range, set `gain_db_offset: 0.0` and `pan_offset: 0.0`. Only adjust parameters when there is clear sonic justification (e.g. unmasking a lead vocal, taming an overly dynamic snare, balancing stereo width).
2. GAIN ADJUSTMENT BOUNDS: Keep `gain_db_offset` within -3.0 dB to +3.0 dB relative to baseline.
3. PAN ADJUSTMENT BOUNDS: Keep `pan_offset` within -0.2 to +0.2 relative to baseline. Do NOT move centered anchor tracks (Lead Vocal, Kick, Snare, Bass, Sub Bass) away from 0.0 pan.
4. REASONING MANDATE: Every track adjustment MUST include a concise, professional audio engineering rationale explaining why the tweak was made.
5. STRICT JSON OUTPUT: Return ONLY valid JSON adhering strictly to the required schema. No markdown wrapping outside the JSON, no conversational conversational commentary outside the JSON schema.
"""


def build_mixing_prompt(session: dict, baseline_params: dict) -> tuple[str, str]:
    """
    Format system and user prompts for the LLM mixing layer.

    Parameters
    ----------
    session : dict
        Stage 2 grouped session dict.
    baseline_params : dict
        Stage 3 baseline mix output from `rules_engine.generate_baseline_mix()`.

    Returns
    -------
    tuple[str, str]
        (system_prompt, user_prompt)
    """
    # Build clean representation of tracks for prompt
    tracks_for_prompt = []

    for t in baseline_params.get("tracks", []):
        t_summary = {
            "track_id": t.get("id"),
            "filename": t.get("filename"),
            "role": t.get("role"),
            "role_display": t.get("role_display"),
            "bus": t.get("bus"),
            "baseline_gain_db": t.get("gain_db"),
            "baseline_pan": t.get("pan"),
            "baseline_eq": t.get("eq"),
            "baseline_compressor": t.get("compressor"),
            "baseline_sends": t.get("sends"),
            "masking_remedies_applied": t.get("masking_remedies", []),
        }

        # Attach DSP metrics if available from Stage 1
        if "analysis" in t:
            an = t["analysis"]
            t_summary["dsp_analysis"] = {
                "loudness": an.get("loudness"),
                "spectrum": an.get("spectrum"),
                "dynamics": an.get("dynamics"),
                "stereo": an.get("stereo"),
            }
        tracks_for_prompt.append(t_summary)

    prompt_payload = {
        "mix_summary": baseline_params.get("mix_summary", {}),
        "masking_analysis": session.get("masking", {}),
        "buses": baseline_params.get("buses", {}),
        "tracks": tracks_for_prompt,
        "json_schema_reference": MixAdjustmentSchema.model_json_schema(),
    }

    user_prompt = f"""Evaluate this multitrack session and baseline mix configuration:

```json
{json.dumps(prompt_payload, indent=2)}
```

Provide your professional mixing refinements and rationale as structured JSON matching the schema."""

    return SYSTEM_PROMPT, user_prompt
