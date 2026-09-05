// SonoDS Reverb - Canvas 2D Logarithmic Frequency Response Display
// Renders Decay Rate EQ curve (yellow) and Post EQ curve (cyan) with drag handles.

export interface EqBandPoint {
  id: number;
  type: 'decay' | 'post';
  enabled: boolean;
  filterType?: number; // 0: LowShelf, 1: Bell, 2: HighShelf, 3: Notch
  freqHz: number;
  value: number; // dB for Post EQ (-24..+24), Decay% for Decay EQ (25..400)
  q: number;
}

export class ReverbCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animId: number | null = null;

  public decayBands: EqBandPoint[] = [];
  public postBands: EqBandPoint[] = [];

  private selectedBand: EqBandPoint | null = null;
  private isDragging = false;

  public onDecayChange?: (bandIdx: number, point: EqBandPoint) => void;
  public onPostChange?: (bandIdx: number, point: EqBandPoint) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;

    this.initDefaultBands();
    this.attachEventListeners();
    this.startRenderLoop();
  }

  private initDefaultBands() {
    this.decayBands = [
      { id: 0, type: 'decay', enabled: true, freqHz: 120, value: 100, q: 0.7 },
      { id: 1, type: 'decay', enabled: true, freqHz: 500, value: 100, q: 1.0 },
      { id: 2, type: 'decay', enabled: true, freqHz: 2000, value: 100, q: 1.0 },
      { id: 3, type: 'decay', enabled: true, freqHz: 8000, value: 100, q: 0.7 },
    ];

    this.postBands = [
      { id: 0, type: 'post', enabled: true, filterType: 0, freqHz: 80, value: 0, q: 0.7 },
      { id: 1, type: 'post', enabled: true, filterType: 1, freqHz: 300, value: 0, q: 1.0 },
      { id: 2, type: 'post', enabled: true, filterType: 1, freqHz: 1200, value: 0, q: 1.0 },
      { id: 3, type: 'post', enabled: true, filterType: 1, freqHz: 4000, value: 0, q: 1.0 },
      { id: 4, type: 'post', enabled: true, filterType: 2, freqHz: 10000, value: 0, q: 0.7 },
    ];
  }

  private logFreqToX(freq: number): number {
    const minF = 20;
    const maxF = 20000;
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);
    const logF = Math.log10(Math.max(minF, Math.min(maxF, freq)));
    return ((logF - logMin) / (logMax - logMin)) * this.canvas.width;
  }

  private xToLogFreq(x: number): number {
    const minF = 20;
    const maxF = 20000;
    const norm = Math.max(0, Math.min(1, x / this.canvas.width));
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);
    return Math.pow(10, logMin + norm * (logMax - logMin));
  }

  private dbToY(db: number): number {
    const minDb = -24;
    const maxDb = 24;
    const norm = (db - minDb) / (maxDb - minDb);
    return (1 - norm) * this.canvas.height;
  }

  private yToDb(y: number): number {
    const norm = 1 - y / this.canvas.height;
    return -24 + norm * 48;
  }

  private decayPercentToY(pct: number): number {
    // 25% to 400% mapped log2: log2(25/100)=-2, log2(400/100)=+2
    const norm = (Math.log2(Math.max(25, Math.min(400, pct)) / 100) + 2) / 4;
    return (1 - norm) * this.canvas.height;
  }

  private yToDecayPercent(y: number): number {
    const norm = 1 - y / this.canvas.height;
    const logVal = -2 + norm * 4;
    return Math.pow(2, logVal) * 100;
  }

  private startRenderLoop() {
    const render = () => {
      this.draw();
      this.animId = requestAnimationFrame(render);
    };
    this.animId = requestAnimationFrame(render);
  }

  public stop() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }

  public draw() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;

    // Clear background (dark glassmorphism)
    this.ctx.fillStyle = '#0f1217';
    this.ctx.fillRect(0, 0, w, h);

    // Draw logarithmic grid
    this.drawGrid(w, h);

    // Draw Decay Rate EQ Curve (Yellow)
    this.drawCurve('decay', '#ffea00', 'rgba(255, 234, 0, 0.15)');

    // Draw Post EQ Curve (Cyan)
    this.drawCurve('post', '#00e5ff', 'rgba(0, 229, 255, 0.15)');

    // Draw Band Control Handles
    this.drawHandles();
  }

  private drawGrid(w: number, h: number) {
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    this.ctx.lineWidth = 1;

    // Frequency vertical lines (100Hz, 1kHz, 10kHz)
    const freqs = [100, 1000, 10000];
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    this.ctx.font = '10px sans-serif';

    freqs.forEach((f) => {
      const x = this.logFreqToX(f);
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();

      const label = f >= 1000 ? `${f / 1000}kHz` : `${f}Hz`;
      this.ctx.fillText(label, x + 4, h - 6);
    });

    // 0dB / 100% horizontal center line
    const yCenter = h / 2;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.beginPath();
    this.ctx.moveTo(0, yCenter);
    this.ctx.lineTo(w, yCenter);
    this.ctx.stroke();

    this.ctx.fillText('0 dB / 100%', 6, yCenter - 4);
  }

  private drawCurve(type: 'decay' | 'post', strokeColor: string, fillColor: string) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bands = type === 'decay' ? this.decayBands : this.postBands;

    this.ctx.beginPath();
    this.ctx.moveTo(0, h / 2);

    for (let x = 0; x <= w; x += 4) {
      const freq = this.xToLogFreq(x);
      let totalVal = type === 'decay' ? 100 : 0;

      bands.forEach((b) => {
        if (!b.enabled) return;
        const bw = (b.freqHz / b.q) * 0.5;
        const dist = Math.abs(freq - b.freqHz);
        const factor = Math.exp(-Math.pow(dist / (bw + 1e-4), 2));

        if (type === 'decay') {
          const delta = (b.value - 100) * factor;
          totalVal += delta;
        } else {
          totalVal += b.value * factor;
        }
      });

      const y = type === 'decay' ? this.decayPercentToY(totalVal) : this.dbToY(totalVal);

      if (x === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    // Glow line
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowColor = strokeColor;
    this.ctx.shadowBlur = 8;
    this.ctx.stroke();

    // Fill underneath
    this.ctx.lineTo(w, h / 2);
    this.ctx.lineTo(0, h / 2);
    this.ctx.closePath();
    this.ctx.fillStyle = fillColor;
    this.ctx.fill();

    // Reset shadow
    this.ctx.shadowBlur = 0;
  }

  private drawHandles() {
    const allBands = [...this.decayBands, ...this.postBands];

    allBands.forEach((b) => {
      if (!b.enabled) return;
      const x = this.logFreqToX(b.freqHz);
      const y = b.type === 'decay' ? this.decayPercentToY(b.value) : this.dbToY(b.value);

      const isSelected = this.selectedBand === b;
      const color = b.type === 'decay' ? '#ffea00' : '#00e5ff';

      this.ctx.beginPath();
      this.ctx.arc(x, y, isSelected ? 8 : 6, 0, Math.PI * 2);
      this.ctx.fillStyle = isSelected ? '#ffffff' : color;
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = isSelected ? 12 : 6;
      this.ctx.fill();

      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = color;
      this.ctx.stroke();

      this.ctx.shadowBlur = 0;
    });
  }

  private attachEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
  }

  private getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  private onMouseDown(e: MouseEvent) {
    const { x, y } = this.getCanvasCoords(e);
    const allBands = [...this.decayBands, ...this.postBands];

    for (const b of allBands) {
      if (!b.enabled) continue;
      const bx = this.logFreqToX(b.freqHz);
      const by = b.type === 'decay' ? this.decayPercentToY(b.value) : this.dbToY(b.value);

      if (Math.hypot(x - bx, y - by) < 14) {
        this.selectedBand = b;
        this.isDragging = true;
        break;
      }
    }
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging || !this.selectedBand) return;

    const { x, y } = this.getCanvasCoords(e);
    const freq = this.xToLogFreq(x);

    this.selectedBand.freqHz = Math.max(20, Math.min(20000, freq));

    if (this.selectedBand.type === 'decay') {
      const pct = this.yToDecayPercent(y);
      this.selectedBand.value = Math.max(25, Math.min(400, pct));
      if (this.onDecayChange) {
        this.onDecayChange(this.selectedBand.id, this.selectedBand);
      }
    } else {
      const db = this.yToDb(y);
      this.selectedBand.value = Math.max(-24, Math.min(24, db));
      if (this.onPostChange) {
        this.onPostChange(this.selectedBand.id, this.selectedBand);
      }
    }
  }

  private onMouseUp() {
    this.isDragging = false;
  }

  private onWheel(e: WheelEvent) {
    if (!this.selectedBand) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.selectedBand.q = Math.max(0.1, Math.min(10.0, this.selectedBand.q + delta));

    if (this.selectedBand.type === 'decay' && this.onDecayChange) {
      this.onDecayChange(this.selectedBand.id, this.selectedBand);
    } else if (this.selectedBand.type === 'post' && this.onPostChange) {
      this.onPostChange(this.selectedBand.id, this.selectedBand);
    }
  }
}
