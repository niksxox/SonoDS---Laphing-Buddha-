//! Gain Reduction Meter ballistics state and decay engine per Task 3.1 & 3.2.
//! Pure framework-agnostic TypeScript class (zero React imports).

export class GainReductionMeterState {
  private currentDisplayGr = 0.0;
  private peakHoldGr = 0.0;
  private peakHoldTimeMs = 0;
  private lastUpdateMs = 0;

  private attackTimeConstantMs = 15.0; // Fast visual grab (~15ms)
  private releaseDecayRateDbPerSec = 40.0; // 40 dB/s decay
  private peakHoldDurationMs = 800.0; // 800ms peak hold

  public update(rawGrDb: number, nowMs: number = performance.now()): { currentGr: number; peakGr: number } {
    if (this.lastUpdateMs === 0) {
      this.lastUpdateMs = nowMs;
    }
    const dt = Math.max(0.001, (nowMs - this.lastUpdateMs) / 1000.0);
    this.lastUpdateMs = nowMs;

    const targetGr = Math.max(0.0, rawGrDb);

    if (targetGr > this.currentDisplayGr) {
      // Fast attack: visual meter grabs downward quickly
      const alpha = Math.exp(-dt / (this.attackTimeConstantMs / 1000.0));
      this.currentDisplayGr = alpha * this.currentDisplayGr + (1.0 - alpha) * targetGr;
    } else {
      // Linear or exponential decay back toward 0 dB
      this.currentDisplayGr = Math.max(0.0, this.currentDisplayGr - this.releaseDecayRateDbPerSec * dt);
    }

    // Peak hold tracking
    if (this.currentDisplayGr >= this.peakHoldGr) {
      this.peakHoldGr = this.currentDisplayGr;
      this.peakHoldTimeMs = nowMs;
    } else if (nowMs - this.peakHoldTimeMs > this.peakHoldDurationMs) {
      // Slowly decay peak after hold expiration
      this.peakHoldGr = Math.max(this.currentDisplayGr, this.peakHoldGr - this.releaseDecayRateDbPerSec * 1.5 * dt);
    }

    return {
      currentGr: this.currentDisplayGr,
      peakGr: this.peakHoldGr,
    };
  }

  public getCurrentDisplayGr(): number {
    return this.currentDisplayGr;
  }

  public getPeakHoldGr(): number {
    return this.peakHoldGr;
  }

  public reset(): void {
    this.currentDisplayGr = 0.0;
    this.peakHoldGr = 0.0;
    this.lastUpdateMs = performance.now();
  }
}

/// Physical press squish amount mapping function per Task 3.2.
///
/// Maps raw/smoothed gain reduction in dB to a normalized 0.0 - 1.0 compression amount.
/// Uses soft saturation (1.0 - exp(-gr / k)) with k=8.0 dB, giving high visual resolution
/// in the 0 - 12 dB typical compression zone without clipping extreme compression.
export function pressCompressionAmount(gainReductionDb: number): number {
  const gr = Math.max(0.0, gainReductionDb);
  const k = 8.0; // 8 dB characteristic scaling factor
  const squish = 1.0 - Math.exp(-gr / k);
  return Math.max(0.0, Math.min(1.0, squish));
}
