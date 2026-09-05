"""
llm_mixer — LLM reasoning and refinement layer for multitrack audio mixing.

Uses an LLM (Gemini 2.0 Flash) to evaluate DSP analysis, track roles, and
baseline rules engine outputs, applying intelligent parameter adjustments
and generating human-understandable mixing rationale for each track.
"""

from .schema import MixAdjustmentSchema, TrackAdjustment, BusAdjustment
from .prompt_builder import build_mixing_prompt
from .llm_client import generate_mix_adjustments
from .llm_mixer import get_llm_adjusted_mix

__all__ = [
    "MixAdjustmentSchema",
    "TrackAdjustment",
    "BusAdjustment",
    "build_mixing_prompt",
    "generate_mix_adjustments",
    "get_llm_adjusted_mix",
]
