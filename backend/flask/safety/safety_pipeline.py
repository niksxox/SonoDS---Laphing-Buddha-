"""
safety_pipeline.py — End-to-end safety checking, bounds clamping, and dynamic tolerance pipeline.

Applies parameter hard-clamping, computes per-track health scores, and calculates
dynamic per-track safe deviation ranges (replacing hardcoded threshold constants).
"""

from __future__ import annotations
from copy import deepcopy

from .bounds_check import clamp_track_parameters, clamp_bus_parameters
from .already_good_detector import compute_session_health

# Tolerance range formula constants:
# A healthy track (score=1.0) gets a tight safe range (2.0 dB).
# A poorly balanced track (score=0.0) gets an expanded safe range (6.5 dB).
MIN_SAFE_RANGE_DB = 2.0
MAX_SAFE_RANGE_SPAN = 4.5


def calculate_safe_deviation_range(health_score: float) -> float:
    """
    Calculate dynamic safe deviation range in dB for a track based on its health score.

    Parameters
    ----------
    health_score : float
        Score between 0.0 and 1.0 from already_good_detector.

    Returns
    -------
    float
        Safe deviation range in dB (e.g. 2.0 to 6.5 dB).
    """
    clamped_score = max(0.0, min(1.0, float(health_score)))
    range_db = MIN_SAFE_RANGE_DB + (1.0 - clamped_score) * MAX_SAFE_RANGE_SPAN
    return round(range_db, 1)


def apply_safety(mix_config: dict, session: dict) -> dict:
    """
    Apply safety pipeline to a complete mix configuration dict.

    Parameters
    ----------
    mix_config : dict
        Output from `rules_engine.generate_baseline_mix()` or `llm_mixer.get_llm_adjusted_mix()`.
    session : dict
        Stage 2 grouped session object.

    Returns
    -------
    dict
        Enriched mix_config with hard-clamped values, track health scores,
        dynamic safe deviation ranges, and safety warnings.
    """
    safe_mix = deepcopy(mix_config)

    # 1. Flatten session tracks to compute health scores
    flat_session_tracks = []
    buses_dict = session.get("buses", {})
    for bus_name, trk_list in buses_dict.items():
        for t in trk_list:
            flat_session_tracks.append(t)

    health_scores = compute_session_health(flat_session_tracks)

    total_warnings = 0
    total_clamped_tracks = 0

    # 2. Process and clamp each track in mix_config
    for track in safe_mix.get("tracks", []):
        t_id = track.get("id", track.get("filename", "unknown"))

        # Health score & dynamic safe deviation range
        score = health_scores.get(t_id, 0.85)  # Default fallback health score
        safe_range = calculate_safe_deviation_range(score)

        track["already_good_score"] = score
        track["safe_range_db"] = safe_range

        # Apply hard-clamping bounds
        clamped_track, is_clamped, warnings = clamp_track_parameters(track)

        track["is_clamped"] = is_clamped
        track["warnings"] = warnings

        if is_clamped:
            total_clamped_tracks += 1
            total_warnings += len(warnings)

    # 3. Process and clamp buses
    for bus_name, bus_data in safe_mix.get("buses", {}).items():
        clamped_bus, is_clamped, warnings = clamp_bus_parameters(bus_data)
        bus_data["is_clamped"] = is_clamped
        bus_data["warnings"] = warnings
        if is_clamped:
            total_warnings += len(warnings)

    # 4. Attach session safety summary
    safe_mix["safety_summary"] = {
        "total_warnings": total_warnings,
        "clamped_tracks_count": total_clamped_tracks,
        "average_health_score": round(sum(health_scores.values()) / max(1, len(health_scores)), 2) if health_scores else 0.85,
    }

    return safe_mix
