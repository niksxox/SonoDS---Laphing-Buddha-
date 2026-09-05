/**
 * SonodsVectorscope — Lissajous 45°-rotated polar stereo vectorscope.
 *
 * Renders real L/R sample pairs from engine telemetry:
 *   - Pure Mono (L == R) -> Vertical Line (Mid axis)
 *   - Pure Out-of-Phase (L == -R) -> Horizontal Line (Side axis)
 *   - Wide Stereo -> Diamond / Elliptical Phosphor Cloud
 */

export class SonodsVectorscopeElement extends HTMLElement {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private currentSamples: number[] = [];
  private renderedPoints: { x: number; y: number }[] = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          font-family: Inter, system-ui, -apple-system, sans-serif;
        }
        .container {
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
        }
        .header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #94a3b8;
          margin-bottom: 8px;
        }
        canvas {
          display: block;
          background: #040711;
          border-radius: 6px;
          box-shadow: inset 0 0 10px rgba(0,0,0,0.8);
        }
      </style>
      <div class="container">
        <div class="header">
          <span>Stereo Vectorscope (Lissajous 45°)</span>
          <span style="color: #38bdf8;">M / S</span>
        </div>
        <canvas id="scopeCanvas" width="280" height="280"></canvas>
      </div>
    `;

    this.canvas = this.shadowRoot!.querySelector('#scopeCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext ? this.canvas.getContext('2d') : null;
  }

  connectedCallback() {
    this.render();
  }

  public updateSamples(interleavedSamples: number[]) {
    this.currentSamples = interleavedSamples;
    this.render();
  }

  public getRenderedSamplePoints(): { x: number; y: number }[] {
    return [...this.renderedPoints];
  }

  public render() {
    const width = this.canvas.width || 280;
    const height = this.canvas.height || 280;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = (Math.min(width, height) / 2) * 0.8;
    const invSqrt2 = 1.0 / Math.SQRT2;

    // Calculate transformed coordinates for telemetry samples
    this.renderedPoints = [];
    const len = this.currentSamples.length;

    for (let i = 0; i < len; i += 2) {
      const l = this.currentSamples[i];
      const r = this.currentSamples[i + 1];

      // 45° Lissajous rotation
      // X_rot = (R - L) * (1/sqrt(2))
      // Y_rot = (L + R) * (1/sqrt(2))
      const xRot = (r - l) * invSqrt2;
      const yRot = (l + r) * invSqrt2;

      const canvasX = centerX + xRot * scale;
      const canvasY = centerY - yRot * scale;

      this.renderedPoints.push({ x: canvasX, y: canvasY });
    }

    if (!this.ctx) return;

    const ctx = this.ctx;

    // Phosphor persistence decay fade
    ctx.fillStyle = 'rgba(4, 7, 17, 0.25)';
    ctx.fillRect(0, 0, width, height);

    // Draw reference polar grid (45° diagonal M/S crosshairs + outer circle)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Center vertical M-axis and horizontal S-axis lines
    ctx.beginPath();
    ctx.moveTo(centerX, 10);
    ctx.lineTo(centerX, height - 10);
    ctx.moveTo(10, centerY);
    ctx.lineTo(width - 10, centerY);
    ctx.stroke();

    // 45° L and R diagonal guidelines
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(width - 10, height - 10);
    ctx.moveTo(width - 10, 10);
    ctx.lineTo(10, height - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.renderedPoints.length === 0) return;

    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 6;

    for (const pt of this.renderedPoints) {
      ctx.fillRect(pt.x - 1, pt.y - 1, 2.5, 2.5);
    }

    ctx.shadowBlur = 0;
  }
}

if (!customElements.get('sonods-vectorscope')) {
  customElements.define('sonods-vectorscope', SonodsVectorscopeElement);
}
