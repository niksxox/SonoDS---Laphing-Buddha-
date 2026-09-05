"""
grouping — Map classified tracks to buses and produce session groupings.
"""

from .bus_rules import BUS_ORDER, FALLBACK_BUS, get_bus_for_role
from .grouping import group_tracks

__all__ = [
    "BUS_ORDER",
    "FALLBACK_BUS",
    "get_bus_for_role",
    "group_tracks",
]
