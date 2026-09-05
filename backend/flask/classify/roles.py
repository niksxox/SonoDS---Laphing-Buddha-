"""
roles.py — Canonical role labels for stem classification.

These roles are the internal vocabulary used by the classifier and grouping
modules.  The ROLE_DISPLAY_NAMES dict maps each role to the user-facing label
shown in the frontend UI (must stay consistent with stemConfig.js).

Frontend reference (stemConfig.js display names):
    Backing Vox, Bass, Brass, Drums, Guitar, Keys, Lead Vocals, Piano, Strings
"""

from enum import Enum, unique


@unique
class Role(str, Enum):
    """
    Exhaustive list of recognisable stem roles.

    Values are snake_case identifiers used internally.
    """

    # --- Vocals ---
    LEAD_VOCAL    = "lead_vocal"
    BACKING_VOCAL = "backing_vocal"

    # --- Drums / Percussion ---
    KICK          = "kick"
    SNARE         = "snare"
    HIHAT         = "hihat"
    DRUMS         = "drums"          # Full drum bus / mixed kit

    # --- Bass ---
    BASS          = "bass"
    SUB_BASS      = "sub_bass"

    # --- Synths & Keys ---
    LEAD_SYNTH    = "lead_synth"
    PAD           = "pad"
    PIANO         = "piano"
    KEYS          = "keys"

    # --- Acoustic / Orchestral ---
    GUITAR        = "guitar"
    STRINGS       = "strings"
    BRASS         = "brass"

    # --- Effects ---
    FX            = "fx"

    # --- Catch-all ---
    OTHER         = "other"


# ── User-facing display names (must match stemConfig.js) ──────────────
ROLE_DISPLAY_NAMES: dict[Role, str] = {
    Role.LEAD_VOCAL:    "Lead Vocals",
    Role.BACKING_VOCAL: "Backing Vox",
    Role.KICK:          "Kick",
    Role.SNARE:         "Snare",
    Role.HIHAT:         "Hi-Hat",
    Role.DRUMS:         "Drums",
    Role.BASS:          "Bass",
    Role.SUB_BASS:      "Sub Bass",
    Role.LEAD_SYNTH:    "Lead Synth",
    Role.PAD:           "Pad",
    Role.PIANO:         "Piano",
    Role.KEYS:          "Keys",
    Role.GUITAR:        "Guitar",
    Role.STRINGS:       "Strings",
    Role.BRASS:         "Brass",
    Role.FX:            "FX",
    Role.OTHER:         "Other",
}


# ── Role → grouping bus (used by grouping module) ─────────────────────
# The 5 canonical buses plus a fallback.
ROLE_TO_BUS: dict[Role, str] = {
    Role.LEAD_VOCAL:    "Vocals",
    Role.BACKING_VOCAL: "Vocals",
    Role.KICK:          "Drums",
    Role.SNARE:         "Drums",
    Role.HIHAT:         "Drums",
    Role.DRUMS:         "Drums",
    Role.BASS:          "Bass",
    Role.SUB_BASS:      "Bass",
    Role.LEAD_SYNTH:    "Instruments",
    Role.PAD:           "Instruments",
    Role.PIANO:         "Instruments",
    Role.KEYS:          "Instruments",
    Role.GUITAR:        "Instruments",
    Role.STRINGS:       "Instruments",
    Role.BRASS:         "Instruments",
    Role.FX:            "FX",
    Role.OTHER:         "Unclassified",
}
