"""
already_good_detector.py — 0.0 to 1.0 "already healthy" score calculation per track.

Evaluates measured DSP metrics (loudness, crest factor, dynamic range, and spectral balance)
against ideal audio engineering benchmarks to assess how close a track is to optimal mix balance.
"""

from __future__ import annotations
from classify.roles import Role
from rules.loudness_targets import RELATIVE_TARGET_DB, find_anchor_track


def _score_loudness_health(measured_lufs: float, target_lufs: float) -> float:
    """Score loudness health based on absolute error from target LUFS."""
    if measured_lufs <= -70.0:
        return 0.5  # Silent track fallback

    delta = abs(measured_lufs - target_lufs)
    if delta <= 1.5:
        return 1.0
    if delta >= 10.0:
        return 0.0

    # Linear decay from 1.5dB (1.0) to 10.0dB (0.0)
    return round(1.0 - (delta - 1.5) / (10.0 - 1.5), 2)


def _score_dynamics_health(crest_factor_db: float, dynamic_range_db: float) -> float:
    """Score dynamic health based on crest factor and dynamic range."""
    # Severely clipped signal
    if crest_factor_db < 3.0:
        return 0.1
    if crest_factor_db < 5.0:
        return 0.4

    # Extremely high crest factor (uncontrolled peaks)
    if crest_factor_db > 20.0:
        return 0.5

    # Healthy crest factor (6.0 - 15.0 dB)
    cf_score = 1.0

    # Dynamic range score
    if dynamic_range_db < 3.0 and dynamic_range_db > 0:
        dr_score = 0.3
    else:
        dr_score = 1.0

    return round(0.7 * cf_score + 0.3 * dr_score, 2)


def _score_spectral_health(role: Role, spectrum: dict) -> float:
    """Score spectral health based on expected frequency energy profile per role."""
    if not spectrum:
        return 0.8  # Fallback neutral score

    sub_e = spectrum.get("sub_energy", 0.0)
    bass_e = spectrum.get("bass_energy", 0.0)
    mid_e = spectrum.get("mid_energy", 0.0)
    air_e = spectrum.get("air_energy", 0.0)

    # Sub/Bass tracks should have low-frequency energy
    if role in (Role.BASS, Role.SUB_BASS, Role.KICK):
        if (sub_e + bass_e) > 0.4:
            return 1.0
        return 0.5

    # Vocals should have mid/presence energy and not excessive sub mud
    if role in (Role.LEAD_VOCAL, Role.BACKING_VOCAL):
        if sub_e > 0.15:
            return 0.4  # Needs HPF filtering
        if mid_e > 0.2:
            return 1.0
        return 0.7

    return 0.85  # Generic default score for other instruments


def compute_track_health_score(track: dict, anchor_lufs: float = -18.0) -> float:
    """
    Compute 0.0 to 1.0 health score for a track.

    Parameters
    ----------
    track : dict
        Track object (containing 'role' and optional 'analysis').
    anchor_lufs : float
        LUFS of session reference anchor track (lead vocal).

    Returns
    -------
    float
        Score between 0.0 (poor, needs large correction) and 1.0 (already healthy).
    """
    role_val = track.get("role", Role.OTHER.value)
    try:
        role = Role(role_val)
    except ValueError:
        role = Role.OTHER

    analysis = track.get("analysis", {})
    loudness = analysis.get("loudness", {})
    dynamics = analysis.get("dynamics", {})
    spectrum = analysis.get("spectrum", {})

    measured_lufs = loudness.get("integrated_lufs", -18.0)
    if measured_lufs <= -70.0:
        measured_lufs = loudness.get("rms_db", -18.0)

    # Target LUFS for this track = anchor_lufs + role relative target
    target_rel = RELATIVE_TARGET_DB.get(role, -6.0)
    target_lufs = anchor_lufs + target_rel

    loudness_score = _score_loudness_health(measured_lufs, target_lufs)

    crest = dynamics.get("crest_factor_db", 8.0)
    dyn_range = dynamics.get("dynamic_range_db", 8.0)
    dynamics_score = _score_dynamics_health(crest, dyn_range)

    spectral_score = _score_spectral_health(role, spectrum)

    # Weighted average: 40% Loudness, 30% Dynamics, 30% Spectral
    overall_score = 0.40 * loudness_score + 0.30 * dynamics_score + 0.30 * spectral_score

    return round(max(0.0, min(1.0, overall_score)), 2)


def compute_session_health(flat_tracks: list[dict]) -> dict[str, float]:
    """
    Compute health scores for all tracks in a session.

    Returns
    -------
    dict[str, float]
        Mapping from track_key (id or filename) to 0.0 - 1.0 health score.
    """
    if not flat_tracks:
        return {}

    anchor = find_anchor_track(flat_tracks)
    anchor_lufs = -18.0
    if anchor and "analysis" in anchor:
        anchor_lufs = anchor["analysis"].get("loudness", {}).get("integrated_lufs", -18.0)
        if anchor_lufs <= -70.0:
            anchor_lufs = -18.0

    scores = {}
    for t in flat_tracks:
        t_id = t.get("id", t.get("filename", "unknown"))
        scores[t_id] = compute_track_health_score(t, anchor_lufs=anchor_lufs)

    return scores
