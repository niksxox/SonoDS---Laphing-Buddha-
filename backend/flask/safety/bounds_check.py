"""
bounds_check.py — Physical and musical parameter bounds checking and hard-clamping.

Enforces strict safety limits on every mixing parameter (gain, pan, EQ frequencies,
compressor ratios/thresholds, and aux sends) to prevent digital clipping, speaker
damage, or unnatural acoustic artifacts.
"""

from __future__ import annotations
from classify.roles import Role

# ── Parameter Bounds Documentation & Constants ───────────────────────
PARAM_BOUNDS: dict[str, tuple[float, float]] = {
    "gain_db":              (-24.0, 12.0),     # Track fader gain in dBFS
    "pan":                  (-1.0, 1.0),       # Stereo pan position (-1.0 Left to +1.0 Right)
    "hpf_freq":             (20.0, 500.0),     # High Pass Filter cut-off in Hz
    "lpf_freq":             (2000.0, 20000.0), # Low Pass Filter cut-off in Hz
    "eq_band_gain_db":      (-12.0, 12.0),     # EQ band boost/cut in dB
    "eq_band_freq":         (20.0, 20000.0),   # EQ band center frequency in Hz
    "eq_band_q":            (0.1, 10.0),       # EQ band resonance Q factor
    "comp_threshold_db":    (-40.0, 0.0),      # Compressor threshold in dBFS
    "comp_ratio":           (1.0, 20.0),       # Compressor ratio (1:1 to 20:1)
    "comp_attack_ms":       (0.1, 500.0),      # Compressor attack time in ms
    "comp_release_ms":      (5.0, 3000.0),     # Compressor release time in ms
    "comp_makeup_gain_db":  (0.0, 18.0),       # Compressor makeup gain in dB
    "send_reverb":          (0.0, 1.0),        # Reverb send level (0.0 to 1.0)
    "send_delay":           (0.0, 1.0),        # Delay send level (0.0 to 1.0)
}

# Roles that MUST remain strictly centered (pan = 0.0)
CENTER_ROLES = {
    Role.LEAD_VOCAL.value,
    Role.KICK.value,
    Role.SNARE.value,
    Role.BASS.value,
    Role.SUB_BASS.value,
}


def _clamp(val: float, min_val: float, max_val: float) -> tuple[float, bool]:
    """Helper to clamp float value to [min_val, max_val] and return (clamped_val, was_clamped)."""
    if val < min_val:
        return min_val, True
    if val > max_val:
        return max_val, True
    return val, False


def clamp_track_parameters(track: dict) -> tuple[dict, bool, list[str]]:
    """
    Hard-clamp all parameters in a track dict to safe physical/musical bounds.

    Returns
    -------
    tuple[dict, bool, list[str]]
        (clamped_track_dict, is_clamped, list_of_warning_strings)
    """
    is_clamped = False
    warnings: list[str] = []

    # 1. Gain DB
    if "gain_db" in track:
        min_g, max_g = PARAM_BOUNDS["gain_db"]
        new_g, clamped = _clamp(float(track["gain_db"]), min_g, max_g)
        if clamped:
            is_clamped = True
            warnings.append(f"Gain {track['gain_db']}dB clamped to {new_g}dB")
            track["gain_db"] = round(new_g, 1)

    # 2. Pan
    if "pan" in track:
        role_val = track.get("role", "")
        if role_val in CENTER_ROLES:
            if track["pan"] != 0.0:
                is_clamped = True
                warnings.append(f"Pan {track['pan']} reset to 0.0 for center anchor role {role_val}")
                track["pan"] = 0.0
        else:
            min_p, max_p = PARAM_BOUNDS["pan"]
            new_p, clamped = _clamp(float(track["pan"]), min_p, max_p)
            if clamped:
                is_clamped = True
                warnings.append(f"Pan {track['pan']} clamped to {new_p}")
                track["pan"] = round(new_p, 2)

    # 3. EQ
    if "eq" in track and isinstance(track["eq"], dict):
        eq = track["eq"]
        if "hpf_freq" in eq and eq["hpf_freq"] > 0:
            min_h, max_h = PARAM_BOUNDS["hpf_freq"]
            new_h, clamped = _clamp(float(eq["hpf_freq"]), min_h, max_h)
            if clamped:
                is_clamped = True
                warnings.append(f"HPF {eq['hpf_freq']}Hz clamped to {new_h}Hz")
                eq["hpf_freq"] = round(new_h, 1)

        if "lpf_freq" in eq and eq["lpf_freq"] < 20000:
            min_l, max_l = PARAM_BOUNDS["lpf_freq"]
            new_l, clamped = _clamp(float(eq["lpf_freq"]), min_l, max_l)
            if clamped:
                is_clamped = True
                warnings.append(f"LPF {eq['lpf_freq']}Hz clamped to {new_l}Hz")
                eq["lpf_freq"] = round(new_l, 1)

        if "bands" in eq and isinstance(eq["bands"], list):
            for i, band in enumerate(eq["bands"]):
                if "gain_db" in band:
                    bg, clamped = _clamp(float(band["gain_db"]), *PARAM_BOUNDS["eq_band_gain_db"])
                    if clamped:
                        is_clamped = True
                        warnings.append(f"EQ Band {i} gain {band['gain_db']}dB clamped to {bg}dB")
                        band["gain_db"] = round(bg, 1)

                if "freq" in band:
                    bf, clamped = _clamp(float(band["freq"]), *PARAM_BOUNDS["eq_band_freq"])
                    if clamped:
                        is_clamped = True
                        warnings.append(f"EQ Band {i} freq {band['freq']}Hz clamped to {bf}Hz")
                        band["freq"] = round(bf, 1)

                if "q" in band:
                    bq, clamped = _clamp(float(band["q"]), *PARAM_BOUNDS["eq_band_q"])
                    if clamped:
                        is_clamped = True
                        warnings.append(f"EQ Band {i} Q {band['q']} clamped to {bq}")
                        band["q"] = round(bq, 2)

    # 4. Compressor
    if "compressor" in track and isinstance(track["compressor"], dict):
        comp = track["compressor"]
        if "threshold_db" in comp:
            ct, clamped = _clamp(float(comp["threshold_db"]), *PARAM_BOUNDS["comp_threshold_db"])
            if clamped:
                is_clamped = True
                warnings.append(f"Comp threshold {comp['threshold_db']}dB clamped to {ct}dB")
                comp["threshold_db"] = round(ct, 1)

        if "ratio" in comp:
            cr, clamped = _clamp(float(comp["ratio"]), *PARAM_BOUNDS["comp_ratio"])
            if clamped:
                is_clamped = True
                warnings.append(f"Comp ratio {comp['ratio']} clamped to {cr}")
                comp["ratio"] = round(cr, 1)

        if "attack_ms" in comp:
            ca, clamped = _clamp(float(comp["attack_ms"]), *PARAM_BOUNDS["comp_attack_ms"])
            if clamped:
                is_clamped = True
                warnings.append(f"Comp attack {comp['attack_ms']}ms clamped to {ca}ms")
                comp["attack_ms"] = round(ca, 1)

        if "release_ms" in comp:
            crel, clamped = _clamp(float(comp["release_ms"]), *PARAM_BOUNDS["comp_release_ms"])
            if clamped:
                is_clamped = True
                warnings.append(f"Comp release {comp['release_ms']}ms clamped to {crel}ms")
                comp["release_ms"] = round(crel, 1)

        if "makeup_gain_db" in comp:
            cm, clamped = _clamp(float(comp["makeup_gain_db"]), *PARAM_BOUNDS["comp_makeup_gain_db"])
            if clamped:
                is_clamped = True
                warnings.append(f"Comp makeup {comp['makeup_gain_db']}dB clamped to {cm}dB")
                comp["makeup_gain_db"] = round(cm, 1)

    # 5. Sends
    if "sends" in track and isinstance(track["sends"], dict):
        sends = track["sends"]
        if "reverb" in sends:
            sr, clamped = _clamp(float(sends["reverb"]), *PARAM_BOUNDS["send_reverb"])
            if clamped:
                is_clamped = True
                warnings.append(f"Reverb send {sends['reverb']} clamped to {sr}")
                sends["reverb"] = round(sr, 2)

        if "delay" in sends:
            sd, clamped = _clamp(float(sends["delay"]), *PARAM_BOUNDS["send_delay"])
            if clamped:
                is_clamped = True
                warnings.append(f"Delay send {sends['delay']} clamped to {sd}")
                sends["delay"] = round(sd, 2)

    return track, is_clamped, warnings


def clamp_bus_parameters(bus: dict) -> tuple[dict, bool, list[str]]:
    """
    Hard-clamp parameters in a bus dict.
    """
    is_clamped = False
    warnings: list[str] = []

    if "gain_db" in bus:
        new_g, clamped = _clamp(float(bus["gain_db"]), *PARAM_BOUNDS["gain_db"])
        if clamped:
            is_clamped = True
            warnings.append(f"Bus gain {bus['gain_db']}dB clamped to {new_g}dB")
            bus["gain_db"] = round(new_g, 1)

    if "pan" in bus:
        new_p, clamped = _clamp(float(bus["pan"]), *PARAM_BOUNDS["pan"])
        if clamped:
            is_clamped = True
            warnings.append(f"Bus pan {bus['pan']} clamped to {new_p}")
            bus["pan"] = round(new_p, 2)

    return bus, is_clamped, warnings
