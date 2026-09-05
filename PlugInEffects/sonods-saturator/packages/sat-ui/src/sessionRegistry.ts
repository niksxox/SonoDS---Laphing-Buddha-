// sessionRegistry.ts
// Cross-plugin mixing session registry and harmonic masking tracker.

export interface SaturatorTrackSnapshot {
  instanceId: string;
  trackName: string;
  character: string;
  drive: number;
  harmonicEnergy: number[]; // 16 log frequency bands
  timestamp: number;
}

export class SaturatorSessionRegistry {
  private channel: BroadcastChannel | null = null;
  private instanceId: string;
  private trackName: string;
  private remoteSnapshots: Map<string, SaturatorTrackSnapshot> = new Map();
  private listeners: Set<(snapshots: SaturatorTrackSnapshot[]) => void> = new Set();

  constructor(instanceId: string, trackName: string = 'Master Saturator') {
    this.instanceId = instanceId;
    this.trackName = trackName;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('sonods-mixing-session-registry');
        this.channel.onmessage = (event) => {
          const snapshot = event.data as SaturatorTrackSnapshot;
          if (snapshot && snapshot.instanceId !== this.instanceId) {
            this.remoteSnapshots.set(snapshot.instanceId, snapshot);
            this.notifyListeners();
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel not available in environment:', err);
      }
    }
  }

  public publishSnapshot(character: string, drive: number, postAnalyserData?: Float32Array): void {
    if (!this.channel) return;

    const energy: number[] = new Array(16).fill(-100);
    if (postAnalyserData && postAnalyserData.length > 0) {
      const len = postAnalyserData.length;
      for (let i = 0; i < 16; i++) {
        const start = Math.floor(Math.pow(len, i / 16));
        const end = Math.min(len, Math.floor(Math.pow(len, (i + 1) / 16)));
        let maxVal = -120;
        for (let b = start; b < end; b++) {
          if (postAnalyserData[b] > maxVal) maxVal = postAnalyserData[b];
        }
        energy[i] = maxVal;
      }
    }

    const snapshot: SaturatorTrackSnapshot = {
      instanceId: this.instanceId,
      trackName: this.trackName,
      character,
      drive,
      harmonicEnergy: energy,
      timestamp: Date.now(),
    };

    try {
      this.channel.postMessage(snapshot);
    } catch {
      // Ignore broadcast errors
    }
  }

  public getRemoteSnapshots(): SaturatorTrackSnapshot[] {
    const now = Date.now();
    for (const [id, s] of this.remoteSnapshots) {
      if (now - s.timestamp > 5000) {
        this.remoteSnapshots.delete(id);
      }
    }
    return Array.from(this.remoteSnapshots.values());
  }

  public onRemoteUpdate(listener: (snapshots: SaturatorTrackSnapshot[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const list = this.getRemoteSnapshots();
    for (const l of this.listeners) {
      l(list);
    }
  }

  public destroy(): void {
    this.channel?.close();
    this.listeners.clear();
    this.remoteSnapshots.clear();
  }
}
