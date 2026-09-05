export const MIN_FREQ = 20.0;
export const MAX_FREQ = 20000.0;
export const MIN_GAIN_DB = -30.0;
export const MAX_GAIN_DB = 30.0;

const LOG_MIN_FREQ = Math.log10(MIN_FREQ);
const LOG_MAX_FREQ = Math.log10(MAX_FREQ);

export function frequencyToX(freqHz: number, width: number): number {
  const clampedFreq = Math.max(MIN_FREQ, Math.min(freqHz, MAX_FREQ));
  const normalized = (Math.log10(clampedFreq) - LOG_MIN_FREQ) / (LOG_MAX_FREQ - LOG_MIN_FREQ);
  return normalized * width;
}

export function xToFrequency(x: number, width: number): number {
  if (width <= 0) return 1000;
  const normalized = Math.max(0, Math.min(x / width, 1));
  const logVal = LOG_MIN_FREQ + normalized * (LOG_MAX_FREQ - LOG_MIN_FREQ);
  return Math.pow(10, logVal);
}

export function gainToY(gainDb: number, height: number): number {
  const clampedGain = Math.max(MIN_GAIN_DB, Math.min(gainDb, MAX_GAIN_DB));
  const normalized = (clampedGain - MIN_GAIN_DB) / (MAX_GAIN_DB - MIN_GAIN_DB);
  // In canvas, y=0 is top (+30 dB) and y=height is bottom (-30 dB)
  return height * (1 - normalized);
}

export function yToGain(y: number, height: number): number {
  if (height <= 0) return 0;
  const normalized = Math.max(0, Math.min(1 - y / height, 1));
  return MIN_GAIN_DB + normalized * (MAX_GAIN_DB - MIN_GAIN_DB);
}

export function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    const khz = hz / 1000;
    return khz >= 10 ? `${khz.toFixed(1)}k` : `${khz.toFixed(2)}k`;
  }
  return `${Math.round(hz)}`;
}

export function formatGain(db: number): string {
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

export function formatQ(q: number): string {
  return q.toFixed(2);
}
