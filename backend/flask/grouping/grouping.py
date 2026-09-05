"""
grouping.py — Build a structured session grouping from an arbitrary list of tracks.

Each track needs at minimum:
    - 'filename': str (the uploaded filename)

Optionally it can carry:
    - 'analysis': dict (output of analysis.analyze_track)

The grouping pipeline:
    1. Classify each track by filename (high confidence).
    2. If filename gives no match, fall back to audio heuristics (if analysis
       data is present).
    3. Map every classified role to a bus via bus_rules.
    4. Return a structured dict keyed by bus, preserving bus ordering.
"""

from __future__ import annotations

from collections import OrderedDict

from classify.roles import Role, ROLE_DISPLAY_NAMES
from classify.filename_hints import classify_by_filename
from classify.heuristic_classifier import classify_by_audio
from .bus_rules import BUS_ORDER, FALLBACK_BUS, get_bus_for_role


def _classify_track(track: dict) -> dict:
    """
    Classify a single track and return an enriched copy with role metadata.
    """
    filename = track.get("filename", "")

    # Step 1: Try filename-based classification
    role, confidence = classify_by_filename(filename)

    # Step 2: Fall back to audio heuristics if filename is uninformative
    if confidence == 0.0 and "analysis" in track:
        role, confidence = classify_by_audio(track["analysis"])

    bus = get_bus_for_role(role)

    return {
        **track,
        "role": role.value,
        "role_display": ROLE_DISPLAY_NAMES.get(role, "Other"),
        "confidence": round(confidence, 2),
        "bus": bus,
    }


def group_tracks(tracks: list[dict]) -> dict:
    """
    Group an arbitrary list of tracks into buses.

    Parameters
    ----------
    tracks : list[dict]
        Each dict must have at least a 'filename' key.
        Optionally include 'analysis' (from analyze_track) for heuristic
        fallback classification.

    Returns
    -------
    dict
        {
            "buses": OrderedDict[str, list[dict]],
                          # Keyed by bus name in canonical order.
                          # Each value is a list of enriched track dicts.
            "track_count": int,
            "bus_summary": dict[str, int],
                          # bus_name → number of tracks in that bus
            "unclassified_count": int,
                          # Number of tracks that fell into Unclassified
        }
    """
    # Classify all tracks
    classified = [_classify_track(t) for t in tracks]

    # Build ordered buses (only include buses that have tracks, plus always
    # include Unclassified if it has any)
    buses: OrderedDict[str, list[dict]] = OrderedDict()
    for bus_name in BUS_ORDER:
        bus_tracks = [t for t in classified if t["bus"] == bus_name]
        if bus_tracks:
            buses[bus_name] = bus_tracks

    # Catch any tracks with a bus not in BUS_ORDER (shouldn't happen, but safe)
    known_buses = set(BUS_ORDER)
    for t in classified:
        if t["bus"] not in known_buses:
            buses.setdefault(FALLBACK_BUS, []).append(t)

    bus_summary = {name: len(trks) for name, trks in buses.items()}
    unclassified_count = bus_summary.get(FALLBACK_BUS, 0)

    return {
        "buses": buses,
        "track_count": len(classified),
        "bus_summary": bus_summary,
        "unclassified_count": unclassified_count,
    }
