// SonoDS Reverb - Factory Presets & State Serialization
// Task 3.1: Factory preset catalog, JSON serialization, and search/filtering.

import type { ReverbPreset } from './ReverbEngine';

export const FACTORY_PRESETS: ReverbPreset[] = [
  // --- HALLS ---
  {
    name: 'Concert Hall Large',
    category: 'Halls',
    space: 0.7,
    rt60: 2.4,
    brightness: 0.1,
    character: 0.35,
    distance: 0.6,
    thickness: 0.2,
    stereoWidth: 1.0,
    predelayMs: 25,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [
      { enabled: true, freqHz: 120, decayPercent: 120, q: 0.7 },
      { enabled: true, freqHz: 4000, decayPercent: 80, q: 1.0 },
    ],
    postEqBands: [
      { enabled: true, filterType: 0, freqHz: 80, gainDb: -3.0, q: 0.7 },
    ],
    duckingAmount: 0.0,
    autoGateEnabled: false,
    autoGateThresholdDb: -40,
    freeze: false,
    mixPercent: 35,
  },
  {
    name: 'Grand Cathedral',
    category: 'Halls',
    space: 0.95,
    rt60: 6.5,
    brightness: -0.2,
    character: 0.5,
    distance: 0.8,
    thickness: 0.4,
    stereoWidth: 1.2,
    predelayMs: 45,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [
      { enabled: true, freqHz: 80, decayPercent: 150, q: 0.7 },
      { enabled: true, freqHz: 6000, decayPercent: 60, q: 1.0 },
    ],
    postEqBands: [],
    duckingAmount: 0.0,
    autoGateEnabled: false,
    autoGateThresholdDb: -40,
    freeze: false,
    mixPercent: 45,
  },
  {
    name: 'Bright Stage',
    category: 'Halls',
    space: 0.55,
    rt60: 1.6,
    brightness: 0.5,
    character: 0.2,
    distance: 0.4,
    thickness: 0.1,
    stereoWidth: 1.1,
    predelayMs: 15,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [],
    postEqBands: [
      { enabled: true, filterType: 2, freqHz: 8000, gainDb: 2.0, q: 0.7 },
    ],
    duckingAmount: 0.0,
    autoGateEnabled: false,
    autoGateThresholdDb: -40,
    freeze: false,
    mixPercent: 30,
  },

  // --- ROOMS ---
  {
    name: 'Vocal Booth',
    category: 'Rooms',
    space: 0.15,
    rt60: 0.4,
    brightness: 0.0,
    character: 0.1,
    distance: 0.2,
    thickness: 0.3,
    stereoWidth: 0.8,
    predelayMs: 5,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [
      { enabled: true, freqHz: 300, decayPercent: 70, q: 1.0 },
    ],
    postEqBands: [
      { enabled: true, filterType: 0, freqHz: 150, gainDb: -4.0, q: 0.7 },
    ],
    duckingAmount: 0.0,
    autoGateEnabled: false,
    autoGateThresholdDb: -40,
    freeze: false,
    mixPercent: 20,
  },
  {
    name: 'Wooden Studio',
    category: 'Rooms',
    space: 0.35,
    rt60: 0.9,
    brightness: -0.1,
    character: 0.2,
    distance: 0.35,
    thickness: 0.4,
    stereoWidth: 1.0,
    predelayMs: 12,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [
      { enabled: true, freqHz: 500, decayPercent: 110, q: 1.0 },
    ],
    postEqBands: [],
    duckingAmount: 0.0,
    autoGateEnabled: false,
    autoGateThresholdDb: -40,
    freeze: false,
    mixPercent: 25,
  },

  // --- PLATES ---
  {
    name: 'Vintage Gold Plate',
    category: 'Plates',
    space: 0.5,
    rt60: 2.2,
    brightness: 0.3,
    character: 0.6,
    distance: 0.3,
    thickness: 0.6,
    stereoWidth: 1.0,
    predelayMs: 10,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [
      { enabled: true, freqHz: 200, decayPercent: 80, q: 0.7 },
      { enabled: true, freqHz: 5000, decayPercent: 130, q: 1.0 },
    ],
    postEqBands: [
      { enabled: true, filterType: 0, freqHz: 200, gainDb: -6.0, q: 0.7 },
    ],
    duckingAmount: 0.0,
    autoGateEnabled: false,
    autoGateThresholdDb: -40,
    freeze: false,
    mixPercent: 40,
  },
  {
    name: 'Bright Snare Plate',
    category: 'Plates',
    space: 0.4,
    rt60: 1.4,
    brightness: 0.7,
    character: 0.4,
    distance: 0.2,
    thickness: 0.5,
    stereoWidth: 1.1,
    predelayMs: 0,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [],
    postEqBands: [
      { enabled: true, filterType: 2, freqHz: 6000, gainDb: 4.0, q: 0.7 },
    ],
    duckingAmount: 0.0,
    autoGateEnabled: false,
    autoGateThresholdDb: -40,
    freeze: false,
    mixPercent: 35,
  },

  // --- SPACES & EFFECTS ---
  {
    name: 'Ducked Lead Vocal',
    category: 'Spaces',
    space: 0.6,
    rt60: 3.0,
    brightness: 0.2,
    character: 0.3,
    distance: 0.5,
    thickness: 0.3,
    stereoWidth: 1.0,
    predelayMs: 30,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [],
    postEqBands: [
      { enabled: true, filterType: 0, freqHz: 160, gainDb: -4.0, q: 0.7 },
      { enabled: true, filterType: 1, freqHz: 3000, gainDb: -2.0, q: 1.5 },
    ],
    duckingAmount: 0.65, // Ducking active!
    autoGateEnabled: false,
    autoGateThresholdDb: -40,
    freeze: false,
    mixPercent: 45,
  },
  {
    name: 'Gated Explosive Drums',
    category: 'Spaces',
    space: 0.8,
    rt60: 4.0,
    brightness: 0.4,
    character: 0.1,
    distance: 0.3,
    thickness: 0.7,
    stereoWidth: 1.2,
    predelayMs: 0,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [],
    postEqBands: [],
    duckingAmount: 0.0,
    autoGateEnabled: true, // Gated reverb!
    autoGateThresholdDb: -32,
    freeze: false,
    mixPercent: 50,
  },
  {
    name: 'Infinite Synth Ambient',
    category: 'Spaces',
    space: 1.0,
    rt60: 12.0,
    brightness: 0.1,
    character: 0.8,
    distance: 0.9,
    thickness: 0.4,
    stereoWidth: 1.3,
    predelayMs: 60,
    predelaySync: false,
    predelayDivision: 4,
    decayRateBands: [
      { enabled: true, freqHz: 100, decayPercent: 140, q: 0.7 },
    ],
    postEqBands: [],
    duckingAmount: 0.2,
    autoGateEnabled: false,
    autoGateThresholdDb: -40,
    freeze: false,
    mixPercent: 60,
  },
];

export function exportPresetToJson(preset: ReverbPreset): string {
  return JSON.stringify(preset, null, 2);
}

export function importPresetFromJson(jsonStr: string): ReverbPreset | null {
  try {
    const data = JSON.parse(jsonStr);
    if (typeof data.name === 'string' && typeof data.space === 'number') {
      return data as ReverbPreset;
    }
    return null;
  } catch {
    return null;
  }
}

export function searchPresets(query: string, category?: string): ReverbPreset[] {
  const q = query.toLowerCase().trim();
  return FACTORY_PRESETS.filter((p) => {
    if (category && category !== 'All' && p.category !== category) {
      return false;
    }
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });
}
