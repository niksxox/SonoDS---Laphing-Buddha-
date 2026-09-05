// frontend/src/utils/stemConfig.js
// Single source of truth for the entire app.
// Every component reads from this. The initialDB values are exact — do not change them.

export const STEM_CONFIG = [
  {
    id: 'backing-vocals',
    filename: 'Jam Session - Charlie Puth - Backing Vocals_1.wav',
    displayName: 'Backing Vox',
    bus: 'VOCALS',
    audioUrl: 'http://localhost:3001/stems/Jam Session - Charlie Puth - Backing Vocals_1.wav',
    initialDB: 14.6,
    color: '#a78bfa',
  },
  {
    id: 'bass',
    filename: 'Jam Session - Charlie Puth - Bass_1.wav',
    displayName: 'Bass',
    bus: 'BASS',
    audioUrl: 'http://localhost:3001/stems/Jam Session - Charlie Puth - Bass_1.wav',
    initialDB: 5.7,
    color: '#34d399',
  },
  {
    id: 'brass',
    filename: 'Jam Session - Charlie Puth - Brass_1.wav',
    displayName: 'Brass',
    bus: 'BRASS',
    audioUrl: 'http://localhost:3001/stems/Jam Session - Charlie Puth - Brass_1.wav',
    initialDB: 0.0,
    color: '#fbbf24',
  },
  {
    id: 'drums',
    filename: 'Jam Session - Charlie Puth - Drums_1.wav',
    displayName: 'Drums',
    bus: 'DRUMS',
    audioUrl: 'http://localhost:3001/stems/Jam Session - Charlie Puth - Drums_1.wav',
    initialDB: 5.6,
    color: '#f87171',
  },
  {
    id: 'guitar',
    filename: 'Jam Session - Charlie Puth - Guitar_1.wav',
    displayName: 'Guitar',
    bus: 'GUITAR',
    audioUrl: 'http://localhost:3001/stems/Jam Session - Charlie Puth - Guitar_1.wav',
    initialDB: 2.1,
    color: '#60a5fa',
  },
  {
    id: 'keys',
    filename: 'Jam Session - Charlie Puth - Keys_1.wav',
    displayName: 'Keys',
    bus: 'KEYS',
    audioUrl: 'http://localhost:3001/stems/Jam Session - Charlie Puth - Keys_1.wav',
    initialDB: 0.0,
    color: '#c084fc',
  },
  {
    id: 'lead-vocals',
    filename: 'Jam Session - Charlie Puth - Lead Vocals_1.wav',
    displayName: 'Lead Vocals',
    bus: 'VOCALS',
    audioUrl: 'http://localhost:3001/stems/Jam Session - Charlie Puth - Lead Vocals_1.wav',
    initialDB: 4.5,
    color: '#a78bfa',
  },
  {
    id: 'piano',
    filename: 'Jam Session - Charlie Puth - Piano_1.wav',
    displayName: 'Piano',
    bus: 'KEYS',
    audioUrl: 'http://localhost:3001/stems/Jam Session - Charlie Puth - Piano_1.wav',
    initialDB: 0.0,
    color: '#c084fc',
  },
  {
    id: 'strings',
    filename: 'Jam Session - Charlie Puth - Strings_1.wav',
    displayName: 'Strings',
    bus: 'STRINGS',
    audioUrl: 'http://localhost:3001/stems/Jam Session - Charlie Puth - Strings_1.wav',
    initialDB: 0.0,
    color: '#5eead4',
  },
];

// ───────────────────────────────────────────────────────────
// DAW-STYLE FADER CURVE (Logarithmic / Power mapping)
// ───────────────────────────────────────────────────────────
// Professional DAWs (FL Studio, Pro Tools, Logic) use a non-linear
// fader curve so the musically useful range (-15 to +15 dB) gets
// most of the physical fader travel. 0 dB (unity) sits near the
// middle of the fader (~52%), not way up at 77%.
//
// Mapping:
//   pos 0.00 → -∞ dB   (silence)
//   pos 0.10 → -29 dB  (very quiet)
//   pos 0.25 → -15 dB  (low volume)
//   pos 0.52 →   0 dB  (unity — middle of fader!)
//   pos 0.65 →  +6 dB  (moderate boost)
//   pos 0.89 → +15 dB  (loud)
//   pos 1.00 → +18 dB  (max)
//
// Range: -60dB to +18dB (78dB total), mapped through x^0.4 curve
// ───────────────────────────────────────────────────────────

export const dBToPosition = (dB) => {
  if (dB <= -60) return 0;
  if (dB >= 18) return 1;
  // Linear normalize to 0–1, then apply power curve to compress low end
  const normalized = (dB + 60) / 78;
  return Math.max(0, Math.min(1, Math.pow(normalized, 2.5)));
};

export const positionToDB = (pos) => {
  if (pos < 0.003) return -Infinity;
  const clamped = Math.max(0, Math.min(1, pos));
  // Apply inverse power curve — expands the low end, giving more
  // fader travel to the musically useful range
  const normalized = Math.pow(clamped, 0.4);
  return normalized * 78 - 60;
};

export const dBToGain = (dB) => {
  if (dB === -Infinity || dB <= -60) return 0;
  return Math.pow(10, dB / 20);
};

// Safe zone: default fallback threshold if no dynamic safe_range_db is provided
export const DEVIATION_THRESHOLD = 4; // ±4 dB fallback
export const DEFAULT_SAFE_RANGE_DB = 4;

export const getTrackSafeRange = (stem) => {
  if (!stem) return DEFAULT_SAFE_RANGE_DB;
  return stem.safeRange ?? stem.safe_range_db ?? DEFAULT_SAFE_RANGE_DB;
};

// Utility to safely encode filenames in URLs
export const encodeStemUrl = (url) => {
  const parts = url.split('/');
  const filename = parts.pop();
  return parts.join('/') + '/' + encodeURIComponent(filename);
};
