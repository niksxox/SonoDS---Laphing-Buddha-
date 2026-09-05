"""
rules_engine.py — Deterministic rule-based baseline mixing engine.

`generate_baseline_mix(session)` accepts Stage 2's grouped session object and
produces the complete, professional mixing configuration (gain adjustments,
panning layout, parametric EQ with spectral unmasking cuts, dynamic compression,
and FX send levels) for every track and bus.

This deterministic rules engine replaces the static joblib model.
"""

from __future__ import annotations

from classify.roles import Role
from .knowledge_base import TARGET_MASTER_LUFS, TARGET_PEAK_HEADROOM_DB
from .loudness_targets import calculate_loudness_adjustments, find_anchor_track
from .eq_defaults import resolve_spectral_masking
from .compression_defaults import get_default_compression
from .pan_defaults import calculate_panning
from .send_defaults import get_default_sends


# Default bus-level processing templates
DEFAULT_BUS_PROCESSING: dict[str, dict] = {
    "Vocals": {
        "gain_db": 0.0,
        "pan": 0.0,
        "eq": {"hpf_freq": 80.0, "lpf_freq": 20000.0, "bands": [{"freq": 3500.0, "gain_db": 1.0, "q": 0.7, "type": "high_shelf"}]},
        "compressor": {"threshold_db": -16.0, "ratio": 2.0, "attack_ms": 30.0, "release_ms": 100.0, "makeup_gain_db": 1.0, "knee_db": 3.0},
    },
    "Drums": {
        "gain_db": 0.0,
        "pan": 0.0,
        "eq": {"hpf_freq": 30.0, "lpf_freq": 20000.0, "bands": []},
        "compressor": {"threshold_db": -14.0, "ratio": 3.0, "attack_ms": 30.0, "release_ms": 100.0, "makeup_gain_db": 1.5, "knee_db": 2.0},
    },
    "Bass": {
        "gain_db": 0.0,
        "pan": 0.0,
        "eq": {"hpf_freq": 30.0, "lpf_freq": 10000.0, "bands": []},
        "compressor": {"threshold_db": -16.0, "ratio": 3.0, "attack_ms": 30.0, "release_ms": 150.0, "makeup_gain_db": 1.0, "knee_db": 2.0},
    },
    "Instruments": {
        "gain_db": 0.0,
        "pan": 0.0,
        "eq": {"hpf_freq": 80.0, "lpf_freq": 18000.0, "bands": []},
        "compressor": {"threshold_db": -18.0, "ratio": 2.0, "attack_ms": 40.0, "release_ms": 200.0, "makeup_gain_db": 0.5, "knee_db": 4.0},
    },
    "FX": {
        "gain_db": 0.0,
        "pan": 0.0,
        "eq": {"hpf_freq": 100.0, "lpf_freq": 20000.0, "bands": []},
        "compressor": {"threshold_db": -20.0, "ratio": 2.0, "attack_ms": 30.0, "release_ms": 200.0, "makeup_gain_db": 0.0, "knee_db": 4.0},
    },
    "Unclassified": {
        "gain_db": 0.0,
        "pan": 0.0,
        "eq": {"hpf_freq": 40.0, "lpf_freq": 20000.0, "bands": []},
        "compressor": {"threshold_db": -20.0, "ratio": 1.5, "attack_ms": 30.0, "release_ms": 150.0, "makeup_gain_db": 0.0, "knee_db": 4.0},
    },
}


def generate_baseline_mix(session: dict) -> dict:
    """
    Generate a full baseline mix configuration from a Stage 2 session dict.

    Parameters
    ----------
    session : dict
        Output from Stage 2 `grouping.group_tracks()`.  Contains 'buses', 'track_count', etc.
        Optionally may contain 'masking' key at top level if multitrack analysis was performed.

    Returns
    -------
    dict
        {
            "mix_summary": { ... },
            "buses": { ... },
            "tracks": [ ... ]
        }
    """
    buses_dict = session.get("buses", {})
    masking_data = session.get("masking")

    # 1. Flatten all tracks in session
    flat_tracks: list[dict] = []
    for bus_name, trk_list in buses_dict.items():
        for t in trk_list:
            flat_tracks.append(t)

    if not flat_tracks:
        return {
            "mix_summary": {
                "total_tracks": 0,
                "reference_track": None,
                "master_bus": {"target_lufs": TARGET_MASTER_LUFS, "peak_headroom_db": TARGET_PEAK_HEADROOM_DB},
            },
            "buses": {},
            "tracks": [],
        }

    # 2. Find reference anchor track
    anchor = find_anchor_track(flat_tracks)
    anchor_info = {
        "filename": anchor.get("filename", "") if anchor else "",
        "role": anchor.get("role", "") if anchor else "",
        "bus": anchor.get("bus", "") if anchor else "",
    }

    # 3. Calculate gain adjustments (loudness targets)
    gain_map = calculate_loudness_adjustments(flat_tracks)

    # 4. Calculate panning layout
    pan_map = calculate_panning(flat_tracks)

    # 5. Resolve EQ + spectral masking cuts
    eq_and_remedies = resolve_spectral_masking(flat_tracks, masking_data)

    # 6. Build per-track output parameters
    enriched_tracks: list[dict] = []

    for t in flat_tracks:
        t_id = t.get("id", t.get("filename", "unknown"))
        role_val = t.get("role", Role.OTHER.value)
        try:
            role = Role(role_val)
        except ValueError:
            role = Role.OTHER

        analysis_data = t.get("analysis")

        # Get EQ and unmasking remedies
        eq_config, remedies = eq_and_remedies.get(t_id, ({}, []))

        # Get Compressor config
        comp_config = get_default_compression(role, analysis_data)

        # Get FX Sends config
        send_config = get_default_sends(role)

        enriched_track = {
            "id": t_id,
            "filename": t.get("filename", ""),
            "role": role.value,
            "role_display": t.get("role_display", "Other"),
            "confidence": t.get("confidence", 0.0),
            "bus": t.get("bus", "Unclassified"),
            "gain_db": gain_map.get(t_id, 0.0),
            "pan": pan_map.get(t_id, 0.0),
            "eq": eq_config,
            "compressor": comp_config,
            "sends": send_config,
            "masking_remedies": remedies,
        }

        # Retain raw analysis data if present
        if analysis_data:
            enriched_track["analysis"] = analysis_data

        enriched_tracks.append(enriched_track)

    # 7. Build bus-level processing
    bus_configs: dict[str, dict] = {}
    for bus_name in buses_dict.keys():
        template = DEFAULT_BUS_PROCESSING.get(bus_name, DEFAULT_BUS_PROCESSING["Unclassified"])
        bus_configs[bus_name] = {
            "bus_name": bus_name,
            "track_count": len(buses_dict[bus_name]),
            "gain_db": template["gain_db"],
            "pan": template["pan"],
            "eq": template["eq"],
            "compressor": template["compressor"],
        }

    return {
        "mix_summary": {
            "total_tracks": len(enriched_tracks),
            "reference_track": anchor_info,
            "master_bus": {
                "target_lufs": TARGET_MASTER_LUFS,
                "peak_headroom_db": TARGET_PEAK_HEADROOM_DB,
            },
        },
        "buses": bus_configs,
        "tracks": enriched_tracks,
    }
