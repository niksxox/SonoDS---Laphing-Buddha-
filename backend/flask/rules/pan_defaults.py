"""
pan_defaults.py — Panning conventions and stereo layout rules per role.

Normalised pan scale: -1.0 (Full Left) to +1.0 (Full Right), 0.0 (Center).

Rules:
    • Center Anchor: Kick, Snare, Bass, Sub Bass, Lead Vocal are strictly centered (0.0).
    • Stereo Spread: Guitars, Backing Vocals, Keys, Strings, FX are intelligently panned
      across the L/R soundstage, alternating sides for multiple instances.
"""

from __future__ import annotations

from classify.roles import Role

# Standard pan positions per role when single instance
DEFAULT_PAN_BY_ROLE: dict[Role, float] = {
    Role.LEAD_VOCAL:    0.0,
    Role.KICK:          0.0,
    Role.SNARE:         0.0,
    Role.BASS:          0.0,
    Role.SUB_BASS:      0.0,
    Role.DRUMS:         0.0,
    Role.HIHAT:         0.25,   # Slightly right (drummer perspective)
    Role.BACKING_VOCAL: -0.35,  # Default offset if single
    Role.LEAD_SYNTH:    0.0,
    Role.PAD:           0.0,    # Pads usually stereo centered
    Role.PIANO:         -0.15,
    Role.KEYS:          0.15,
    Role.GUITAR:        -0.40,
    Role.STRINGS:       0.30,
    Role.BRASS:         -0.25,
    Role.FX:            0.50,
    Role.OTHER:         0.0,
}

# Pre-defined alternating pan pairs for multi-instance roles
PAN_SPREAD_PATTERNS: dict[Role, list[float]] = {
    Role.BACKING_VOCAL: [-0.40, 0.40, -0.60, 0.60, -0.20, 0.20],
    Role.GUITAR:        [-0.50, 0.50, -0.70, 0.70, -0.30, 0.30],
    Role.KEYS:          [-0.25, 0.25, -0.45, 0.45],
    Role.PIANO:         [-0.20, 0.20],
    Role.STRINGS:       [-0.35, 0.35, -0.55, 0.55],
    Role.BRASS:         [-0.30, 0.30, -0.50, 0.50],
    Role.FX:            [-0.60, 0.60, -0.80, 0.80],
}


def calculate_panning(flat_tracks: list[dict]) -> dict[str, float]:
    """
    Calculate panning positions (-1.0 to +1.0) for every track in a session.

    Parameters
    ----------
    flat_tracks : list[dict]
        List of track dicts.

    Returns
    -------
    dict[str, float]
        Mapping from track identifier (id or filename) to pan float value.
    """
    pan_assignments: dict[str, float] = {}

    # Track occurrences of each role to apply spread patterns
    role_counters: dict[Role, int] = {}

    for t in flat_tracks:
        t_id = t.get("id", t.get("filename", "unknown"))
        role_val = t.get("role", Role.OTHER.value)
        try:
            role = Role(role_val)
        except ValueError:
            role = Role.OTHER

        count = role_counters.get(role, 0)
        role_counters[role] = count + 1

        # Center anchors are strictly 0.0 regardless of count
        if role in (Role.LEAD_VOCAL, Role.KICK, Role.SNARE, Role.BASS, Role.SUB_BASS, Role.DRUMS):
            pan_assignments[t_id] = 0.0
            continue

        # If role has a spread pattern and multiple instances exist / pattern available
        spread = PAN_SPREAD_PATTERNS.get(role)
        if spread:
            pan_val = spread[count % len(spread)]
        else:
            pan_val = DEFAULT_PAN_BY_ROLE.get(role, 0.0)

        pan_assignments[t_id] = round(pan_val, 2)

    return pan_assignments
