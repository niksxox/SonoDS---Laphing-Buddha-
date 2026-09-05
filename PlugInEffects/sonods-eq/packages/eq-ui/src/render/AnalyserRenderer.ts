import { frequencyToX } from '../coords.js';

export interface AnalyzerRenderOptions {
  width: number;
  height: number;
  dpr: number;
  preData: Float32Array | null;
  postData: Float32Array | null;
  sampleRate?: number;
  showPre?: boolean;
  showPost?: boolean;
  minDb?: number;
  maxDb?: number;
}

export class AnalyserRenderer {
  private ctx: CanvasRenderingContext2D;
  private smoothedPre: Float32Array | null = null;
  private smoothedPost: Float32Array | null = null;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  public render(options: AnalyzerRenderOptions): void {
    const {
      width,
      height,
      dpr,
      preData,
      postData,
      sampleRate = 48000,
      showPre = true,
      showPost = true,
      minDb = -90,
      maxDb = -10,
    } = options;

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Pre-EQ trace (subtle cool gray/sky tint)
    if (showPre && preData && preData.length > 0) {
      this.smoothedPre = this.smoothTrace(this.smoothedPre, preData, 0.25, 0.08);
      this.drawTrace(
        ctx,
        this.smoothedPre,
        sampleRate,
        width,
        height,
        minDb,
        maxDb,
        'rgba(14, 165, 233, 0.06)',
        'rgba(14, 165, 233, 0.25)'
      );
    }

    // Post-EQ trace (subtle soft green tint)
    if (showPost && postData && postData.length > 0) {
      this.smoothedPost = this.smoothTrace(this.smoothedPost, postData, 0.35, 0.08);
      this.drawTrace(
        ctx,
        this.smoothedPost,
        sampleRate,
        width,
        height,
        minDb,
        maxDb,
        'rgba(132, 204, 22, 0.08)',
        'rgba(101, 163, 13, 0.35)'
      );
    }

    ctx.restore();
  }

  private smoothTrace(
    prev: Float32Array | null,
    next: Float32Array,
    attack: number,
    release: number
  ): Float32Array {
    if (!prev || prev.length !== next.length) {
      return new Float32Array(next);
    }
    const len = next.length;
    for (let i = 0; i < len; i++) {
      const target = next[i];
      const coeff = target > prev[i] ? attack : release;
      prev[i] += (target - prev[i]) * coeff;
    }
    return prev;
  }

  private drawTrace(
    ctx: CanvasRenderingContext2D,
    data: Float32Array,
    sampleRate: number,
    width: number,
    height: number,
    minDb: number,
    maxDb: number,
    fillStyle: string,
    strokeStyle: string
  ): void {
    const binCount = data.length;
    const nyquist = sampleRate / 2;

    ctx.beginPath();
    let started = false;

    for (let i = 1; i < binCount; i++) {
      const freq = (i / binCount) * nyquist;
      if (freq < 20 || freq > 20000) continue;

      const x = frequencyToX(freq, width);
      const db = Math.max(minDb, Math.min(data[i], maxDb));
      const norm = (db - minDb) / (maxDb - minDb);
      const y = height * (1 - norm);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (!started) return;

    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.restore();
  }
}
