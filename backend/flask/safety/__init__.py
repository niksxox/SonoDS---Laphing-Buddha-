"""
safety — Dynamic parameter clamping, health scoring, and safe deviation range system.

Replaces static tolerance thresholds with per-track, dynamically computed
safe deviation bounds based on DSP analysis and track health scores.
"""

from .bounds_check import clamp_track_parameters, clamp_bus_parameters, PARAM_BOUNDS
from .already_good_detector import compute_track_health_score, compute_session_health
from .safety_pipeline import apply_safety

__all__ = [
    "PARAM_BOUNDS",
    "clamp_track_parameters",
    "clamp_bus_parameters",
    "compute_track_health_score",
    "compute_session_health",
    "apply_safety",
]
