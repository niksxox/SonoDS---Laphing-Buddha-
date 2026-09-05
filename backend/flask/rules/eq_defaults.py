"""
eq_defaults.py — Default EQ starting points per role + spectral masking resolution logic.

Provides per-role parametric EQ templates and dynamic masking-resolution rules
that carve space for high-priority elements (e.g., Lead Vocal, Kick, Bass).
"""

from __future__ import annotations

from classify.roles import Role
from .knowledge_base import MIXING_PRIORITY, UNMASKING_CENTER_FREQS

# Default EQ settings per role
# Structure: { "hpf_freq": float, "lpf_freq": float, "bands": list[dict] }
DEFAULT_EQ_BY_ROLE: dict[Role, dict] = {
    Role.LEAD_VOCAL: {
        "hpf_freq": 100.0,
        "lpf_freq": 20000.0,
        "bands": [
            {"freq": 500.0,  "gain_db": -2.0, "q": 1.2, "type": "bell"},
            {"freq": 3500.0, "gain_db":  1.5, "q": 1.0, "type": "bell"},
            {"freq": 10000.0,"gain_db":  2.0, "q": 0.7, "type": "high_shelf"},
        ]
    },
    Role.BACKING_VOCAL: {
        "hpf_freq": 120.0,
        "lpf_freq": 18000.0,
        "bands": [
            {"freq": 800.0,  "gain_db": -2.0, "q": 1.0, "type": "bell"},
            {"freq": 8000.0, "gain_db": -1.5, "q": 0.7, "type": "high_shelf"},
        ]
    },
    Role.KICK: {
        "hpf_freq": 30.0,
        "lpf_freq": 16000.0,
        "bands": [
            {"freq": 60.0,   "gain_db":  2.0, "q": 1.0, "type": "bell"},
            {"freq": 300.0,  "gain_db": -3.0, "q": 1.2, "type": "bell"},
            {"freq": 3000.0, "gain_db":  2.0, "q": 1.5, "type": "bell"},
        ]
    },
    Role.SNARE: {
        "hpf_freq": 80.0,
        "lpf_freq": 18000.0,
        "bands": [
            {"freq": 200.0,  "gain_db":  1.5, "q": 1.0, "type": "bell"},
            {"freq": 400.0,  "gain_db": -2.0, "q": 1.2, "type": "bell"},
            {"freq": 5000.0, "gain_db":  2.0, "q": 1.0, "type": "bell"},
        ]
    },
    Role.HIHAT: {
        "hpf_freq": 300.0,
        "lpf_freq": 18000.0,
        "bands": [
            {"freq": 8000.0, "gain_db":  1.5, "q": 0.7, "type": "high_shelf"},
        ]
    },
    Role.DRUMS: {
        "hpf_freq": 40.0,
        "lpf_freq": 18000.0,
        "bands": [
            {"freq": 400.0,  "gain_db": -1.5, "q": 1.0, "type": "bell"},
            {"freq": 4000.0, "gain_db":  1.0, "q": 0.8, "type": "bell"},
        ]
    },
    Role.BASS: {
        "hpf_freq": 35.0,
        "lpf_freq": 8000.0,
        "bands": [
            {"freq": 80.0,   "gain_db":  1.5, "q": 1.0, "type": "bell"},
            {"freq": 250.0,  "gain_db": -2.5, "q": 1.2, "type": "bell"},
            {"freq": 1500.0, "gain_db":  1.0, "q": 1.5, "type": "bell"},
        ]
    },
    Role.SUB_BASS: {
        "hpf_freq": 25.0,
        "lpf_freq": 250.0,
        "bands": [
            {"freq": 50.0,   "gain_db":  2.0, "q": 1.0, "type": "bell"},
        ]
    },
    Role.LEAD_SYNTH: {
        "hpf_freq": 120.0,
        "lpf_freq": 18000.0,
        "bands": [
            {"freq": 500.0,  "gain_db": -1.5, "q": 1.0, "type": "bell"},
            {"freq": 2500.0, "gain_db":  1.5, "q": 1.0, "type": "bell"},
        ]
    },
    Role.PAD: {
        "hpf_freq": 120.0,
        "lpf_freq": 10000.0,
        "bands": [
            {"freq": 400.0,  "gain_db": -2.0, "q": 1.0, "type": "bell"},
        ]
    },
    Role.PIANO: {
        "hpf_freq": 80.0,
        "lpf_freq": 18000.0,
        "bands": [
            {"freq": 300.0,  "gain_db": -1.5, "q": 1.0, "type": "bell"},
            {"freq": 3000.0, "gain_db":  1.0, "q": 0.8, "type": "bell"},
        ]
    },
    Role.KEYS: {
        "hpf_freq": 90.0,
        "lpf_freq": 16000.0,
        "bands": [
            {"freq": 350.0,  "gain_db": -1.5, "q": 1.0, "type": "bell"},
        ]
    },
    Role.GUITAR: {
        "hpf_freq": 90.0,
        "lpf_freq": 12000.0,
        "bands": [
            {"freq": 400.0,  "gain_db": -2.0, "q": 1.0, "type": "bell"},
            {"freq": 2000.0, "gain_db":  1.0, "q": 1.0, "type": "bell"},
        ]
    },
    Role.STRINGS: {
        "hpf_freq": 100.0,
        "lpf_freq": 16000.0,
        "bands": [
            {"freq": 500.0,  "gain_db": -1.5, "q": 1.0, "type": "bell"},
        ]
    },
    Role.BRASS: {
        "hpf_freq": 120.0,
        "lpf_freq": 16000.0,
        "bands": [
            {"freq": 2500.0, "gain_db":  1.5, "q": 1.0, "type": "bell"},
        ]
    },
    Role.FX: {
        "hpf_freq": 150.0,
        "lpf_freq": 20000.0,
        "bands": []
    },
    Role.OTHER: {
        "hpf_freq": 80.0,
        "lpf_freq": 20000.0,
        "bands": []
    },
}


def get_default_eq(role: Role) -> dict:
    """Return a deep copy of the default EQ template for a role."""
    template = DEFAULT_EQ_BY_ROLE.get(role, DEFAULT_EQ_BY_ROLE[Role.OTHER])
    return {
        "hpf_freq": template["hpf_freq"],
        "lpf_freq": template["lpf_freq"],
        "bands": [dict(b) for b in template["bands"]],
    }


def resolve_spectral_masking(tracks: list[dict], masking_data: dict | None) -> dict[str, tuple[dict, list[str]]]:
    """
    Apply corrective unmasking EQ cuts to lower-priority tracks.

    Parameters
    ----------
    tracks : list[dict]
        List of track dicts.
    masking_data : dict | None
        Masking analysis output from analysis.compute_spectral_masking().

    Returns
    -------
    dict[str, tuple[dict, list[str]]]
        Mapping from track_key to (updated_eq_dict, list_of_remedy_descriptions).
    """
    # Initialize default EQ for every track
    track_eqs: dict[str, dict] = {}
    track_remedies: dict[str, list[str]] = {}
    track_by_id: dict[str, dict] = {}

    for t in tracks:
        t_id = t.get("id", t.get("filename", "unknown"))
        role_val = t.get("role", Role.OTHER.value)
        try:
            role = Role(role_val)
        except ValueError:
            role = Role.OTHER

        track_eqs[t_id] = get_default_eq(role)
        track_remedies[t_id] = []
        track_by_id[t_id] = t

    if not masking_data or "pairwise_masking" not in masking_data:
        return {t_id: (track_eqs[t_id], track_remedies[t_id]) for t_id in track_eqs}

    pairwise = masking_data.get("pairwise_masking", [])

    for pair in pairwise:
        t1_id = str(pair.get("track_1", ""))
        t2_id = str(pair.get("track_2", ""))
        score = pair.get("masking_score", 0.0)
        dominant_band = pair.get("dominant_band", "mid")

        if score < 0.25 or t1_id not in track_by_id or t2_id not in track_by_id:
            continue

        trk1 = track_by_id[t1_id]
        trk2 = track_by_id[t2_id]

        r1 = Role(trk1.get("role", Role.OTHER.value))
        r2 = Role(trk2.get("role", Role.OTHER.value))

        p1 = MIXING_PRIORITY.get(r1, 99)
        p2 = MIXING_PRIORITY.get(r2, 99)

        # Skip if equal priority
        if p1 == p2:
            continue

        # Determine masker (lower priority) and victim (higher priority)
        if p1 < p2:
            # t1 is higher priority (victim), t2 is masker
            victim, masker = trk1, trk2
            victim_id, masker_id = t1_id, t2_id
            victim_role, masker_role = r1, r2
        else:
            victim, masker = trk2, trk1
            victim_id, masker_id = t2_id, t1_id
            victim_role, masker_role = r2, r1

        # Apply a notch/dip cut on the masker track at the clashing band
        freq = UNMASKING_CENTER_FREQS.get(dominant_band, 1000.0)

        # Scale cut depth based on score (-1.5 dB to -3.5 dB)
        cut_db = round(max(-3.5, min(-1.5, -score * 6.0)), 1)

        # Check if masker already has a cut near this frequency
        existing_bands = track_eqs[masker_id]["bands"]
        has_cut = any(abs(b["freq"] - freq) < (freq * 0.3) for b in existing_bands)

        if not has_cut:
            track_eqs[masker_id]["bands"].append({
                "freq": freq,
                "gain_db": cut_db,
                "q": 1.5,
                "type": "bell"
            })
            remedy_msg = (
                f"Carved {cut_db}dB at {freq}Hz ({dominant_band}) on {masker.get('filename')} "
                f"to unmask {victim.get('filename')} ({victim_role.value})"
            )
            track_remedies[masker_id].append(remedy_msg)

    return {t_id: (track_eqs[t_id], track_remedies[t_id]) for t_id in track_eqs}
