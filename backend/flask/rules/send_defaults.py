"""
send_defaults.py — Reverb and Delay send conventions per role.

Auxiliary send levels are normalized float values between 0.0 (No Send) and 1.0 (Full Send).

Rules:
    • Low Frequency Anchor Elements (Kick, Bass, Sub Bass) have ZERO reverb/delay send
      to keep the low end tight and punchy.
    • Lead Vocal receives moderate reverb (0.25) and subtle delay (0.15) for depth.
    • Backing Vocals, Pads, Strings receive lush spatial reverb (0.30 - 0.40).
"""

from __future__ import annotations

from classify.roles import Role

# Auxiliary send levels per role
# Structure: { "reverb": float, "delay": float }
DEFAULT_SENDS_BY_ROLE: dict[Role, dict[str, float]] = {
    Role.LEAD_VOCAL:    {"reverb": 0.25, "delay": 0.15},
    Role.BACKING_VOCAL: {"reverb": 0.35, "delay": 0.10},
    Role.KICK:          {"reverb": 0.00, "delay": 0.00},
    Role.SNARE:         {"reverb": 0.20, "delay": 0.00},
    Role.HIHAT:         {"reverb": 0.05, "delay": 0.00},
    Role.DRUMS:         {"reverb": 0.10, "delay": 0.00},
    Role.BASS:          {"reverb": 0.00, "delay": 0.00},
    Role.SUB_BASS:      {"reverb": 0.00, "delay": 0.00},
    Role.LEAD_SYNTH:    {"reverb": 0.20, "delay": 0.15},
    Role.PAD:           {"reverb": 0.40, "delay": 0.05},
    Role.PIANO:         {"reverb": 0.20, "delay": 0.05},
    Role.KEYS:          {"reverb": 0.20, "delay": 0.05},
    Role.GUITAR:        {"reverb": 0.15, "delay": 0.05},
    Role.STRINGS:       {"reverb": 0.30, "delay": 0.00},
    Role.BRASS:         {"reverb": 0.20, "delay": 0.00},
    Role.FX:            {"reverb": 0.30, "delay": 0.20},
    Role.OTHER:         {"reverb": 0.10, "delay": 0.00},
}


def get_default_sends(role: Role) -> dict[str, float]:
    """
    Return a copy of the default send levels for a given role.
    """
    sends = DEFAULT_SENDS_BY_ROLE.get(role, DEFAULT_SENDS_BY_ROLE[Role.OTHER])
    return {
        "reverb": round(sends["reverb"], 2),
        "delay": round(sends["delay"], 2),
    }
