import { BandState, Shape, SonodsEqNode } from '@sonods/eq-engine';

export interface ExplainableAnnotation {
  id: string;
  freq: number;
  gainDb: number;
  text: string;
  source: 'ai_collision' | 'reference_match' | 'instrument_preset' | 'user';
  expiresAt?: number;
}

export function generateCollisionAnnotation(
  freqHz: number,
  otherTrackName: string
): ExplainableAnnotation {
  const roundedFreq = Math.round(freqHz);
  return {
    id: `collision-${Date.now()}`,
    freq: freqHz,
    gainDb: -3.0,
    text: `Cut around ${roundedFreq} Hz to make room for ${otherTrackName}`,
    source: 'ai_collision',
    expiresAt: Date.now() + 8000,
  };
}

export interface InstrumentPreset {
  name: string;
  description: string;
  bands: { shape: Shape; freq: number; gain: number; q: number; annotation: string }[];
}

export const INSTRUMENT_PRESETS: Record<string, InstrumentPreset> = {
  vocal: {
    name: 'Lead Vocal Clarity',
    description: 'High pass rumble cut, presence lift, and air shelf',
    bands: [
      { shape: Shape.LowCut, freq: 80, gain: 0, q: 0.7, annotation: 'High-pass filter cuts sub-bass stage rumble and mic handling noise' },
      { shape: Shape.Bell, freq: 350, gain: -2.5, q: 1.5, annotation: 'Dip at 350 Hz cleans up boxiness and chest resonance' },
      { shape: Shape.Bell, freq: 3200, gain: 3.0, q: 1.2, annotation: 'Presence boost around 3.2 kHz pushes vocal forward in the mix' },
      { shape: Shape.HighShelf, freq: 10000, gain: 2.5, q: 0.7, annotation: 'Smooth high shelf opens up expensive studio "air"' },
    ],
  },
  kick: {
    name: 'Punchy Kick Drum',
    description: 'Sub-weight boost, boxiness scoop, and beater click',
    bands: [
      { shape: Shape.LowCut, freq: 28, gain: 0, q: 0.7, annotation: 'High-pass sub cut saves amplifier headroom below audible thump' },
      { shape: Shape.Bell, freq: 65, gain: 4.0, q: 1.8, annotation: 'Sub-bass peak centered on kick fundamental thump' },
      { shape: Shape.Bell, freq: 400, gain: -5.0, q: 1.4, annotation: 'Deep scoop removes hollow cardboard resonance' },
      { shape: Shape.Bell, freq: 4500, gain: 3.5, q: 2.0, annotation: 'Click boost helps kick cut through dense guitars/synths' },
    ],
  },
  bass: {
    name: 'Warm Electric Bass',
    description: 'Controlled low end, warm low-mids, and pick definition',
    bands: [
      { shape: Shape.LowCut, freq: 35, gain: 0, q: 0.7, annotation: 'Tight low cut removes inaudible speaker excursion' },
      { shape: Shape.Bell, freq: 100, gain: 2.5, q: 1.2, annotation: 'Foundation weight boost' },
      { shape: Shape.Bell, freq: 700, gain: 2.0, q: 1.8, annotation: 'Growl and pick finger tone clarity' },
      { shape: Shape.HighCut, freq: 7000, gain: 0, q: 0.7, annotation: 'Gentle low-pass rolls off amp hiss and fizz' },
    ],
  },
};

/**
 * Apply reference or preset curve with smooth animated transition over 400ms (Task 6.3)
 */
export async function applyPresetWithAnimation(
  node: SonodsEqNode,
  preset: InstrumentPreset,
  durationMs: number = 400
): Promise<ExplainableAnnotation[]> {
  const annotations: ExplainableAnnotation[] = [];
  const currentBands = node.getBands();

  // Remove extra bands
  for (let i = preset.bands.length; i < currentBands.length; i++) {
    node.removeBand(currentBands[i].index);
  }

  // Ensure bands exist
  for (let i = 0; i < preset.bands.length; i++) {
    const pBand = preset.bands[i];
    let band = node.getBands()[i];
    if (!band) {
      band = node.addBand(pBand.shape, pBand.freq, 0, pBand.q)!;
    }

    // Target parameters
    const targetFreq = pBand.freq;
    const targetGain = pBand.gain;
    const targetQ = pBand.q;

    // Smooth transition loop
    const startTime = performance.now();
    const startFreq = band.freq;
    const startGain = band.gain;
    const startQ = band.q;

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      node.setBandParam(band.index, 0, startFreq + (targetFreq - startFreq) * ease);
      node.setBandParam(band.index, 1, startGain + (targetGain - startGain) * ease);
      node.setBandParam(band.index, 2, startQ + (targetQ - startQ) * ease);
      node.setBandParam(band.index, 3, pBand.shape);

      if (progress < 1.0) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);

    annotations.push({
      id: `preset-${i}-${Date.now()}`,
      freq: pBand.freq,
      gainDb: pBand.gain,
      text: pBand.annotation,
      source: 'instrument_preset',
      expiresAt: Date.now() + 10000,
    });
  }

  return annotations;
}
