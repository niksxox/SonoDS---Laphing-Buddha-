"""
heuristic_classifier.py — Classify a stem's role using DSP analysis features.

Uses the output dict from `analysis.analyze_track()` to infer a role when the
filename gives no useful hints (confidence == 0 from filename_hints).

The heuristic is intentionally simple — no ML model, just expert thresholds
on spectral centroid, band energy distribution, dynamics, and stereo width.
Confidence is lower than filename matches (max ~0.65) because audio features
alone are inherently ambiguous.
"""

from __future__ import annotations

from .roles import Role


def classify_by_audio(analysis: dict) -> tuple[Role, float]:
    """
    Classify a stem role from its DSP analysis dict.

    Parameters
    ----------
    analysis : dict
        Output of `analysis.analyze_track()`.  Expected keys:
            - spectrum.spectral_centroid (float, Hz)
            - spectrum.sub_energy, bass_energy, mid_energy, etc.
            - dynamics.crest_factor_db (float)
            - dynamics.dynamic_range_db (float)
            - loudness.integrated_lufs (float)

    Returns
    -------
    (Role, confidence)
        confidence ∈ [0.0, 0.65].  Returns (Role.OTHER, 0.0) if nothing fits.
    """
    spectrum = analysis.get("spectrum", {})
    dynamics = analysis.get("dynamics", {})
    loudness = analysis.get("loudness", {})

    centroid = spectrum.get("spectral_centroid", 0.0)
    sub_e = spectrum.get("sub_energy", 0.0)
    bass_e = spectrum.get("bass_energy", 0.0)
    low_mid_e = spectrum.get("low_mid_energy", 0.0)
    mid_e = spectrum.get("mid_energy", 0.0)
    upper_mid_e = spectrum.get("upper_mid_energy", 0.0)
    presence_e = spectrum.get("presence_energy", 0.0)
    air_e = spectrum.get("air_energy", 0.0)

    crest = dynamics.get("crest_factor_db", 0.0)
    dyn_range = dynamics.get("dynamic_range_db", 0.0)
    lufs = loudness.get("integrated_lufs", -100.0)

    # Guard: silent track
    if lufs <= -70.0:
        return Role.OTHER, 0.0

    # ── Sub Bass / Bass ───────────────────────────────────────────────
    low_total = sub_e + bass_e
    if low_total > 0.65 and centroid < 250.0:
        if sub_e > 0.40:
            return Role.SUB_BASS, 0.60
        return Role.BASS, 0.60

    if low_total > 0.50 and centroid < 400.0:
        return Role.BASS, 0.50

    # ── Drums / Percussion ────────────────────────────────────────────
    # Drums typically have high crest factor (transients) and wide spectrum
    if crest > 12.0 and dyn_range > 10.0:
        # Very high transients → likely a hit (kick, snare, etc.)
        if low_total > 0.50:
            return Role.KICK, 0.50
        if air_e + presence_e > 0.30:
            return Role.HIHAT, 0.45
        return Role.DRUMS, 0.55

    if crest > 8.0 and dyn_range > 6.0:
        # Moderate transients — likely a full drum bus
        return Role.DRUMS, 0.50

    # ── Vocals ────────────────────────────────────────────────────────
    # Vocals: centroid in 800–4000 Hz, moderate dynamics, strong mid/upper-mid
    vocal_band = mid_e + upper_mid_e
    if vocal_band > 0.45 and 600.0 < centroid < 4500.0 and crest < 10.0:
        return Role.LEAD_VOCAL, 0.45

    # ── Keys / Piano ──────────────────────────────────────────────────
    # Piano & keys: broad spectrum with mid-centric energy, moderate transients
    if mid_e > 0.25 and low_mid_e > 0.15 and 400.0 < centroid < 2500.0 and 5.0 < crest < 12.0:
        return Role.KEYS, 0.40

    # ── Guitar ────────────────────────────────────────────────────────
    # Guitar: mid/upper-mid presence, centroid often 1000-4000 Hz
    if upper_mid_e > 0.15 and mid_e > 0.20 and 800.0 < centroid < 5000.0:
        return Role.GUITAR, 0.40

    # ── Strings / Brass ───────────────────────────────────────────────
    # Strings: smooth dynamics, mid-centric
    if mid_e > 0.30 and crest < 6.0 and dyn_range < 8.0 and 500.0 < centroid < 3000.0:
        return Role.STRINGS, 0.40

    # Brass: upper-mid/presence emphasis
    if presence_e > 0.15 and upper_mid_e > 0.15 and centroid > 1500.0:
        return Role.BRASS, 0.35

    # ── Pad / Synth ───────────────────────────────────────────────────
    # Pads: very smooth dynamics, low crest
    if crest < 5.0 and dyn_range < 5.0:
        return Role.PAD, 0.35

    # Lead synth: high centroid, present
    if centroid > 3000.0 and presence_e + air_e > 0.30:
        return Role.LEAD_SYNTH, 0.35

    # ── FX ────────────────────────────────────────────────────────────
    # Very high air/presence, wide dynamics — possibly FX/foley
    if air_e > 0.30 and centroid > 5000.0:
        return Role.FX, 0.30

    return Role.OTHER, 0.0
