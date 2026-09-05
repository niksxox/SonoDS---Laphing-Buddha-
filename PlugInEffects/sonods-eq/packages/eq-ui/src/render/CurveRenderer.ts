import { BandState } from '@sonods/eq-engine';
import { frequencyToX, gainToY } from '../coords.js';

export interface CurvePoint { freq: number; gainDb: number; }

export const BAND_COLORS = [
  '#EC4899', '#F97316', '#EAB308', '#84CC16', '#10B981', '#06B6D4', '#8B5CF6',
];

const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const DB_TICKS = [18, 12, 6, 0, -6, -12, -18];

export interface RenderOptions {
  width: number; height: number; dpr: number;
  curvePoints: CurvePoint[]; bands: BandState[];
  selectedBandIndex: number | null; hoveredBandIndex: number | null;
  ghostCurves?: { bandIndex: number; points: CurvePoint[] }[];
}

export class CurveRenderer {
  private ctx: CanvasRenderingContext2D;
  constructor(ctx: CanvasRenderingContext2D) { this.ctx = ctx; }

  /** Draw white background + grid. Call BEFORE the analyser pass. */
  public renderBackground(width: number, height: number, dpr: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);
    ctx.restore();
  }

  public render(options: RenderOptions): void {
    const { width, height, dpr, curvePoints, bands, selectedBandIndex, hoveredBandIndex, ghostCurves = [] } = options;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Ghost curves
    if (selectedBandIndex !== null) {
      for (const ghost of ghostCurves) {
        if (ghost.bandIndex === selectedBandIndex && ghost.points.length > 1) {
          const color = BAND_COLORS[selectedBandIndex % BAND_COLORS.length];
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          this.drawSmoothCurvePath(ctx, ghost.points, width, height);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }
      }
    }

    // Main response curve - solid dark line, no glow
    if (curvePoints.length > 1) {
      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.drawSmoothCurvePath(ctx, curvePoints, width, height);
      ctx.stroke();
    }

    // Band handles - flat colored circles with numbers
    for (let i = 0; i < bands.length; i++) {
      const band = bands[i];
      if (!band.enabled) continue;
      const bx = frequencyToX(band.freq, width);
      const by = gainToY(band.gain, height);
      const isSelected = band.index === selectedBandIndex;
      const isHovered = band.index === hoveredBandIndex;
      const color = BAND_COLORS[i % BAND_COLORS.length];
      this.drawBandHandle(ctx, bx, by, i + 1, isSelected, isHovered, color, band);
    }

    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    for (const db of DB_TICKS) {
      const y = gainToY(db, height);
      ctx.strokeStyle = db === 0 ? '#D4D4D8' : '#F4F4F5';
      ctx.lineWidth = db === 0 ? 1.0 : 0.75;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillStyle = db === 0 ? '#A1A1AA' : '#D4D4D8';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 6, y - 3);
    }
    for (const freq of FREQ_TICKS) {
      const x = frequencyToX(freq, width);
      ctx.strokeStyle = '#F4F4F5';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
      ctx.fillStyle = '#D4D4D8';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, height - 6);
    }
    ctx.restore();
  }

  private drawSmoothCurvePath(ctx: CanvasRenderingContext2D, points: CurvePoint[], width: number, height: number): void {
    if (points.length < 2) return;
    ctx.moveTo(frequencyToX(points[0].freq, width), gainToY(points[0].gainDb, height));
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const x1 = frequencyToX(p1.freq, width), y1 = gainToY(p1.gainDb, height);
      const x2 = frequencyToX(p2.freq, width), y2 = gainToY(p2.gainDb, height);
      const x0 = frequencyToX(p0.freq, width), y0 = gainToY(p0.gainDb, height);
      const x3 = frequencyToX(p3.freq, width), y3 = gainToY(p3.gainDb, height);
      ctx.bezierCurveTo(x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2);
    }
  }

  public drawBandHandle(ctx: CanvasRenderingContext2D, x: number, y: number, num: number, isSelected: boolean, isHovered: boolean, color: string, band?: BandState): void {
    const radius = isSelected ? 10 : isHovered ? 9 : 8;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeStyle = isSelected ? '#18181B' : '#FFFFFF';
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${num}`, x, y + 0.5);
    ctx.restore();

    if (band && band.dynamicEnabled && Math.abs(band.dynamicRange) > 0.5) {
      const rangeOffset = (band.dynamicRange / 60) * 100;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - rangeOffset);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
