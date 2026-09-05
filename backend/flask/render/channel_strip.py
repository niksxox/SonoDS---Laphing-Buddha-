"""
channel_strip.py — Individual track DSP channel strip processing using pedalboard.

Processing Chain Order:
    EQ (HPF, LPF, Parametric Bands) -> Compression -> Saturation -> Gain -> Pan

Also extracts auxiliary reverb and delay send signals for shared bus routing.
"""

from __future__ import annotations
import numpy as np
from pedalboard import (
    Pedalboard,
    HighpassFilter,
    LowpassFilter,
    PeakFilter,
    HighShelfFilter,
    LowShelfFilter,
    Compressor,
    Gain,
    Distortion,
)


def apply_constant_power_pan(y_stereo: np.ndarray, pan: float) -> np.ndarray:
    """
    Apply constant power stereo panning law to a (2, N) audio array.

    Parameters
    ----------
    y_stereo : np.ndarray
        Shape (2, samples) float32 array.
    pan : float
        Pan float value in [-1.0, 1.0]. -1.0 = Left, 0.0 = Center, +1.0 = Right.

    Returns
    -------
    np.ndarray
        Shape (2, samples) panned float32 array.
    """
    pan_clamped = max(-1.0, min(1.0, float(pan)))
    theta = (pan_clamped + 1.0) * (np.pi / 4.0)

    gain_l = float(np.cos(theta))
    gain_r = float(np.sin(theta))

    left = y_stereo[0] * gain_l
    right = y_stereo[1] * gain_r

    return np.vstack([left, right]).astype(np.float32)


def process_channel_strip(
    y: np.ndarray,
    sr: int = 44100,
    params: dict | None = None
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Process an audio signal through a complete channel strip.

    Parameters
    ----------
    y : np.ndarray
        Input audio array of shape (samples,) or (2, samples).
    sr : int
        Sample rate (default 44100).
    params : dict | None
        Track parameter dict containing 'gain_db', 'pan', 'eq', 'compressor',
        'saturation_db', and 'sends'.

    Returns
    -------
    tuple[np.ndarray, np.ndarray, np.ndarray]
        (processed_stereo_audio, reverb_send_audio, delay_send_audio)
        All arrays have shape (2, samples) and dtype float32.
    """
    y = np.asarray(y, dtype=np.float32)

    # 1. Normalize input geometry to (2, samples) stereo
    if y.ndim == 1:
        y_stereo = np.vstack([y, y])
    elif y.ndim == 2:
        if y.shape[0] == 1:
            y_stereo = np.vstack([y[0], y[0]])
        elif y.shape[0] == 2:
            y_stereo = y
        elif y.shape[1] == 2:
            y_stereo = y.T
        else:
            # Fallback for unexpected multi-channel
            y_mono = np.mean(y, axis=0)
            y_stereo = np.vstack([y_mono, y_mono])
    else:
        y_mono = np.ravel(y)
        y_stereo = np.vstack([y_mono, y_mono])

    if y_stereo.size == 0:
        empty = np.zeros((2, 0), dtype=np.float32)
        return empty, empty, empty

    params = params or {}
    plugins = []

    # ── Step 1: EQ ───────────────────────────────────────────────────
    eq = params.get("eq", {})
    if isinstance(eq, dict):
        hpf = eq.get("hpf_freq", 0.0)
        if hpf > 20.0:
            plugins.append(HighpassFilter(cutoff_frequency_hz=min(500.0, float(hpf))))

        lpf = eq.get("lpf_freq", 20000.0)
        if lpf < 20000.0:
            plugins.append(LowpassFilter(cutoff_frequency_hz=max(2000.0, float(lpf))))

        bands = eq.get("bands", [])
        if isinstance(bands, list):
            for b in bands:
                freq = float(b.get("freq", 1000.0))
                gain_db = float(b.get("gain_db", 0.0))
                q = float(b.get("q", 1.0))
                b_type = b.get("type", "bell")

                if abs(gain_db) < 0.01:
                    continue

                if b_type == "high_shelf":
                    plugins.append(HighShelfFilter(cutoff_frequency_hz=freq, gain_db=gain_db, q=q))
                elif b_type == "low_shelf":
                    plugins.append(LowShelfFilter(cutoff_frequency_hz=freq, gain_db=gain_db, q=q))
                else:
                    plugins.append(PeakFilter(cutoff_frequency_hz=freq, gain_db=gain_db, q=q))

    # ── Step 2: Compression ──────────────────────────────────────────
    comp = params.get("compressor", {})
    if isinstance(comp, dict) and comp:
        thresh = float(comp.get("threshold_db", -18.0))
        ratio = float(comp.get("ratio", 1.0))
        attack = float(comp.get("attack_ms", 20.0))
        release = float(comp.get("release_ms", 150.0))
        makeup = float(comp.get("makeup_gain_db", 0.0))

        if ratio > 1.01:
            plugins.append(Compressor(
                threshold_db=thresh,
                ratio=ratio,
                attack_ms=max(0.1, attack),
                release_ms=max(5.0, release)
            ))

        if abs(makeup) > 0.01:
            plugins.append(Gain(gain_db=makeup))

    # ── Step 3: Saturation / Distortion ──────────────────────────────
    sat_db = float(params.get("saturation_db", params.get("distortion_db", 0.0)))
    if sat_db > 0.1:
        plugins.append(Distortion(drive_db=min(12.0, sat_db)))

    # ── Step 4: Gain ─────────────────────────────────────────────────
    gain_db = float(params.get("gain_db", 0.0))
    if abs(gain_db) > 0.01:
        plugins.append(Gain(gain_db=gain_db))

    # Execute Pedalboard FX chain
    if plugins:
        board = Pedalboard(plugins)
        processed_audio = board(y_stereo, sample_rate=sr)
    else:
        processed_audio = y_stereo.copy()

    # ── Step 5: Pan Law ──────────────────────────────────────────────
    pan = float(params.get("pan", 0.0))
    panned_audio = apply_constant_power_pan(processed_audio, pan)

    # ── Step 6: Auxiliary Sends Extraction ───────────────────────────
    sends = params.get("sends", {})
    rev_send = float(sends.get("reverb", 0.0)) if isinstance(sends, dict) else 0.0
    del_send = float(sends.get("delay", 0.0)) if isinstance(sends, dict) else 0.0

    reverb_audio = (panned_audio * rev_send).astype(np.float32)
    delay_audio = (panned_audio * del_send).astype(np.float32)

    return panned_audio, reverb_audio, delay_audio
