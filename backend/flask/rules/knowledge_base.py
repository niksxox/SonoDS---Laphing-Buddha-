"""
knowledge_base.py — Audio engineering domain rules, constants, and reference targets.

Contains canonical constants for mixing priority, frequency band definitions,
reference LUFS targets, and headroom thresholds.
"""

from classify.roles import Role

# ── Mix Priority Hierarchy ───────────────────────────────────────────
# Lower integer = higher priority in the mix (used to resolve spectral masking clashes).
MIXING_PRIORITY: dict[Role, int] = {
    Role.LEAD_VOCAL:    1,
    Role.KICK:          2,
    Role.SNARE:         2,
    Role.BASS:          2,
    Role.SUB_BASS:      3,
    Role.BACKING_VOCAL: 4,
    Role.LEAD_SYNTH:    4,
    Role.GUITAR:        4,
    Role.PIANO:         4,
    Role.KEYS:          5,
    Role.STRINGS:       5,
    Role.BRASS:         5,
    Role.HIHAT:         6,
    Role.DRUMS:         3,
    Role.PAD:           7,
    Role.FX:            8,
    Role.OTHER:         9,
}

# ── Frequency Ranges (in Hz) ──────────────────────────────────────────
FREQUENCY_RANGES: dict[str, tuple[float, float]] = {
    "sub": (20.0, 60.0),
    "bass": (60.0, 250.0),
    "low_mid": (250.0, 500.0),
    "mid": (500.0, 2000.0),
    "upper_mid": (2000.0, 4000.0),
    "presence": (4000.0, 8000.0),
    "air": (8000.0, 20000.0),
}

# Key frequencies for targeted unmasking cuts
UNMASKING_CENTER_FREQS: dict[str, float] = {
    "sub": 45.0,
    "bass": 100.0,
    "low_mid": 350.0,
    "mid": 1000.0,
    "upper_mid": 3000.0,
    "presence": 5000.0,
    "air": 10000.0,
}

# Target integrated LUFS for master output
TARGET_MASTER_LUFS: float = -14.0

# Master peak headroom target (dBFS)
TARGET_PEAK_HEADROOM_DB: float = -1.0
