//! Canvas 2D Physical Hydraulic Press and Burger Stack Renderer per Task 3.3.
//! Framework-agnostic renderer (zero React imports).

export interface PressRenderOptions {
  width: number;
  height: number;
  dpr?: number;
  strokeColor?: string;
  plateColor?: string;
}

export class PressRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: Required<PressRenderOptions>;

  constructor(canvas: HTMLCanvasElement, options: PressRenderOptions) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to obtain 2D canvas context');
    this.ctx = context;

    this.options = {
      width: options.width,
      height: options.height,
      dpr: options.dpr || (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
      strokeColor: options.strokeColor || '#18181B',
      plateColor: options.plateColor || '#FFFFFF',
    };

    this.resize(this.options.width, this.options.height);
  }

  public resize(width: number, height: number): void {
    this.options.width = width;
    this.options.height = height;
    const dpr = this.options.dpr;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /// Renders the hydraulic press compressing the burger stack per the user's doodle.
  /// `squishAmount`: 0.0 (uncompressed) to 1.0 (fully pressed/squeezed).
  public render(squishAmount: number): void {
    const ctx = this.ctx;
    const w = this.options.width;
    const h = this.options.height;
    const stroke = this.options.strokeColor;

    ctx.clearRect(0, 0, w, h);

    const centerX = w * 0.5;
    const centerY = h * 0.5;

    // Physical travel: plates squeeze inward as squishAmount increases
    // Max displacement of plates: ~24px each toward the center
    const maxTravel = 24.0;
    const travel = squishAmount * maxTravel;

    // Horizontal bulging of burger layers under compression
    const bulgeX = squishAmount * 16.0;

    ctx.save();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // -------------------------------------------------------------
    // 1. TOP HYDRAULIC PRESS (Piston Stem + Top Plate)
    // -------------------------------------------------------------
    const topPlateY = centerY - 62 + travel;
    const plateW = 110;
    const plateH = 18;
    const stemW = 20;
    const stemH = 34;

    ctx.fillStyle = '#FFFFFF';

    // Top stem
    ctx.beginPath();
    ctx.moveTo(centerX - stemW / 2, topPlateY - stemH);
    ctx.lineTo(centerX - stemW / 2, topPlateY);
    ctx.lineTo(centerX + stemW / 2, topPlateY);
    ctx.lineTo(centerX + stemW / 2, topPlateY - stemH);
    ctx.stroke();

    // Top plate rounded rect
    this.drawRoundedRect(
      ctx,
      centerX - plateW / 2,
      topPlateY,
      plateW,
      plateH,
      4,
      true,
      true
    );

    // -------------------------------------------------------------
    // 2. BOTTOM HYDRAULIC PRESS (Base Plate + Bottom Stem)
    // -------------------------------------------------------------
    const bottomPlateY = centerY + 44 - travel;

    // Bottom plate rounded rect
    this.drawRoundedRect(
      ctx,
      centerX - plateW / 2,
      bottomPlateY,
      plateW,
      plateH,
      4,
      true,
      true
    );

    // Bottom stem
    ctx.beginPath();
    ctx.moveTo(centerX - stemW / 2, bottomPlateY + plateH);
    ctx.lineTo(centerX - stemW / 2, bottomPlateY + plateH + stemH);
    ctx.lineTo(centerX + stemW / 2, bottomPlateY + plateH + stemH);
    ctx.lineTo(centerX + stemW / 2, bottomPlateY + plateH);
    ctx.stroke();

    // -------------------------------------------------------------
    // 3. BURGER STACK (Squeezed between plates)
    // Layers:
    // - Top Bun (Gold/Amber)
    // - Lettuce (Vibrant Green)
    // - Patty 1 (Dark Red/Brown)
    // - Patty 2 (Dark Red/Brown)
    // - Lettuce (Vibrant Green)
    // - Bottom Bun (Gold/Amber)
    // -------------------------------------------------------------
    const stackTopY = topPlateY + plateH + 2;
    const stackBottomY = bottomPlateY - 2;
    const totalStackH = Math.max(16, stackBottomY - stackTopY);

    const layerH = totalStackH / 6.0;
    const baseLayerW = 86;
    const currentLayerW = baseLayerW + bulgeX;

    const layers = [
      { color: '#F59E0B', label: 'bun' },     // Top Bun
      { color: '#84CC16', label: 'lettuce' }, // Lettuce
      { color: '#881337', label: 'patty' },   // Patty 1 (Dark Red)
      { color: '#881337', label: 'patty' },   // Patty 2 (Dark Red)
      { color: '#84CC16', label: 'lettuce' }, // Lettuce
      { color: '#F59E0B', label: 'bun' },     // Bottom Bun
    ];

    for (let i = 0; i < layers.length; i++) {
      const ly = stackTopY + i * layerH;
      // Middle layers bulge slightly more than outer edges
      const layerBulge = (1.0 - Math.abs(i - 2.5) / 2.5) * bulgeX;
      const lw = baseLayerW + layerBulge;

      ctx.fillStyle = layers[i].color;
      this.drawRoundedRect(
        ctx,
        centerX - lw / 2,
        ly,
        lw,
        Math.max(3, layerH - 1),
        3,
        true,
        true
      );
    }

    ctx.restore();
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: boolean,
    stroke: boolean
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();

    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
}
