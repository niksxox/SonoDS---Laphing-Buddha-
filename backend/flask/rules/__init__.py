"""
rules — Rule-based baseline mixing engine for multitrack audio sessions.

Provides audio engineering domain logic for loudness targeting, EQ defaults,
spectral masking resolution, compression parameters, panning layouts, and
effect send levels.
"""

from .knowledge_base import MIXING_PRIORITY, FREQUENCY_RANGES
from .loudness_targets import calculate_loudness_adjustments
from .eq_defaults import get_default_eq, resolve_spectral_masking
from .compression_defaults import get_default_compression
from .pan_defaults import calculate_panning
from .send_defaults import get_default_sends
from .rules_engine import generate_baseline_mix

__all__ = [
    "MIXING_PRIORITY",
    "FREQUENCY_RANGES",
    "calculate_loudness_adjustments",
    "get_default_eq",
    "resolve_spectral_masking",
    "get_default_compression",
    "calculate_panning",
    "get_default_sends",
    "generate_baseline_mix",
]
