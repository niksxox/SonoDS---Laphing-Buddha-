// SonoDS Reverb - Main Web Component UI Element (<sonods-reverb>)
// Full Pro-R clone UI layout with modern dark glassmorphic SonoDS visual theme.

import { ReverbEngine, FACTORY_PRESETS, ReverbPreset } from '@sonods/reverb-engine';
import { ReverbCanvas } from './ReverbCanvas';
import './KnobComponent';

export class SonoDsReverbElement extends HTMLElement {
  private _engine: ReverbEngine | null = null;
  private canvasHandler: ReverbCanvas | null = null;

  private currentPresetName = 'Concert Hall Large';
  private mixLocked = false;
  private freezeActive = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set engine(engine: ReverbEngine | null) {
    this._engine = engine;
    if (engine) {
      this.syncUiWithEngine();
    }
  }

  get engine(): ReverbEngine | null {
    return this._engine;
  }

  connectedCallback() {
    this.render();
    this.initCanvas();
    this.attachUiEvents();
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 960px;
          height: 600px;
          background: #111419;
          border-radius: 12px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1);
          color: #e0e6ed;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          user-select: none;
          overflow: hidden;
          position: relative;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .header {
          height: 48px;
          background: rgba(20, 24, 32, 0.9);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.5px;
        }

        .brand-logo {
          width: 18px;
          height: 18px;
          background: #00e5ff;
          border-radius: 4px;
          box-shadow: 0 0 10px #00e5ff;
        }

        .preset-bar {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        select.preset-select {
          background: #1a1e26;
          color: #00e5ff;
          border: 1px solid rgba(0, 229, 255, 0.3);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
          outline: none;
          cursor: pointer;
        }

        .top-btn {
          background: #1a1e26;
          color: #a0a6b8;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .top-btn:hover {
          color: #fff;
          background: #242934;
        }

        .top-btn.active {
          color: #ffea00;
          border-color: #ffea00;
          box-shadow: 0 0 8px rgba(255, 234, 0, 0.3);
        }

        .canvas-container {
          height: 280px;
          position: relative;
          background: #0d1014;
        }

        canvas {
          width: 100%;
          height: 100%;
          display: block;
        }

        .controls-panel {
          height: 272px;
          background: linear-gradient(180deg, #151820 0%, #0d0f14 100%);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 16px 24px;
        }

        .main-knobs-row {
          display: flex;
          align-items: center;
          justify-content: space-around;
        }

        .space-center {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .space-badge {
          font-size: 11px;
          font-weight: 700;
          color: #00e5ff;
          background: rgba(0, 229, 255, 0.1);
          padding: 2px 8px;
          border-radius: 10px;
          margin-top: 4px;
          border: 1px solid rgba(0, 229, 255, 0.2);
        }

        .secondary-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          padding: 10px 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .sec-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .freeze-btn {
          background: #1a1e26;
          color: #00e5ff;
          border: 1px solid #00e5ff;
          border-radius: 20px;
          padding: 8px 20px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 1px;
        }

        .freeze-btn.frozen {
          background: #00e5ff;
          color: #000;
          box-shadow: 0 0 16px #00e5ff;
        }
      </style>

      <!-- Header / Top Bar -->
      <div class="header">
        <div class="brand">
          <div class="brand-logo"></div>
          <span>SonoDS REVERB</span>
        </div>

        <div class="preset-bar">
          <select class="preset-select" id="presetSelect">
            ${FACTORY_PRESETS.map(
              (p) => `<option value="${p.name}">${p.category}: ${p.name}</option>`
            ).join('')}
          </select>

          <button class="top-btn" id="mixLockBtn">🔒 Mix Lock</button>
          <button class="top-btn" id="abBtn">A / B</button>
        </div>
      </div>

      <!-- Center Display Canvas -->
      <div class="canvas-container">
        <canvas id="eqCanvas" width="960" height="280"></canvas>
      </div>

      <!-- Controls Panel -->
      <div class="controls-panel">
        <!-- Main Knobs Row -->
        <div class="main-knobs-row">
          <sonods-knob id="rt60Knob" label="Decay" min="0.2" max="20" value="2.4" default="2.4" step="0.1" unit="s" color="#ffea00"></sonods-knob>
          <sonods-knob id="brightKnob" label="Brightness" min="-1" max="1" value="0" default="0" step="0.05" color="#00e5ff"></sonods-knob>
          
          <div class="space-center">
            <sonods-knob id="spaceKnob" label="Space" min="0" max="1" value="0.7" default="0.7" step="0.01" color="#ff007f"></sonods-knob>
            <div class="space-badge" id="spaceBadge">Concert Hall</div>
          </div>

          <sonods-knob id="characterKnob" label="Character" min="0" max="1" value="0.35" default="0.35" step="0.01" color="#ffea00"></sonods-knob>
          <sonods-knob id="distanceKnob" label="Distance" min="0" max="1" value="0.6" default="0.6" step="0.01" color="#00e5ff"></sonods-knob>
        </div>

        <!-- Secondary Controls Row -->
        <div class="secondary-row">
          <div class="sec-group">
            <sonods-knob id="predelayKnob" label="Pre-Delay" min="0" max="500" value="25" default="25" step="1" unit="ms" color="#00e5ff"></sonods-knob>
            <sonods-knob id="thicknessKnob" label="Thickness" min="0" max="1" value="0.2" default="0.2" step="0.01" color="#ffea00"></sonods-knob>
            <sonods-knob id="widthKnob" label="Width" min="0" max="2" value="1.0" default="1.0" step="0.05" unit="x" color="#00e5ff"></sonods-knob>
          </div>

          <button class="freeze-btn" id="freezeBtn">FREEZE</button>

          <div class="sec-group">
            <sonods-knob id="duckingKnob" label="Ducking" min="0" max="1" value="0" default="0" step="0.01" color="#ff007f"></sonods-knob>
            <sonods-knob id="mixKnob" label="Mix" min="0" max="100" value="35" default="35" step="1" unit="%" color="#00e5ff"></sonods-knob>
          </div>
        </div>
      </div>
    `;
  }

  private initCanvas() {
    const canvas = this.shadowRoot?.getElementById('eqCanvas') as HTMLCanvasElement;
    if (canvas) {
      this.canvasHandler = new ReverbCanvas(canvas);

      this.canvasHandler.onDecayChange = (bandIdx, point) => {
        if (this._engine) {
          this._engine.setDecayRateBand(bandIdx, point.enabled, point.freqHz, point.value, point.q);
        }
      };

      this.canvasHandler.onPostChange = (bandIdx, point) => {
        if (this._engine) {
          this._engine.setPostEqBand(
            bandIdx,
            point.enabled,
            point.filterType ?? 1,
            point.freqHz,
            point.value,
            point.q
          );
        }
      };
    }
  }

  private attachUiEvents() {
    if (!this.shadowRoot) return;

    // Preset Selector
    const presetSelect = this.shadowRoot.getElementById('presetSelect') as HTMLSelectElement;
    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const found = FACTORY_PRESETS.find((p) => p.name === presetSelect.value);
        if (found) {
          this.applyPresetUi(found);
          if (this._engine) this._engine.loadPreset(found);
        }
      });
    }

    // Mix Lock
    const mixLockBtn = this.shadowRoot.getElementById('mixLockBtn');
    if (mixLockBtn) {
      mixLockBtn.addEventListener('click', () => {
        this.mixLocked = !this.mixLocked;
        mixLockBtn.classList.toggle('active', this.mixLocked);
        if (this._engine) this._engine.setMixLocked(this.mixLocked);
      });
    }

    // Freeze Button
    const freezeBtn = this.shadowRoot.getElementById('freezeBtn');
    if (freezeBtn) {
      freezeBtn.addEventListener('click', () => {
        this.freezeActive = !this.freezeActive;
        freezeBtn.classList.toggle('frozen', this.freezeActive);
        if (this._engine) this._engine.setFreeze(this.freezeActive);
      });
    }

    // Bind Knobs to Engine
    this.bindKnob('spaceKnob', (val) => {
      if (this._engine) this._engine.setSpace(val);
      this.updateSpaceBadge(val);
    });

    this.bindKnob('rt60Knob', (val) => {
      if (this._engine) this._engine.setRt60(val);
    });

    this.bindKnob('brightKnob', (val) => {
      if (this._engine) this._engine.setBrightness(val);
    });

    this.bindKnob('characterKnob', (val) => {
      if (this._engine) this._engine.setCharacter(val);
    });

    this.bindKnob('distanceKnob', (val) => {
      if (this._engine) this._engine.setDistance(val);
    });

    this.bindKnob('thicknessKnob', (val) => {
      if (this._engine) this._engine.setThickness(val);
    });

    this.bindKnob('widthKnob', (val) => {
      if (this._engine) this._engine.setStereoWidth(val);
    });

    this.bindKnob('predelayKnob', (val) => {
      if (this._engine) this._engine.setPredelayMs(val);
    });

    this.bindKnob('duckingKnob', (val) => {
      if (this._engine) this._engine.setDuckingAmount(val);
    });

    this.bindKnob('mixKnob', (val) => {
      if (this._engine) this._engine.setMix(val);
    });
  }

  private bindKnob(id: string, callback: (val: number) => void) {
    const knob = this.shadowRoot?.getElementById(id) as any;
    if (knob) {
      knob.onChange = callback;
    }
  }

  private updateSpaceBadge(space: number) {
    const badge = this.shadowRoot?.getElementById('spaceBadge');
    if (!badge) return;

    if (space < 0.2) badge.textContent = 'Tiny Room';
    else if (space < 0.4) badge.textContent = 'Studio Room';
    else if (space < 0.6) badge.textContent = 'Large Chamber';
    else if (space < 0.8) badge.textContent = 'Concert Hall';
    else badge.textContent = 'Grand Cathedral';
  }

  private applyPresetUi(preset: ReverbPreset) {
    const setKnobVal = (id: string, val: number) => {
      const k = this.shadowRoot?.getElementById(id) as any;
      if (k && k.setValue) k.setValue(val);
    };

    setKnobVal('spaceKnob', preset.space);
    setKnobVal('rt60Knob', preset.rt60);
    setKnobVal('brightKnob', preset.brightness);
    setKnobVal('characterKnob', preset.character);
    setKnobVal('distanceKnob', preset.distance);
    setKnobVal('thicknessKnob', preset.thickness);
    setKnobVal('widthKnob', preset.stereoWidth);
    setKnobVal('predelayKnob', preset.predelayMs);
    setKnobVal('duckingKnob', preset.duckingAmount);

    if (!this.mixLocked) {
      setKnobVal('mixKnob', preset.mixPercent);
    }

    this.updateSpaceBadge(preset.space);
  }

  private syncUiWithEngine() {
    if (!this._engine) return;
    const first = FACTORY_PRESETS[0];
    this._engine.loadPreset(first);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('sonods-reverb')) {
  customElements.define('sonods-reverb', SonoDsReverbElement);
}
