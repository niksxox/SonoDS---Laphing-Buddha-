"""
schema.py — Strict Pydantic JSON schema for LLM mixing adjustments & reasoning.

Defines the structured format expected from the LLM model when evaluating
and refining a multitrack session mix.
"""

from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel, Field


class EQBandAdjustment(BaseModel):
    freq: float = Field(..., description="Center frequency in Hz (e.g. 1000.0)")
    gain_db: float = Field(..., description="Gain adjustment in dB (e.g. -2.0 or 1.5)")
    q: float = Field(default=1.0, description="Quality factor Q (e.g. 1.0)")
    type: str = Field(default="bell", description="Filter shape: 'bell', 'high_shelf', 'low_shelf'")


class EQAdjustment(BaseModel):
    hpf_freq: Optional[float] = Field(None, description="Updated High Pass Filter frequency in Hz, if changing")
    lpf_freq: Optional[float] = Field(None, description="Updated Low Pass Filter frequency in Hz, if changing")
    additional_bands: List[EQBandAdjustment] = Field(default_factory=list, description="Additional EQ band tweaks")


class CompressorAdjustment(BaseModel):
    threshold_db_offset: Optional[float] = Field(None, description="Offset to compressor threshold in dB (e.g. -2.0)")
    ratio_offset: Optional[float] = Field(None, description="Offset to compressor ratio (e.g. +0.5)")


class SendsAdjustment(BaseModel):
    reverb_offset: Optional[float] = Field(None, description="Offset to reverb send (e.g. +0.05)")
    delay_offset: Optional[float] = Field(None, description="Offset to delay send (e.g. -0.02)")


class TrackAdjustment(BaseModel):
    track_id: str = Field(..., description="ID or filename of the track being adjusted")
    gain_db_offset: float = Field(0.0, description="Relative gain adjustment in dB (e.g. -1.5 to +1.5). 0.0 if no change.")
    pan_offset: float = Field(0.0, description="Relative pan adjustment (-0.2 to +0.2). 0.0 if no change.")
    eq_adjustments: Optional[EQAdjustment] = Field(None, description="Optional EQ tweaks for this track")
    compressor_adjustments: Optional[CompressorAdjustment] = Field(None, description="Optional compressor tweaks")
    sends_adjustments: Optional[SendsAdjustment] = Field(None, description="Optional reverb/delay send tweaks")
    reasoning: str = Field(..., description="Audio engineering rationale explaining why these adjustments were made")


class BusAdjustment(BaseModel):
    bus_name: str = Field(..., description="Name of the bus (e.g. 'Vocals', 'Drums', 'Bass', 'Instruments')")
    gain_db_offset: float = Field(0.0, description="Relative bus gain adjustment in dB")
    reasoning: str = Field(..., description="Rationale for bus-level adjustment")


class MixAdjustmentSchema(BaseModel):
    overall_mix_reasoning: str = Field(..., description="High-level mixing strategy and observation summary for the entire session")
    track_adjustments: List[TrackAdjustment] = Field(default_factory=list, description="Per-track parameter refinements and rationale")
    bus_adjustments: List[BusAdjustment] = Field(default_factory=list, description="Per-bus parameter refinements and rationale")
