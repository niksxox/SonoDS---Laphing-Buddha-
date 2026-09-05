// SonoDS Reverb - Custom Rotary Knob Web Component
// Premium glassmorphic rotatable knob with arc readout and drag interaction.

export class KnobComponent extends HTMLElement {
  private label = '';
  private min = 0;
  private max = 100;
  private value = 50;
  private defaultValue = 50;
  private step = 1;
  private unit = '';
  private color = '#00e5ff'; // Default cyan accent

  private isDragging = false;
  private startY = 0;
  private startValue = 0;

  public onChange?: (value: number) => void;

  static get observedAttributes() {
    return ['label', 'min', 'max', 'value', 'default', 'step', 'unit', 'color'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.readAttributes();
    this.render();
    this.attachEvents();
  }

  attributeChangedCallback() {
    this.readAttributes();
    this.updateDisplay();
  }

  private readAttributes() {
    this.label = this.getAttribute('label') || '';
    this.min = parseFloat(this.getAttribute('min') || '0');
    this.max = parseFloat(this.getAttribute('max') || '100');
    this.value = parseFloat(this.getAttribute('value') || '50');
    this.defaultValue = parseFloat(this.getAttribute('default') || String(this.value));
    this.step = parseFloat(this.getAttribute('step') || '1');
    this.unit = this.getAttribute('unit') || '';
    this.color = this.getAttribute('color') || '#00e5ff';
  }

  public setValue(val: number) {
    this.value = Math.max(this.min, Math.min(this.max, val));
    this.updateDisplay();
  }

  public getValue(): number {
    return this.value;
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          user-select: none;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          margin: 6px;
        }

        .knob-container {
          position: relative;
          width: 64px;
          height: 64px;
          cursor: ns-resize;
        }

        svg {
          width: 100%;
          height: 100%;
          transform: rotate(-135deg);
        }

        .track {
          fill: none;
          stroke: rgba(255, 255, 255, 0.1);
          stroke-width: 5;
          stroke-linecap: round;
        }

        .value-arc {
          fill: none;
          stroke: ${this.color};
          stroke-width: 5;
          stroke-linecap: round;
          transition: stroke-dashoffset 0.05s ease;
          filter: drop-shadow(0 0 4px ${this.color});
        }

        .knob-body {
          position: absolute;
          top: 8px;
          left: 8px;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(145deg, #1c2028, #11141a);
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pointer {
          width: 3px;
          height: 14px;
          background-color: ${this.color};
          border-radius: 2px;
          position: absolute;
          top: 6px;
          transform-origin: center 18px;
          box-shadow: 0 0 6px ${this.color};
        }

        .label {
          font-size: 11px;
          font-weight: 600;
          color: #a0a6b8;
          margin-top: 6px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .value-text {
          font-size: 11px;
          font-weight: 500;
          color: #e0e6ed;
          margin-top: 2px;
        }
      </style>

      <div class="knob-container">
        <svg viewBox="0 0 64 64">
          <circle class="track" cx="32" cy="32" r="26" stroke-dasharray="122.5 163.3" />
          <circle class="value-arc" id="arc" cx="32" cy="32" r="26" stroke-dasharray="122.5 163.3" stroke-dashoffset="122.5" />
        </svg>
        <div class="knob-body">
          <div class="pointer" id="pointer"></div>
        </div>
      </div>
      <div class="label">${this.label}</div>
      <div class="value-text" id="valText">${this.formatValue()}</div>
    `;

    this.updateDisplay();
  }

  private updateDisplay() {
    if (!this.shadowRoot) return;

    const norm = (this.value - this.min) / (this.max - this.min);
    const maxOffset = 122.5; // Arc length for 270 degrees
    const dashoffset = maxOffset * (1 - norm);

    const arc = this.shadowRoot.getElementById('arc');
    if (arc) {
      arc.style.strokeDashoffset = String(dashoffset);
    }

    const pointer = this.shadowRoot.getElementById('pointer');
    if (pointer) {
      const angle = -135 + norm * 270;
      pointer.style.transform = `rotate(${angle}deg)`;
    }

    const valText = this.shadowRoot.getElementById('valText');
    if (valText) {
      valText.textContent = this.formatValue();
    }
  }

  private formatValue(): string {
    let formatted = this.value.toFixed(this.step < 1 ? 2 : 0);
    if (this.unit === 'dB' && this.value > 0) formatted = `+${formatted}`;
    return `${formatted}${this.unit}`;
  }

  private attachEvents() {
    const container = this.shadowRoot?.querySelector('.knob-container');
    if (!container) return;

    container.addEventListener('mousedown', (e: Event) => {
      const me = e as MouseEvent;
      this.isDragging = true;
      this.startY = me.clientY;
      this.startValue = this.value;
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isDragging) return;
      const deltaY = this.startY - e.clientY;
      const range = this.max - this.min;
      const speed = e.shiftKey ? 0.001 : 0.005; // Shift for fine control
      const deltaVal = deltaY * range * speed;
      const newVal = Math.max(this.min, Math.min(this.max, this.startValue + deltaVal));

      this.value = Math.round(newVal / this.step) * this.step;
      this.updateDisplay();

      if (this.onChange) {
        this.onChange(this.value);
      }
      this.dispatchEvent(new CustomEvent('change', { detail: { value: this.value } }));
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    container.addEventListener('dblclick', () => {
      this.value = this.defaultValue;
      this.updateDisplay();
      if (this.onChange) {
        this.onChange(this.value);
      }
      this.dispatchEvent(new CustomEvent('change', { detail: { value: this.value } }));
    });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('sonods-knob')) {
  customElements.define('sonods-knob', KnobComponent);
}
