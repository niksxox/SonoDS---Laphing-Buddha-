"""
render — DSP audio rendering engine using Spotify's pedalboard library.

Implements real-time per-channel processing, bus summing, shared FX returns,
and master limiter rendering for Auto Mode and Compare features.
"""

from .channel_strip import process_channel_strip
from .bus_processor import process_bus, process_shared_fx
from .mix_renderer import render_mix

__all__ = [
    "process_channel_strip",
    "process_bus",
    "process_shared_fx",
    "render_mix",
]
