export interface TrackEnergySnapshot {
  instanceId: string;
  trackName: string;
  bands: { freq: number; gainDb: number; q: number }[];
  energyProfile: number[]; // 32 log-frequency bands energy levels
  timestamp: number;
}

export class SessionRegistry {
  private channel: BroadcastChannel | null = null;
  private instanceId: string;
  private trackName: string;
  private remoteSnapshots: Map<string, TrackEnergySnapshot> = new Map();
  private listeners: Set<(snapshots: TrackEnergySnapshot[]) => void> = new Set();

  constructor(instanceId: string, trackName: string = 'Track') {
    this.instanceId = instanceId;
    this.trackName = trackName;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('sonods-eq-session-registry');
        this.channel.onmessage = (event) => {
          const snapshot = event.data as TrackEnergySnapshot;
          if (snapshot && snapshot.instanceId !== this.instanceId) {
            this.remoteSnapshots.set(snapshot.instanceId, snapshot);
            this.notifyListeners();
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel not available:', err);
      }
    }
  }

  public publishSnapshot(
    bands: { freq: number; gainDb: number; q: number }[],
    postAnalyserData?: Float32Array
  ): void {
    if (!this.channel) return;

    // Downsample 4096 bins into 32 log-energy buckets for lightweight broadcast
    const buckets = new Array(32).fill(-100);
    if (postAnalyserData && postAnalyserData.length > 0) {
      const binCount = postAnalyserData.length;
      for (let i = 0; i < 32; i++) {
        const startBin = Math.floor(Math.pow(binCount, i / 32));
        const endBin = Math.min(binCount, Math.floor(Math.pow(binCount, (i + 1) / 32)));
        let maxVal = -120;
        for (let b = startBin; b < endBin; b++) {
          if (postAnalyserData[b] > maxVal) maxVal = postAnalyserData[b];
        }
        buckets[i] = maxVal;
      }
    }

    const snapshot: TrackEnergySnapshot = {
      instanceId: this.instanceId,
      trackName: this.trackName,
      bands,
      energyProfile: buckets,
      timestamp: Date.now(),
    };

    try {
      this.channel.postMessage(snapshot);
    } catch {
      // Ignore broadcast errors
    }
  }

  public getRemoteSnapshots(): TrackEnergySnapshot[] {
    const now = Date.now();
    // Prune snapshots older than 5 seconds
    for (const [id, s] of this.remoteSnapshots) {
      if (now - s.timestamp > 5000) {
        this.remoteSnapshots.delete(id);
      }
    }
    return Array.from(this.remoteSnapshots.values());
  }

  public onRemoteUpdate(listener: (snapshots: TrackEnergySnapshot[]) => void): () => void {
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
