"""
filename_hints.py — Classify a stem's role by keyword-matching its filename.

Returns (Role, confidence: float) where confidence ∈ [0.0, 1.0].

Strategy:
    • Exact-phrase matches (e.g. "lead vocal") → high confidence (0.95).
    • Single-word matches (e.g. "bass") → moderate confidence (0.70–0.85).
    • No match → (Role.OTHER, 0.0).

The keyword table is ordered so more-specific patterns are tested first
(e.g. "lead vocal" before "vocal", "sub bass" before "bass").
"""

from __future__ import annotations

import re
from .roles import Role


# ── Keyword table ─────────────────────────────────────────────────────
# Each entry: (compiled regex pattern, Role, confidence).
# Patterns are tested top-to-bottom; first match wins.
_KEYWORD_TABLE: list[tuple[re.Pattern, Role, float]] = []

# Letter-boundary guards so numbers and underscores (e.g. Bass_1, Kick01) count as boundaries
L_BOUND = r"(?<![a-zA-Z])"
R_BOUND = r"(?![a-zA-Z])"

def _kw(pattern: str, role: Role, confidence: float) -> None:
    """Register a case-insensitive keyword pattern."""
    full_pattern = pattern.replace(r"\b", L_BOUND) # Replace leading/trailing \b with letter boundary logic where needed
    # If pattern starts/ends with \b, replace properly
    _KEYWORD_TABLE.append((re.compile(pattern, re.IGNORECASE), role, confidence))


# ── Vocals ────────────────────────────────────────────────────────────
_KEYWORD_TABLE.extend([
    (re.compile(rf"{L_BOUND}lead[\s_-]*vox{R_BOUND}", re.I),          Role.LEAD_VOCAL,    0.95),
    (re.compile(rf"{L_BOUND}lead[\s_-]*vocals?{R_BOUND}", re.I),       Role.LEAD_VOCAL,    0.95),
    (re.compile(rf"{L_BOUND}main[\s_-]*vocals?{R_BOUND}", re.I),       Role.LEAD_VOCAL,    0.90),
    (re.compile(rf"{L_BOUND}main[\s_-]*vox{R_BOUND}", re.I),          Role.LEAD_VOCAL,    0.90),
    (re.compile(rf"{L_BOUND}ld[\s_-]*vox{R_BOUND}", re.I),            Role.LEAD_VOCAL,    0.85),
    (re.compile(rf"{L_BOUND}backing[\s_-]*vox{R_BOUND}", re.I),       Role.BACKING_VOCAL, 0.95),
    (re.compile(rf"{L_BOUND}backing[\s_-]*vocals?{R_BOUND}", re.I),     Role.BACKING_VOCAL, 0.95),
    (re.compile(rf"{L_BOUND}bgv{R_BOUND}", re.I),                     Role.BACKING_VOCAL, 0.85),
    (re.compile(rf"{L_BOUND}back[\s_-]*vox{R_BOUND}", re.I),          Role.BACKING_VOCAL, 0.85),
    (re.compile(rf"{L_BOUND}harmonies{R_BOUND}", re.I),               Role.BACKING_VOCAL, 0.85),
    (re.compile(rf"{L_BOUND}harmony{R_BOUND}", re.I),                 Role.BACKING_VOCAL, 0.75),
    (re.compile(rf"{L_BOUND}choir{R_BOUND}", re.I),                   Role.BACKING_VOCAL, 0.75),
    (re.compile(rf"{L_BOUND}vox{R_BOUND}", re.I),                     Role.LEAD_VOCAL,    0.60),
    (re.compile(rf"{L_BOUND}vocals?{R_BOUND}", re.I),                 Role.LEAD_VOCAL,    0.60),

# ── Drums / Percussion ───────────────────────────────────────────────
    (re.compile(rf"{L_BOUND}kick{R_BOUND}", re.I),                    Role.KICK,          0.90),
    (re.compile(rf"{L_BOUND}bd{R_BOUND}", re.I),                      Role.KICK,          0.80),
    (re.compile(rf"{L_BOUND}bass[\s_-]*drum{R_BOUND}", re.I),         Role.KICK,          0.85),
    (re.compile(rf"{L_BOUND}snare{R_BOUND}", re.I),                   Role.SNARE,         0.90),
    (re.compile(rf"{L_BOUND}snr{R_BOUND}", re.I),                     Role.SNARE,         0.85),
    (re.compile(rf"{L_BOUND}clap{R_BOUND}", re.I),                    Role.SNARE,         0.75),
    (re.compile(rf"{L_BOUND}hi[\s_-]*hat{R_BOUND}", re.I),            Role.HIHAT,         0.90),
    (re.compile(rf"{L_BOUND}hihat{R_BOUND}", re.I),                   Role.HIHAT,         0.90),
    (re.compile(rf"{L_BOUND}hh{R_BOUND}", re.I),                      Role.HIHAT,         0.80),
    (re.compile(rf"{L_BOUND}cymbal{R_BOUND}", re.I),                  Role.HIHAT,         0.75),
    (re.compile(rf"{L_BOUND}overhead{R_BOUND}", re.I),                Role.DRUMS,         0.75),
    (re.compile(rf"{L_BOUND}room{R_BOUND}", re.I),                    Role.DRUMS,         0.60),
    (re.compile(rf"{L_BOUND}tom{R_BOUND}", re.I),                     Role.DRUMS,         0.75),
    (re.compile(rf"{L_BOUND}perc{R_BOUND}", re.I),                    Role.DRUMS,         0.80),
    (re.compile(rf"{L_BOUND}percussion{R_BOUND}", re.I),              Role.DRUMS,         0.85),
    (re.compile(rf"{L_BOUND}drum{R_BOUND}", re.I),                    Role.DRUMS,         0.85),
    (re.compile(rf"{L_BOUND}drums{R_BOUND}", re.I),                   Role.DRUMS,         0.85),

# ── Bass ──────────────────────────────────────────────────────────────
    (re.compile(rf"{L_BOUND}sub[\s_-]*bass{R_BOUND}", re.I),          Role.SUB_BASS,      0.90),
    (re.compile(rf"{L_BOUND}808{R_BOUND}", re.I),                     Role.SUB_BASS,      0.85),
    (re.compile(rf"{L_BOUND}sub{R_BOUND}", re.I),                     Role.SUB_BASS,      0.75),
    (re.compile(rf"{L_BOUND}bass[\s_-]*guitar{R_BOUND}", re.I),       Role.BASS,          0.90),
    (re.compile(rf"{L_BOUND}bass{R_BOUND}", re.I),                    Role.BASS,          0.85),

# ── Synths & Keys ─────────────────────────────────────────────────────
    (re.compile(rf"{L_BOUND}lead[\s_-]*synth{R_BOUND}", re.I),        Role.LEAD_SYNTH,    0.90),
    (re.compile(rf"{L_BOUND}synth[\s_-]*lead{R_BOUND}", re.I),        Role.LEAD_SYNTH,    0.90),
    (re.compile(rf"{L_BOUND}pad{R_BOUND}", re.I),                     Role.PAD,           0.85),
    (re.compile(rf"{L_BOUND}synth{R_BOUND}", re.I),                   Role.LEAD_SYNTH,    0.70),
    (re.compile(rf"{L_BOUND}piano{R_BOUND}", re.I),                   Role.PIANO,         0.90),
    (re.compile(rf"{L_BOUND}keys{R_BOUND}", re.I),                    Role.KEYS,          0.85),
    (re.compile(rf"{L_BOUND}keyboard{R_BOUND}", re.I),                Role.KEYS,          0.80),
    (re.compile(rf"{L_BOUND}organ{R_BOUND}", re.I),                   Role.KEYS,          0.80),
    (re.compile(rf"{L_BOUND}rhodes{R_BOUND}", re.I),                  Role.KEYS,          0.80),
    (re.compile(rf"{L_BOUND}wurlitzer{R_BOUND}", re.I),              Role.KEYS,          0.80),
    (re.compile(rf"{L_BOUND}clav{R_BOUND}", re.I),                    Role.KEYS,          0.75),

# ── Acoustic / Orchestral ────────────────────────────────────────────
    (re.compile(rf"{L_BOUND}acoustic[\s_-]*guitar{R_BOUND}", re.I),   Role.GUITAR,        0.90),
    (re.compile(rf"{L_BOUND}elec[\s_-]*guitar{R_BOUND}", re.I),       Role.GUITAR,        0.90),
    (re.compile(rf"{L_BOUND}electric[\s_-]*guitar{R_BOUND}", re.I),   Role.GUITAR,        0.90),
    (re.compile(rf"{L_BOUND}gtr{R_BOUND}", re.I),                     Role.GUITAR,        0.85),
    (re.compile(rf"{L_BOUND}guitar{R_BOUND}", re.I),                  Role.GUITAR,        0.90),
    (re.compile(rf"{L_BOUND}string{R_BOUND}", re.I),                  Role.STRINGS,       0.85),
    (re.compile(rf"{L_BOUND}strings{R_BOUND}", re.I),                 Role.STRINGS,       0.85),
    (re.compile(rf"{L_BOUND}violin{R_BOUND}", re.I),                  Role.STRINGS,       0.80),
    (re.compile(rf"{L_BOUND}cello{R_BOUND}", re.I),                   Role.STRINGS,       0.80),
    (re.compile(rf"{L_BOUND}viola{R_BOUND}", re.I),                   Role.STRINGS,       0.80),
    (re.compile(rf"{L_BOUND}brass{R_BOUND}", re.I),                   Role.BRASS,         0.85),
    (re.compile(rf"{L_BOUND}horn{R_BOUND}", re.I),                    Role.BRASS,         0.80),
    (re.compile(rf"{L_BOUND}trumpet{R_BOUND}", re.I),                 Role.BRASS,         0.80),
    (re.compile(rf"{L_BOUND}trombone{R_BOUND}", re.I),                Role.BRASS,         0.80),
    (re.compile(rf"{L_BOUND}sax{R_BOUND}", re.I),                     Role.BRASS,         0.75),
    (re.compile(rf"{L_BOUND}saxophone{R_BOUND}", re.I),               Role.BRASS,         0.80),

# ── FX ────────────────────────────────────────────────────────────────
    (re.compile(rf"{L_BOUND}fx{R_BOUND}", re.I),                      Role.FX,            0.85),
    (re.compile(rf"{L_BOUND}sfx{R_BOUND}", re.I),                     Role.FX,            0.85),
    (re.compile(rf"{L_BOUND}effect{R_BOUND}", re.I),                  Role.FX,            0.75),
    (re.compile(rf"{L_BOUND}riser{R_BOUND}", re.I),                   Role.FX,            0.80),
    (re.compile(rf"{L_BOUND}sweep{R_BOUND}", re.I),                   Role.FX,            0.75),
    (re.compile(rf"{L_BOUND}impact{R_BOUND}", re.I),                  Role.FX,            0.75),
    (re.compile(rf"{L_BOUND}foley{R_BOUND}", re.I),                   Role.FX,            0.80),
    (re.compile(rf"{L_BOUND}ambien{R_BOUND}", re.I),                  Role.FX,            0.70),
    (re.compile(rf"{L_BOUND}noise{R_BOUND}", re.I),                   Role.FX,            0.65),
])


# ── Public API ────────────────────────────────────────────────────────

def classify_by_filename(filename: str) -> tuple[Role, float]:
    """
    Classify a stem role from its filename using keyword matching.

    Returns
    -------
    (Role, confidence)
        confidence == 0.0 means no match (role will be Role.OTHER).
    """
    if not filename:
        return Role.OTHER, 0.0

    for pattern, role, confidence in _KEYWORD_TABLE:
        if pattern.search(filename):
            return role, confidence

    return Role.OTHER, 0.0
