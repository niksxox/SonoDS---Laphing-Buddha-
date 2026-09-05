import { frequencyToX } from './coords.js';
import { TrackEnergySnapshot } from './sessionRegistry.js';

export interface CollisionZone {
  centerFreq: number;
  lowFreq: number;
  highFreq: number;
  severity: number; // 0.0 to 1.0
  conflictingTrackName: string;
}

export function detectCollisions(
  myEnergy: Float32Array | null,
  remoteSnapshots: TrackEnergySnapshot[],
  sampleRate: number = 48000
): CollisionZone[] {
  const zones: CollisionZone[] = [];
  if (!myEnergy || myEnergy.length === 0 || remoteSnapshots.length === 0) {
    return zones;
  }

  const binCount = myEnergy.length;
  const nyquist = sampleRate / 2;

  for (const remote of remoteSnapshots) {
    for (let i = 2; i < 30; i++) {
      const freq = 20 * Math.pow(1000, i / 30);
      const bin = Math.floor((freq / nyquist) * binCount);
      const myVal = myEnergy[bin] || -100;
      const remoteVal = remote.energyProfile[i] || -100;

      // Conflict threshold: both tracks have high energy in the same region
      if (myVal > -35 && remoteVal > -35) {
        const severity = Math.min(1.0, (myVal + 35 + remoteVal + 35) / 40);
        const bandwidth = freq * 0.4;
        zones.push({
          centerFreq: freq,
          lowFreq: freq - bandwidth * 0.5,
          highFreq: freq + bandwidth * 0.5,
          severity,
          conflictingTrackName: remote.trackName,
        });
      }
    }
  }

  return zones;
}

export function renderCollisionZones(
  ctx: CanvasRenderingContext2D,
  zones: CollisionZone[],
  width: number,
  height: number
): void {
  for (const zone of zones) {
    const x1 = frequencyToX(zone.lowFreq, width);
    const x2 = frequencyToX(zone.highFreq, width);
    const zoneWidth = Math.max(12, x2 - x1);

    const gradient = ctx.createLinearGradient(x1, 0, x2, 0);
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.0)');
    gradient.addColorStop(0.5, `rgba(239, 68, 68, ${0.15 * zone.severity})`);
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(x1, 0, zoneWidth, height);

    // Glowing top marker
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.beginPath();
    ctx.arc(x1 + zoneWidth * 0.5, 12, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
