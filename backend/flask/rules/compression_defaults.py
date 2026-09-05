"""
compression_defaults.py — Per-role dynamic compressor starting points.

Provides tailored dynamic control templates per role, adjusting threshold, ratio,
attack/release times, and makeup gain based on track crest factor and dynamic range.
"""

from __future__ import annotations

from classify.roles import Role

DEFAULT_COMPRESSION_BY_ROLE: dict[Role, dict] = {
    Role.LEAD_VOCAL: {
        "threshold_db": -16.0,
        "ratio": 3.0,
        "attack_ms": 15.0,
        "release_ms": 120.0,
        "makeup_gain_db": 2.0,
        "knee_db": 3.0,
    },
    Role.BACKING_VOCAL: {
        "threshold_db": -18.0,
        "ratio": 2.5,
        "attack_ms": 20.0,
        "release_ms": 150.0,
        "makeup_gain_db": 1.5,
        "knee_db": 3.0,
    },
    Role.KICK: {
        "threshold_db": -12.0,
        "ratio": 4.0,
        "attack_ms": 30.0,  # Slow attack lets transient pop through
        "release_ms": 100.0,
        "makeup_gain_db": 2.0,
        "knee_db": 2.0,
    },
    Role.SNARE: {
        "threshold_db": -14.0,
        "ratio": 4.0,
        "attack_ms": 20.0,
        "release_ms": 120.0,
        "makeup_gain_db": 2.5,
        "knee_db": 2.0,
    },
    Role.HIHAT: {
        "threshold_db": -20.0,
        "ratio": 2.0,
        "attack_ms": 10.0,
        "release_ms": 80.0,
        "makeup_gain_db": 0.0,
        "knee_db": 4.0,
    },
    Role.DRUMS: {
        "threshold_db": -15.0,
        "ratio": 3.5,
        "attack_ms": 25.0,
        "release_ms": 120.0,
        "makeup_gain_db": 2.0,
        "knee_db": 3.0,
    },
    Role.BASS: {
        "threshold_db": -16.0,
        "ratio": 4.0,
        "attack_ms": 25.0,
        "release_ms": 200.0,
        "makeup_gain_db": 2.0,
        "knee_db": 2.0,
    },
    Role.SUB_BASS: {
        "threshold_db": -14.0,
        "ratio": 4.0,
        "attack_ms": 30.0,
        "release_ms": 250.0,
        "makeup_gain_db": 1.5,
        "knee_db": 2.0,
    },
    Role.LEAD_SYNTH: {
        "threshold_db": -16.0,
        "ratio": 3.0,
        "attack_ms": 15.0,
        "release_ms": 150.0,
        "makeup_gain_db": 1.0,
        "knee_db": 3.0,
    },
    Role.PAD: {
        "threshold_db": -20.0,
        "ratio": 2.0,
        "attack_ms": 50.0,
        "release_ms": 300.0,
        "makeup_gain_db": 0.5,
        "knee_db": 5.0,
    },
    Role.PIANO: {
        "threshold_db": -18.0,
        "ratio": 2.0,
        "attack_ms": 30.0,
        "release_ms": 200.0,
        "makeup_gain_db": 1.0,
        "knee_db": 4.0,
    },
    Role.KEYS: {
        "threshold_db": -18.0,
        "ratio": 2.0,
        "attack_ms": 25.0,
        "release_ms": 180.0,
        "makeup_gain_db": 1.0,
        "knee_db": 4.0,
    },
    Role.GUITAR: {
        "threshold_db": -16.0,
        "ratio": 2.5,
        "attack_ms": 20.0,
        "release_ms": 150.0,
        "makeup_gain_db": 1.0,
        "knee_db": 3.0,
    },
    Role.STRINGS: {
        "threshold_db": -20.0,
        "ratio": 2.0,
        "attack_ms": 40.0,
        "release_ms": 250.0,
        "makeup_gain_db": 0.5,
        "knee_db": 5.0,
    },
    Role.BRASS: {
        "threshold_db": -15.0,
        "ratio": 3.0,
        "attack_ms": 20.0,
        "release_ms": 150.0,
        "makeup_gain_db": 1.5,
        "knee_db": 3.0,
    },
    Role.FX: {
        "threshold_db": -20.0,
        "ratio": 2.0,
        "attack_ms": 30.0,
        "release_ms": 200.0,
        "makeup_gain_db": 0.0,
        "knee_db": 4.0,
    },
    Role.OTHER: {
        "threshold_db": -18.0,
        "ratio": 2.0,
        "attack_ms": 25.0,
        "release_ms": 150.0,
        "makeup_gain_db": 0.0,
        "knee_db": 4.0,
    },
}


def get_default_compression(role: Role, analysis: dict | None = None) -> dict:
    """
    Return compressor settings tailored for a role, refined by audio dynamics.
    """
    template = DEFAULT_COMPRESSION_BY_ROLE.get(role, DEFAULT_COMPRESSION_BY_ROLE[Role.OTHER])
    comp = dict(template)

    if not analysis or "dynamics" not in analysis:
        return comp

    dyn = analysis.get("dynamics", {})
    crest = dyn.get("crest_factor_db", 0.0)
    dyn_range = dyn.get("dynamic_range_db", 0.0)

    # 1. High crest factor (transient-rich) → slightly higher ratio, lower threshold
    if crest > 14.0:
        comp["ratio"] = round(min(8.0, comp["ratio"] + 0.5), 1)
        comp["threshold_db"] = round(comp["threshold_db"] - 2.0, 1)

    # 2. Already squashed signal (low dynamic range) → gentler compression
    if 0.0 < dyn_range < 4.0:
        comp["ratio"] = round(max(1.5, comp["ratio"] - 0.5), 1)
        comp["makeup_gain_db"] = round(max(0.0, comp["makeup_gain_db"] - 1.0), 1)

    return comp
