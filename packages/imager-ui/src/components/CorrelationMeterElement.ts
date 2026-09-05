/**
 * SonodsCorrelationMeter — Real-time phase correlation meter component.
 *
 * Canvas-rendered horizontal meter showing phase correlation coefficient from -1.0 to +1.0.
 * Includes color-coded danger zones (-1.0 to 0.0: red/amber warning, 0.0 to +1.0: safe cyan/green).
 */

export class SonodsCorrelationMeterElement extends HTMLElement {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private correlation: number = 1.0;

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
          padding: 10px 14px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 700;
        }
        canvas {
          display: block;
          width: 100%;
          height: 28px;
        }
      </style>
      <div class="container">
        <div class="header">
          <span>Phase Correlation</span>
          <span class="value" id="numReadout">+1.00</span>
        </div>
        <canvas id="meterCanvas" width="400" height="28"></canvas>
      </div>
    `;

    this.canvas = this.shadowRoot!.querySelector('#meterCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext ? this.canvas.getContext('2d') : null;
  }

  connectedCallback() {
    this.render();
  }

  public updateCorrelation(val: number) {
    this.correlation = Math.max(-1.0, Math.min(1.0, val));
    this.render();
  }

  public updateTelemetry(val: number) {
    this.updateCorrelation(val);
  }

  public render() {
    // Update numeric readout text and color regardless of canvas 2D support
    const readoutEl = this.shadowRoot!.querySelector('#numReadout') as HTMLElement;
    if (readoutEl) {
      const formatted = (this.correlation >= 0 ? '+' : '') + this.correlation.toFixed(2);
      readoutEl.textContent = formatted;

      if (this.correlation < -0.2) {
        readoutEl.style.color = '#ef4444'; // Red warning
      } else if (this.correlation < 0.2) {
        readoutEl.style.color = '#f59e0b'; // Amber warning
      } else {
        readoutEl.style.color = '#38bdf8'; // Safe cyan
      }
    }

    if (!this.ctx) {
      return;
    }

    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    // Draw background track
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(0, 4, width, height - 8, 4);
    ctx.fill();

    // Map correlation [-1.0, +1.0] to X coordinate [0, width]
    const zeroX = width / 2;
    const currentX = ((this.correlation + 1) / 2) * width;

    // Gradient bar from center 0.0 to current value
    const barGradient = ctx.createLinearGradient(0, 0, width, 0);
    barGradient.addColorStop(0.0, '#ef4444');  // -1.0 Out of Phase (Danger)
    barGradient.addColorStop(0.35, '#f59e0b'); // -0.3 Warning
    barGradient.addColorStop(0.5, '#38bdf8');  //  0.0 Neutral
    barGradient.addColorStop(1.0, '#10b981');  // +1.0 Mono Safe

    ctx.fillStyle = barGradient;

    if (currentX >= zeroX) {
      ctx.fillRect(zeroX, 6, currentX - zeroX, height - 12);
    } else {
      ctx.fillRect(currentX, 6, zeroX - currentX, height - 12);
    }

    // Draw scale ticks at -1.0, -0.5, 0.0, +0.5, +1.0
    ctx.fillStyle = '#475569';
    const ticks = [-1.0, -0.5, 0.0, 0.5, 1.0];
    ticks.forEach((tick) => {
      const tx = ((tick + 1) / 2) * width;
      ctx.fillRect(tx - 1, 2, 2, height - 4);
    });

    // Draw center line (0.0) accent
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(zeroX - 1, 0, 2, height);

    // Draw indicator needle
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(currentX, height / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

if (!customElements.get('sonods-correlation-meter')) {
  customElements.define('sonods-correlation-meter', SonodsCorrelationMeterElement);
}
