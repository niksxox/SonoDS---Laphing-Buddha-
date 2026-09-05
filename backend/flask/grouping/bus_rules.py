"""
bus_rules.py — Maps roles to mix buses and defines bus ordering.

Buses:
    Vocals, Drums, Bass, Instruments, FX, Unclassified

Unclassified tracks (Role.OTHER or unknown) land in the fallback bus so
they are never silently dropped.
"""

from __future__ import annotations

from classify.roles import Role, ROLE_TO_BUS


# Canonical bus display order (matches a typical DAW layout).
BUS_ORDER: list[str] = [
    "Vocals",
    "Drums",
    "Bass",
    "Instruments",
    "FX",
    "Unclassified",
]

FALLBACK_BUS: str = "Unclassified"


def get_bus_for_role(role: Role) -> str:
    """
    Return the bus name for a given Role.

    Falls back to FALLBACK_BUS if the role isn't in the mapping.
    """
    return ROLE_TO_BUS.get(role, FALLBACK_BUS)
