"""
classify — Track role classification from filenames and audio features.

Pipeline:
    1. filename_hints.classify_by_filename(filename) → (role, confidence)
    2. heuristic_classifier.classify_by_audio(analysis_dict) → (role, confidence)
    3. Caller picks whichever has higher confidence (or combines).
"""

from .roles import Role, ROLE_DISPLAY_NAMES, ROLE_TO_BUS
from .filename_hints import classify_by_filename
from .heuristic_classifier import classify_by_audio

__all__ = [
    "Role",
    "ROLE_DISPLAY_NAMES",
    "ROLE_TO_BUS",
    "classify_by_filename",
    "classify_by_audio",
]
