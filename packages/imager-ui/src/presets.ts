import type { ImagerState } from './plugin.js';

export interface Preset {
  id: string;
  name: string;
  category: 'Mastering' | 'Mixing' | 'Enhancement' | 'Mono Safety';
  description: string;
  state: Partial<ImagerState>;
}

export const FACTORY_PRESETS: Preset[] = [
  {
    id: 'default-mono-bass',
    name: 'Default Mono-Safe Bass',
    category: 'Mono Safety',
    description: 'Band 0 (<140Hz) mono-locked for vinyl and club PA compatibility while preserving 1.0x mid/high width.',
    state: {
      bypassed: false,
      activeTab: 'imager',
      numBands: 4,
      crossovers: [140.0, 1500.0, 6000.0],
      bandWidths: [0.0, 1.0, 1.0, 1.0],
      stereoizeMode: 'off',
      stereoizeAmount: 0.5,
      recoverSidesAmount: 0.0,
      asymmetry: 0.0,
      soloMid: false,
      soloSide: false,
    },
  },
  {
    id: 'mastering-subtle-widen',
    name: 'Mastering Subtle Imager',
    category: 'Mastering',
    description: 'Mono-safe sub-140Hz with conservative frequency-dependent widening (1.15x mid, 1.3x high).',
    state: {
      bypassed: false,
      activeTab: 'imager',
      numBands: 4,
      crossovers: [140.0, 1500.0, 6000.0],
      bandWidths: [0.0, 1.15, 1.25, 1.35],
      stereoizeMode: 'off',
      stereoizeAmount: 0.5,
      recoverSidesAmount: 0.2,
      asymmetry: 0.0,
      soloMid: false,
      soloSide: false,
    },
  },
  {
    id: 'bass-shuffler-mono',
    name: 'Shuffler Bass Tightener',
    category: 'Mixing',
    description: 'Waves S1 / Brainworx philosophy focus on collapsing sub-160Hz low end to mono.',
    state: {
      bypassed: false,
      activeTab: 'shuffler',
      numBands: 4,
      crossovers: [160.0, 1500.0, 6000.0],
      bandWidths: [0.0, 1.0, 1.0, 1.0],
      stereoizeMode: 'off',
      stereoizeAmount: 0.5,
      recoverSidesAmount: 0.0,
      asymmetry: 0.0,
      soloMid: false,
      soloSide: false,
    },
  },
  {
    id: 'subtle-stereoize-enhancer',
    name: 'Subtle Mono-to-Stereo Decorrelator',
    category: 'Enhancement',
    description: 'Haas-based Stereoize Mode I @ 35% depth for subtle mono synthesizers or narrow acoustic tracks.',
    state: {
      bypassed: false,
      activeTab: 'imager',
      numBands: 4,
      crossovers: [140.0, 1500.0, 6000.0],
      bandWidths: [0.0, 1.0, 1.1, 1.2],
      stereoizeMode: 'mode_i',
      stereoizeAmount: 0.35,
      recoverSidesAmount: 0.0,
      asymmetry: 0.0,
      soloMid: false,
      soloSide: false,
    },
  },
  {
    id: 'side-recovery-mastering',
    name: 'Side Energy Recovery Master',
    category: 'Mastering',
    description: 'Reintroduces side energy during narrowing without altering phase alignment.',
    state: {
      bypassed: false,
      activeTab: 'matrix',
      numBands: 4,
      crossovers: [140.0, 1500.0, 6000.0],
      bandWidths: [0.0, 0.85, 0.9, 0.95],
      stereoizeMode: 'off',
      stereoizeAmount: 0.5,
      recoverSidesAmount: 0.35,
      asymmetry: 0.0,
      soloMid: false,
      soloSide: false,
    },
  },
];
