"""
bus_processor.py — Bus summing, bus-level processing, and shared FX returns using pedalboard.

Handles sub-mix bus processing (Vocals, Drums, Bass, Instruments, FX) and shared
global Reverb/Delay return processors.
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
    Reverb,
    Delay,
)
from .channel_strip import apply_constant_power_pan


def process_bus(
    bus_audio: np.ndarray,
    sr: int = 44100,
    bus_params: dict | None = None
) -> np.ndarray:
    """
    Apply bus-level EQ, Compression, Gain, and Pan to a summed bus audio array.

    Parameters
    ----------
    bus_audio : np.ndarray
        Stereo bus audio of shape (2, samples).
    sr : int
        Sample rate (default 44100).
    bus_params : dict | None
        Bus parameters dict ('gain_db', 'pan', 'eq', 'compressor').

    Returns
    -------
    np.ndarray
        Processed stereo bus audio of shape (2, samples).
    """
    bus_audio = np.asarray(bus_audio, dtype=np.float32)

    if bus_audio.ndim == 1:
        bus_audio = np.vstack([bus_audio, bus_audio])

    if bus_audio.size == 0 or np.max(np.abs(bus_audio)) < 1e-7:
        return bus_audio

    bus_params = bus_params or {}
    plugins = []

    # 1. Bus EQ
    eq = bus_params.get("eq", {})
    if isinstance(eq, dict):
        hpf = float(eq.get("hpf_freq", 0.0))
        if hpf > 20.0:
            plugins.append(HighpassFilter(cutoff_frequency_hz=min(500.0, hpf)))

        lpf = float(eq.get("lpf_freq", 20000.0))
        if lpf < 20000.0:
            plugins.append(LowpassFilter(cutoff_frequency_hz=max(2000.0, lpf)))

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

    # 2. Bus Compressor
    comp = bus_params.get("compressor", {})
    if isinstance(comp, dict) and comp:
        thresh = float(comp.get("threshold_db", -16.0))
        ratio = float(comp.get("ratio", 1.0))
        attack = float(comp.get("attack_ms", 30.0))
        release = float(comp.get("release_ms", 100.0))
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

    # 3. Bus Gain
    gain_db = float(bus_params.get("gain_db", 0.0))
    if abs(gain_db) > 0.01:
        plugins.append(Gain(gain_db=gain_db))

    if plugins:
        board = Pedalboard(plugins)
        processed = board(bus_audio, sample_rate=sr)
    else:
        processed = bus_audio.copy()

    # 4. Bus Pan
    pan = float(bus_params.get("pan", 0.0))
    if abs(pan) > 0.001:
        processed = apply_constant_power_pan(processed, pan)

    return processed.astype(np.float32)


def process_shared_fx(
    reverb_send_sum: np.ndarray,
    delay_send_sum: np.ndarray,
    sr: int = 44100
) -> tuple[np.ndarray, np.ndarray]:
    """
    Process accumulated reverb and delay send signals through shared return processors.

    Parameters
    ----------
    reverb_send_sum : np.ndarray
        Summed reverb send audio array (2, samples).
    delay_send_sum : np.ndarray
        Summed delay send audio array (2, samples).
    sr : int
        Sample rate (default 44100).

    Returns
    -------
    tuple[np.ndarray, np.ndarray]
        (reverb_return_stereo, delay_return_stereo)
    """
    reverb_send_sum = np.asarray(reverb_send_sum, dtype=np.float32)
    delay_send_sum = np.asarray(delay_send_sum, dtype=np.float32)

    # 1. Process Reverb Return
    if reverb_send_sum.size > 0 and np.max(np.abs(reverb_send_sum)) > 1e-7:
        rev_board = Pedalboard([Reverb(room_size=0.6, wet_level=0.8, dry_level=0.0)])
        reverb_return = rev_board(reverb_send_sum, sample_rate=sr)
    else:
        reverb_return = np.zeros_like(reverb_send_sum)

    # 2. Process Delay Return
    if delay_send_sum.size > 0 and np.max(np.abs(delay_send_sum)) > 1e-7:
        del_board = Pedalboard([Delay(delay_seconds=0.25, feedback=0.25, mix=1.0)])
        delay_return = del_board(delay_send_sum, sample_rate=sr)
    else:
        delay_return = np.zeros_like(delay_send_sum)

    return reverb_return.astype(np.float32), delay_return.astype(np.float32)
