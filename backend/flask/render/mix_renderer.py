"""
mix_renderer.py — Full multitrack audio mix rendering engine using pedalboard.

Executes per-channel processing, bus summing, shared reverb/delay return processing,
and master bus limiter rendering to produce a polished stereo audio mix.
"""

from __future__ import annotations
import numpy as np
from pedalboard import Pedalboard, Limiter

from .channel_strip import process_channel_strip
from .bus_processor import process_bus, process_shared_fx


def render_mix(
    tracks: list[dict],
    parameters: dict
) -> tuple[np.ndarray, int]:
    """
    Render an arbitrary list of audio tracks using the provided mix parameters.

    Parameters
    ----------
    tracks : list[dict]
        List of track dicts, each containing:
            - 'id' or 'filename': str
            - 'y': numpy array audio signal
            - 'sr': int (sample rate, default 44100)
    parameters : dict
        Full mix parameter configuration dict (from rules_engine, llm_mixer, or safety).
        Expected keys: 'tracks' (list), 'buses' (dict).

    Returns
    -------
    tuple[np.ndarray, int]
        (rendered_stereo_mix, sample_rate)
        rendered_stereo_mix has shape (2, max_samples) and dtype float32.
    """
    if not tracks:
        return np.zeros((2, 0), dtype=np.float32), 44100

    # 1. Determine common sample rate and max length N
    sr = int(tracks[0].get("sr", 44100))
    max_len = max(len(np.ravel(t["y"])) // (2 if t["y"].ndim == 2 and t["y"].shape[0] == 2 else 1) for t in tracks)

    if max_len == 0:
        return np.zeros((2, 0), dtype=np.float32), sr

    # 2. Index parameters by track_id and bus_name
    param_tracks = {t.get("id", t.get("filename")): t for t in parameters.get("tracks", [])}
    param_buses = parameters.get("buses", {})

    # Initialize bus audio accumulators and shared FX send accumulators
    bus_sums: dict[str, np.ndarray] = {}
    accumulated_reverb_send = np.zeros((2, max_len), dtype=np.float32)
    accumulated_delay_send = np.zeros((2, max_len), dtype=np.float32)

    # 3. Process each track through its Channel Strip
    for t_idx, t in enumerate(tracks):
        t_id = str(t.get("id", t.get("filename", f"track_{t_idx}")))
        y_raw = np.asarray(t["y"], dtype=np.float32)
        t_sr = int(t.get("sr", sr))

        # Pad track to max_len
        if y_raw.ndim == 1:
            if len(y_raw) < max_len:
                y_padded = np.pad(y_raw, (0, max_len - len(y_raw)))
            else:
                y_padded = y_raw[:max_len]
        elif y_raw.ndim == 2:
            if y_raw.shape[0] == 2:
                if y_raw.shape[1] < max_len:
                    y_padded = np.pad(y_raw, ((0, 0), (0, max_len - y_raw.shape[1])))
                else:
                    y_padded = y_raw[:, :max_len]
            else:
                y_mono = np.mean(y_raw, axis=0)
                if len(y_mono) < max_len:
                    y_padded = np.pad(y_mono, (0, max_len - len(y_mono)))
                else:
                    y_padded = y_mono[:max_len]
        else:
            y_mono = np.ravel(y_raw)
            if len(y_mono) < max_len:
                y_padded = np.pad(y_mono, (0, max_len - len(y_mono)))
            else:
                y_padded = y_mono[:max_len]

        # Lookup track parameters (fallback to default if unknown)
        t_params = param_tracks.get(t_id, {})
        bus_name = t_params.get("bus", "Unclassified")

        # Process channel strip
        panned_audio, rev_send, del_send = process_channel_strip(y_padded, sr=t_sr, params=t_params)

        # Accumulate into bus sum
        if bus_name not in bus_sums:
            bus_sums[bus_name] = np.zeros((2, max_len), dtype=np.float32)
        bus_sums[bus_name] += panned_audio

        # Accumulate shared FX sends
        accumulated_reverb_send += rev_send
        accumulated_delay_send += del_send

    # 4. Process each Bus
    processed_buses: list[np.ndarray] = []
    for bus_name, bus_audio in bus_sums.items():
        b_params = param_buses.get(bus_name, {})
        proc_bus = process_bus(bus_audio, sr=sr, bus_params=b_params)
        processed_buses.append(proc_bus)

    # 5. Process Shared FX Returns
    reverb_return, delay_return = process_shared_fx(accumulated_reverb_send, accumulated_delay_send, sr=sr)

    # 6. Sum all Bus outputs + Shared FX returns into Master Mix
    master_mix = np.zeros((2, max_len), dtype=np.float32)
    for pb in processed_buses:
        master_mix += pb
    master_mix += reverb_return
    master_mix += delay_return

    # 7. Apply Master Bus Processing & Master Limiter
    max_peak = float(np.max(np.abs(master_mix))) if master_mix.size > 0 else 0.0
    if max_peak > 0.95:
        master_limiter = Pedalboard([Limiter(threshold_db=-0.5, release_ms=100.0)])
        final_rendered_mix = master_limiter(master_mix, sample_rate=sr)
    else:
        final_rendered_mix = master_mix.copy()

    # 8. Hard Peak Guard (ensure strictly finite, non-clipping float32 bounds)
    final_rendered_mix = np.nan_to_num(final_rendered_mix, nan=0.0, posinf=1.0, neginf=-1.0)
    final_peak = float(np.max(np.abs(final_rendered_mix))) if final_rendered_mix.size > 0 else 0.0
    if final_peak > 1.0:
        final_rendered_mix = (final_rendered_mix / final_peak).astype(np.float32)

    return final_rendered_mix.astype(np.float32), sr
