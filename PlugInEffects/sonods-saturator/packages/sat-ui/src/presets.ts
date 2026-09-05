// presets.ts
import { CharacterType, QualityType } from '@sonods/sat-engine';

export interface SaturatorPreset {
  id: string;
  name: string;
  category: 'Master' | 'Vocal' | 'Drums' | 'Bass' | 'Creative';
  description: string;
  drive: number;
  character: CharacterType;
  tone: number;
  mix: number;
  outputGain: number;
  autoGain: boolean;
  quality: QualityType;
}

export const FACTORY_PRESETS: SaturatorPreset[] = [
  {
    id: 'tape-master-glue',
    name: 'Warm Tape Master',
    category: 'Master',
    description: 'Silky analog high-end rolloff and 80Hz head-bump for cohesive bus glue.',
    drive: 0.22,
    character: 'tape',
    tone: 0.8,
    mix: 1.0,
    outputGain: 0.0,
    autoGain: true,
    quality: 'high',
  },
  {
    id: 'vocal-tube-warmth',
    name: 'Vocal Tube Warmth',
    category: 'Vocal',
    description: 'Adds rich 2nd-order even harmonics for intimate and present vocals.',
    drive: 0.42,
    character: 'tube',
    tone: 2.4,
    mix: 0.85,
    outputGain: 0.0,
    autoGain: true,
    quality: 'standard',
  },
  {
    id: 'punchy-transformer-drums',
    name: 'Punchy Transformer Snare',
    category: 'Drums',
    description: 'Aggressive iron core magnetic push with subtle low-end punch.',
    drive: 0.68,
    character: 'transformer',
    tone: -1.2,
    mix: 0.9,
    outputGain: 0.0,
    autoGain: true,
    quality: 'high',
  },
  {
    id: 'vintage-70s-crunch',
    name: 'Vintage 70s Crunch',
    category: 'Creative',
    description: 'Heavy tape deck overdriving into pleasant harmonic compression.',
    drive: 0.82,
    character: 'tape',
    tone: -2.0,
    mix: 1.0,
    outputGain: -1.0,
    autoGain: true,
    quality: 'standard',
  },
  {
    id: 'subtle-mixbus-glue',
    name: 'Subtle Mixbus Glue',
    category: 'Master',
    description: 'Gentle saturation footprint for transparent master bus leveling.',
    drive: 0.16,
    character: 'tape',
    tone: 0.0,
    mix: 0.65,
    outputGain: 0.0,
    autoGain: true,
    quality: 'high',
  },
  {
    id: 'parallel-tube-heat',
    name: 'Parallel Tube Heat',
    category: 'Bass',
    description: 'Blistering triode overdrive blended 40% in parallel for rich bass grit.',
    drive: 0.90,
    character: 'tube',
    tone: 4.5,
    mix: 0.40,
    outputGain: 0.0,
    autoGain: false,
    quality: 'high',
  },
];
