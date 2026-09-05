"""
loudness_targets.py — Per-role loudness target calculations relative to lead vocal.

Computes exact gain adjustments (in dB) for each track in a session to achieve
a balanced, professional mix balance relative to the anchor track (lead vocal or
primary element).
"""

from __future__ import annotations

from classify.roles import Role
from .knowledge_base import MIXING_PRIORITY, TARGET_PEAK_HEADROOM_DB

# Relative target offsets (in dB) relative to the Lead Vocal anchor.
# E.g. Lead Vocal target = 0 dB relative; Backing Vocal = -4 dB; Kick = -1.5 dB.
RELATIVE_TARGET_DB: dict[Role, float] = {
    Role.LEAD_VOCAL:    0.0,
    Role.BACKING_VOCAL: -4.0,
    Role.KICK:          -1.5,
    Role.SNARE:         -2.0,
    Role.HIHAT:         -9.0,
    Role.DRUMS:         -2.0,
    Role.BASS:          -2.0,
    Role.SUB_BASS:      -3.0,
    Role.LEAD_SYNTH:    -3.0,
    Role.PAD:           -6.0,
    Role.PIANO:         -4.0,
    Role.KEYS:          -4.0,
    Role.GUITAR:        -4.0,
    Role.STRINGS:       -5.0,
    Role.BRASS:         -4.0,
    Role.FX:            -8.0,
    Role.OTHER:         -6.0,
}


def find_anchor_track(flat_tracks: list[dict]) -> dict | None:
    """
    Find the anchor track in the session (defaults to Lead Vocal, or highest priority track).
    """
    if not flat_tracks:
        return None

    # 1. Look for Lead Vocal
    for t in flat_tracks:
        role_str = t.get("role", Role.OTHER.value)
        if role_str == Role.LEAD_VOCAL.value:
            return t

    # 2. Fall back to highest priority role available
    sorted_by_priority = sorted(
        flat_tracks,
        key=lambda x: MIXING_PRIORITY.get(Role(x.get("role", Role.OTHER.value)), 99)
    )
    return sorted_by_priority[0]


def calculate_loudness_adjustments(flat_tracks: list[dict]) -> dict[str, float]:
    """
    Calculate gain adjustments (in dB) for each track.

    Parameters
    ----------
    flat_tracks : list[dict]
        List of track dicts (each having 'id' or 'filename', 'role', and optional 'analysis').

    Returns
    -------
    dict[str, float]
        Mapping from track identifier (id or filename) to gain adjustment in dB.
    """
    if not flat_tracks:
        return {}

    anchor = find_anchor_track(flat_tracks)
    anchor_lufs = -18.0  # Fallback default LUFS
    if anchor and "analysis" in anchor:
        anchor_lufs = anchor["analysis"].get("loudness", {}).get("integrated_lufs", -18.0)
        if anchor_lufs <= -70.0:
            anchor_lufs = -18.0

    gain_adjustments: dict[str, float] = {}

    for t in flat_tracks:
        track_key = t.get("id", t.get("filename", "unknown"))
        role_val = t.get("role", Role.OTHER.value)
        try:
            role = Role(role_val)
        except ValueError:
            role = Role.OTHER

        # Target relative offset for this role
        target_rel_db = RELATIVE_TARGET_DB.get(role, -6.0)

        # Measured LUFS or fallback RMS
        measured_lufs = -18.0
        if "analysis" in t:
            l_data = t["analysis"].get("loudness", {})
            measured_lufs = l_data.get("integrated_lufs", -18.0)
            if measured_lufs <= -70.0:
                measured_lufs = l_data.get("rms_db", -18.0)
                if measured_lufs <= -70.0:
                    measured_lufs = -18.0

        # Gain offset to bring measured LUFS to (anchor_lufs + target_rel_db)
        target_lufs = anchor_lufs + target_rel_db
        raw_gain_db = target_lufs - measured_lufs

        # Clamp individual track gain adjustments to safe range (-18dB to +12dB)
        clamped_gain_db = max(-18.0, min(12.0, round(raw_gain_db, 1)))
        gain_adjustments[track_key] = clamped_gain_db

    # Master Headroom Management:
    # Ensure total estimated mix peak doesn't clip
    # Estimate sum peak: peak_est = max(peak + gain) + 10 * log10(N)
    peaks = []
    for t in flat_tracks:
        track_key = t.get("id", t.get("filename", "unknown"))
        g = gain_adjustments[track_key]
        peak = -6.0
        if "analysis" in t:
            peak = t["analysis"].get("loudness", {}).get("peak_db", -6.0)
            if peak <= -70.0:
                peak = -6.0
        peaks.append(peak + g)

    if peaks:
        max_peak = max(peaks)
        if max_peak > TARGET_PEAK_HEADROOM_DB:
            attenuation = max_peak - TARGET_PEAK_HEADROOM_DB
            for k in gain_adjustments:
                gain_adjustments[k] = round(gain_adjustments[k] - attenuation, 1)

    return gain_adjustments
