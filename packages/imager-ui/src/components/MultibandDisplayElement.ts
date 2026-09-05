/**
 * SonodsMultibandDisplay — Frequency-axis per-band width and correlation display.
 *
 * Logarithmic 20Hz-20kHz frequency axis with interactive draggable crossover handles
 * showing per-band width levels and real telemetry correlation readouts.
 */

export class SonodsMultibandDisplayElement extends HTMLElement {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private crossovers: [number, number, number] = [140.0, 1500.0, 6000.0];
  private numBands: number = 4;
  private bandWidths: number[] = [0.0, 1.0, 1.0, 1.0];
  private bandCorrelations: number[] = [1.0, 1.0, 1.0, 1.0];
  private activeDragIndex: number | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          user-select: none;
        }
        .container {
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 12px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
        }
        .header {
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
          width: 100%;
          height: 160px;
          cursor: crosshair;
          background: #040711;
          border-radius: 6px;
        }
      </style>
      <div class="container">
        <div class="header">
          <span>Multiband Spectrum & Crossovers</span>
          <span id="crossoverReadout" style="font-family: monospace; color: #38bdf8;">140Hz | 1.5kHz | 6.0kHz</span>
        </div>
        <canvas id="displayCanvas" width="600" height="160"></canvas>
      </div>
    `;

    this.canvas = this.shadowRoot!.querySelector('#displayCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext ? this.canvas.getContext('2d') : null;

    this.setupInteractivity();
  }

  connectedCallback() {
    this.render();
  }

  public getCrossovers(): [number, number, number] {
    return [...this.crossovers];
  }

  public setCrossovers(f1: number, f2: number, f3: number) {
    this.crossovers = [f1, f2, f3];
    this.render();
  }

  public setNumBands(n: number) {
    this.numBands = Math.max(1, Math.min(4, n));
    this.render();
  }

  public updateTelemetry(bandCorrelations: number[], bandWidths: number[]) {
    this.bandCorrelations = bandCorrelations;
    this.bandWidths = bandWidths;
    this.render();
  }

  private freqToX(freq: number, width: number): number {
    const minF = Math.log10(20);
    const maxF = Math.log10(20000);
    const fLog = Math.log10(Math.max(20, Math.min(20000, freq)));
    return ((fLog - minF) / (maxF - minF)) * width;
  }

  private xToFreq(x: number, width: number): number {
    const minF = Math.log10(20);
    const maxF = Math.log10(20000);
    const fLog = minF + (x / width) * (maxF - minF);
    return Math.pow(10, fLog);
  }

  private setupInteractivity() {
    const handlePointerDown = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const width = this.canvas.width;

      const numHandles = this.numBands - 1;
      for (let i = 0; i < numHandles; i++) {
        const handleX = this.freqToX(this.crossovers[i], width);
        if (Math.abs(x - handleX) < 15) {
          this.activeDragIndex = i;
          this.canvas.setPointerCapture(e.pointerId);
          break;
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (this.activeDragIndex === null) return;

      const rect = this.canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(this.canvas.width, (e.clientX - rect.left) * (this.canvas.width / rect.width)));
      const newFreq = Math.round(this.xToFreq(x, this.canvas.width));

      const idx = this.activeDragIndex;
      const minF = idx === 0 ? 20 : this.crossovers[idx - 1] + 10;
      const maxF = idx === this.crossovers.length - 1 ? 20000 : this.crossovers[idx + 1] - 10;

      this.crossovers[idx] = Math.max(minF, Math.min(maxF, newFreq));
      this.render();

      this.dispatchEvent(
        new CustomEvent('crossover-change', {
          detail: { crossovers: [...this.crossovers] },
          bubbles: true,
          composed: true,
        })
      );
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (this.activeDragIndex !== null) {
        this.canvas.releasePointerCapture(e.pointerId);
        this.activeDragIndex = null;
      }
    };

    this.canvas.addEventListener('pointerdown', handlePointerDown);
    this.canvas.addEventListener('pointermove', handlePointerMove);
    this.canvas.addEventListener('pointerup', handlePointerUp);
  }

  public render() {
    const width = this.canvas.width || 600;
    const height = this.canvas.height || 160;

    // Update crossover header readout
    const readoutEl = this.shadowRoot!.querySelector('#crossoverReadout') as HTMLElement;
    if (readoutEl) {
      const formatF = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(1)}kHz` : `${Math.round(f)}Hz`);
      readoutEl.textContent = `${formatF(this.crossovers[0])} | ${formatF(this.crossovers[1])} | ${formatF(this.crossovers[2])}`;
    }

    if (!this.ctx) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    // Draw background grid (frequency log ticks)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    const gridFreqs = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    gridFreqs.forEach((f) => {
      const gx = this.freqToX(f, width);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    });

    // Compute band X boundary regions
    const boundaries = [0];
    const numHandles = this.numBands - 1;
    for (let i = 0; i < numHandles; i++) {
      boundaries.push(this.freqToX(this.crossovers[i], width));
    }
    boundaries.push(width);

    // Render per-band width bars and correlation styling
    for (let b = 0; b < this.numBands; b++) {
      const xStart = boundaries[b];
      const xEnd = boundaries[b + 1];
      const wVal = this.bandWidths[b] !== undefined ? this.bandWidths[b] : 1.0;
      const cVal = this.bandCorrelations[b] !== undefined ? this.bandCorrelations[b] : 1.0;

      // Band height proportional to width (width 1.0 = 50% height, width 2.0 = 100% height)
      const bandHeight = (wVal / 2.0) * (height - 30);
      const yTop = height - 20 - bandHeight;

      // Color coding: Mono safe (cyan/green), Widened (purple/blue), Low correlation warning (amber/red)
      let fillColor = 'rgba(56, 189, 248, 0.2)';
      let strokeColor = '#38bdf8';

      if (cVal < 0.2) {
        fillColor = 'rgba(239, 68, 68, 0.25)'; // Danger
        strokeColor = '#ef4444';
      } else if (wVal === 0.0) {
        fillColor = 'rgba(16, 185, 129, 0.25)'; // Mono Safe
        strokeColor = '#10b981';
      } else if (wVal > 1.2) {
        fillColor = 'rgba(168, 85, 247, 0.25)'; // Widened
        strokeColor = '#a855f7';
      }

      ctx.fillStyle = fillColor;
      ctx.fillRect(xStart, yTop, xEnd - xStart, bandHeight);

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xStart, yTop);
      ctx.lineTo(xEnd, yTop);
      ctx.stroke();

      // Draw per-band text readout (Band name + width + correlation)
      ctx.fillStyle = strokeColor;
      ctx.font = '10px Inter, sans-serif';
      const midX = xStart + (xEnd - xStart) / 2;
      ctx.textAlign = 'center';
      ctx.fillText(`B${b + 1} (${wVal.toFixed(1)}x)`, midX, height - 25);
      ctx.fillText(`r: ${cVal.toFixed(2)}`, midX, height - 8);
    }

    // Render draggable crossover handles
    for (let i = 0; i < numHandles; i++) {
      const hx = boundaries[i + 1];

      // Handle vertical line
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Handle circle knob
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(hx, 15, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

if (!customElements.get('sonods-multiband-display')) {
  customElements.define('sonods-multiband-display', SonodsMultibandDisplayElement);
}
