import './CorrelationMeterElement.js';
import './VectorscopeElement.js';
import './MultibandDisplayElement.js';
import { SonodsCorrelationMeterElement } from './CorrelationMeterElement.js';
import { SonodsVectorscopeElement } from './VectorscopeElement.js';
import { SonodsMultibandDisplayElement } from './MultibandDisplayElement.js';

export type ImagerModeTab = 'imager' | 'shuffler' | 'matrix';

export class SonodsImagerElement extends HTMLElement {
  private activeTab: ImagerModeTab = 'imager';
  private bypassed: boolean = false;
  private resizeObserver: ResizeObserver | null = null;

  // Shared underlying engine state
  private numBands: number = 4;
  private crossovers: [number, number, number] = [140.0, 1500.0, 6000.0];
  private bandWidths: number[] = [0.0, 1.0, 1.0, 1.0];
  private stereoizeMode: 'off' | 'mode_i' | 'mode_ii' = 'off';
  private stereoizeAmount: number = 0.5;
  private recoverSidesAmount: number = 0.0;
  private asymmetry: number = 0.0;
  private soloMid: boolean = false;
  private soloSide: boolean = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          max-width: 840px;
          min-width: 480px;
          font-family: var(--sonods-font-sans, Inter, system-ui, sans-serif);
          background: #070a13;
          color: #f8fafc;
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
          box-sizing: border-box;
          user-select: none;
        }

        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #1e293b;
        }

        .brand-logo {
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.15em;
          color: #38bdf8;
          text-transform: uppercase;
        }

        .plugin-name {
          font-weight: 600;
          font-size: 14px;
          color: #94a3b8;
          margin-left: 8px;
        }

        .top-display-panel {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 12px;
          margin-bottom: 12px;
          background: #090d16;
          padding: 8px;
          border-radius: 10px;
          border: 1px solid #1e293b;
        }

        @media (max-width: 640px) {
          .top-display-panel {
            grid-template-columns: 1fr;
          }
        }

        .mid-deck {
          margin-bottom: 12px;
        }

        .mode-tabs {
          display: flex;
          gap: 6px;
          margin-bottom: 12px;
          background: #0d1322;
          padding: 4px;
          border-radius: 8px;
          border: 1px solid #1e293b;
        }

        .tab-btn {
          flex: 1;
          background: transparent;
          border: none;
          color: #94a3b8;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .tab-btn.active {
          background: #1e293b;
          color: #38bdf8;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .controls-deck {
          background: #0d1322;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          min-height: 120px;
        }

        .section-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #38bdf8;
          margin-bottom: 10px;
        }

        .enhancement-section {
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 14px;
          margin-bottom: 12px;
        }

        .control-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px;
        }

        .control-card {
          background: #141c2e;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #1e293b;
        }

        .control-label {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          margin-bottom: 6px;
          text-transform: uppercase;
        }

        .control-value {
          color: #38bdf8;
          font-family: monospace;
        }

        input[type="range"] {
          width: 100%;
          accent-color: #38bdf8;
          cursor: pointer;
        }

        select {
          width: 100%;
          background: #1e293b;
          color: #f8fafc;
          border: 1px solid #334155;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .toggle-btn {
          background: #1e293b;
          border: 1px solid #334155;
          color: #94a3b8;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
        }

        .toggle-btn.active {
          background: #38bdf8;
          color: #070a13;
          border-color: #38bdf8;
        }

        .bottom-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 8px;
          border-top: 1px solid #1e293b;
          font-size: 12px;
        }

        .bypass-btn {
          background: #1e293b;
          border: 1px solid #334155;
          color: #94a3b8;
          padding: 6px 14px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }

        .bypass-btn.bypassed {
          background: #ef4444;
          color: #ffffff;
        }
      </style>

      <div class="header-bar">
        <div>
          <span class="brand-logo">SonoDS</span>
          <span class="plugin-name">STEREO IMAGER</span>
        </div>
      </div>

      <div class="top-display-panel" id="topDisplayArea">
        <sonods-vectorscope id="vectorscope"></sonods-vectorscope>
        <sonods-correlation-meter id="correlationMeter"></sonods-correlation-meter>
      </div>

      <div class="mid-deck">
        <sonods-multiband-display id="multibandDisplay"></sonods-multiband-display>
      </div>

      <div class="mode-tabs">
        <button class="tab-btn active" data-tab="imager">Imager (Multiband)</button>
        <button class="tab-btn" data-tab="shuffler">Shuffler (Bass)</button>
        <button class="tab-btn" data-tab="matrix">M-S Matrix</button>
      </div>

      <div class="controls-deck" id="controlsPanel">
        <!-- Tab specific controls rendered dynamically -->
      </div>

      <!-- Explicitly Separated Stereoize & Recover Sides Section -->
      <div class="enhancement-section" id="enhancementSection">
        <div class="section-title">Mono-Safe Enhancements (Opt-In)</div>
        <div class="control-grid">
          <div class="control-card">
            <div class="control-label">
              <span>Stereoize Mode</span>
              <span class="control-value" id="val-st-mode">${this.stereoizeMode.toUpperCase()}</span>
            </div>
            <select id="stereoizeModeSelect">
              <option value="off" ${this.stereoizeMode === 'off' ? 'selected' : ''}>Off (Disabled)</option>
              <option value="mode_i" ${this.stereoizeMode === 'mode_i' ? 'selected' : ''}>Stereoize I (Subtle)</option>
              <option value="mode_ii" ${this.stereoizeMode === 'mode_ii' ? 'selected' : ''}>Stereoize II (Colorful)</option>
            </select>
          </div>

          <div class="control-card">
            <div class="control-label">
              <span>Stereoize Depth</span>
              <span class="control-value" id="val-st-amt">${(this.stereoizeAmount * 100).toFixed(0)}%</span>
            </div>
            <input type="range" id="stereoizeAmountSlider" min="0" max="1" step="0.05" value="${this.stereoizeAmount}" />
          </div>

          <div class="control-card">
            <div class="control-label">
              <span>Recover Sides</span>
              <span class="control-value" id="val-rec-amt">${(this.recoverSidesAmount * 100).toFixed(0)}%</span>
            </div>
            <input type="range" id="recoverSidesSlider" min="0" max="1" step="0.05" value="${this.recoverSidesAmount}" />
          </div>
        </div>
      </div>

      <div class="bottom-bar">
        <button class="bypass-btn" id="bypassBtn">IN</button>
        <span style="color: #64748b;">SonoDS DSP Core v0.1.0</span>
      </div>
    `;

    this.setupTabs();
    this.setupEnhancements();
    this.renderTabControls();
  }

  connectedCallback() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this);
    }
  }

  disconnectedCallback() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private handleResize() {
    const scope = this.shadowRoot?.querySelector('#vectorscope') as SonodsVectorscopeElement;
    const meter = this.shadowRoot?.querySelector('#correlationMeter') as SonodsCorrelationMeterElement;
    if (scope && scope.render) scope.render();
    if (meter && meter.render) meter.render();
  }

  private setupEnhancements() {
    const stSelect = this.shadowRoot!.querySelector('#stereoizeModeSelect') as HTMLSelectElement;
    stSelect.addEventListener('change', () => {
      this.stereoizeMode = stSelect.value as 'off' | 'mode_i' | 'mode_ii';
      this.shadowRoot!.querySelector('#val-st-mode')!.textContent = this.stereoizeMode.toUpperCase();
      this.emitParamChange('stereoize', { mode: this.stereoizeMode, amount: this.stereoizeAmount });
    });

    const stSlider = this.shadowRoot!.querySelector('#stereoizeAmountSlider') as HTMLInputElement;
    stSlider.addEventListener('input', () => {
      this.stereoizeAmount = parseFloat(stSlider.value);
      this.shadowRoot!.querySelector('#val-st-amt')!.textContent = `${(this.stereoizeAmount * 100).toFixed(0)}%`;
      this.emitParamChange('stereoize', { mode: this.stereoizeMode, amount: this.stereoizeAmount });
    });

    const recSlider = this.shadowRoot!.querySelector('#recoverSidesSlider') as HTMLInputElement;
    recSlider.addEventListener('input', () => {
      this.recoverSidesAmount = parseFloat(recSlider.value);
      this.shadowRoot!.querySelector('#val-rec-amt')!.textContent = `${(this.recoverSidesAmount * 100).toFixed(0)}%`;
      this.emitParamChange('recoverSides', { value: this.recoverSidesAmount });
    });
  }

  private setupTabs() {
    const tabBtns = this.shadowRoot!.querySelectorAll('.tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = (btn as HTMLElement).dataset.tab as ImagerModeTab;
        this.activeTab = tab;

        this.renderTabControls();

        this.dispatchEvent(
          new CustomEvent('tab-change', {
            detail: { tab },
            bubbles: true,
            composed: true,
          })
        );
      });
    });

    const bypassBtn = this.shadowRoot!.querySelector('#bypassBtn') as HTMLButtonElement;
    bypassBtn.addEventListener('click', () => {
      this.bypassed = !this.bypassed;
      bypassBtn.textContent = this.bypassed ? 'BYPASS' : 'IN';
      bypassBtn.classList.toggle('bypassed', this.bypassed);

      this.dispatchEvent(
        new CustomEvent('bypass-change', {
          detail: { bypassed: this.bypassed },
          bubbles: true,
          composed: true,
        })
      );
    });
  }

  public renderTabControls() {
    const panel = this.shadowRoot!.querySelector('#controlsPanel') as HTMLElement;
    if (!panel) return;

    if (this.activeTab === 'imager') {
      panel.innerHTML = `
        <div class="control-grid">
          ${[0, 1, 2, 3]
            .map(
              (b) => `
            <div class="control-card">
              <div class="control-label">
                <span>Band ${b + 1} Width</span>
                <span class="control-value" id="val-b${b}">${this.bandWidths[b].toFixed(2)}x</span>
              </div>
              <input type="range" class="band-slider" data-band="${b}" min="0" max="2" step="0.05" value="${this.bandWidths[b]}" />
            </div>
          `
            )
            .join('')}
        </div>
      `;

      panel.querySelectorAll('.band-slider').forEach((slider) => {
        slider.addEventListener('input', (e) => {
          const input = e.target as HTMLInputElement;
          const b = parseInt(input.dataset.band!);
          const val = parseFloat(input.value);
          this.bandWidths[b] = val;
          panel.querySelector(`#val-b${b}`)!.textContent = `${val.toFixed(2)}x`;
          this.emitParamChange('bandWidth', { band: b, value: val });
        });
      });
    } else if (this.activeTab === 'shuffler') {
      panel.innerHTML = `
        <div class="control-grid">
          <div class="control-card">
            <div class="control-label">
              <span>Bass Cutoff</span>
              <span class="control-value" id="val-shuf-cutoff">${Math.round(this.crossovers[0])} Hz</span>
            </div>
            <input type="range" id="shufCutoff" min="20" max="400" step="5" value="${this.crossovers[0]}" />
          </div>
          <div class="control-card">
            <div class="control-label">
              <span>Bass Width</span>
              <span class="control-value" id="val-shuf-width">${this.bandWidths[0].toFixed(2)}x</span>
            </div>
            <input type="range" id="shufWidth" min="0" max="2" step="0.05" value="${this.bandWidths[0]}" />
          </div>
        </div>
      `;

      const cutoffSlider = panel.querySelector('#shufCutoff') as HTMLInputElement;
      cutoffSlider.addEventListener('input', () => {
        const val = parseFloat(cutoffSlider.value);
        this.crossovers[0] = val;
        panel.querySelector('#val-shuf-cutoff')!.textContent = `${Math.round(val)} Hz`;
        this.emitParamChange('crossovers', { crossovers: [...this.crossovers] });
      });

      const widthSlider = panel.querySelector('#shufWidth') as HTMLInputElement;
      widthSlider.addEventListener('input', () => {
        const val = parseFloat(widthSlider.value);
        this.bandWidths[0] = val;
        panel.querySelector('#val-shuf-width')!.textContent = `${val.toFixed(2)}x`;
        this.emitParamChange('bandWidth', { band: 0, value: val });
      });
    } else if (this.activeTab === 'matrix') {
      panel.innerHTML = `
        <div class="control-grid">
          <div class="control-card">
            <div class="control-label"><span>Mid Solo</span></div>
            <button class="toggle-btn ${this.soloMid ? 'active' : ''}" id="soloMidBtn">${this.soloMid ? 'SOLO MID (ON)' : 'SOLO MID (OFF)'}</button>
          </div>
          <div class="control-card">
            <div class="control-label"><span>Side Solo</span></div>
            <button class="toggle-btn ${this.soloSide ? 'active' : ''}" id="soloSideBtn">${this.soloSide ? 'SOLO SIDE (ON)' : 'SOLO SIDE (OFF)'}</button>
          </div>
          <div class="control-card">
            <div class="control-label">
              <span>Asymmetry</span>
              <span class="control-value" id="val-matrix-asym">${(this.asymmetry >= 0 ? '+' : '') + this.asymmetry.toFixed(2)}</span>
            </div>
            <input type="range" id="matrixAsym" min="-1" max="1" step="0.05" value="${this.asymmetry}" />
          </div>
        </div>
      `;

      const midBtn = panel.querySelector('#soloMidBtn') as HTMLButtonElement;
      midBtn.addEventListener('click', () => {
        this.soloMid = !this.soloMid;
        if (this.soloMid) this.soloSide = false;
        this.renderTabControls();
        this.emitParamChange('soloMid', { soloMid: this.soloMid });
      });

      const sideBtn = panel.querySelector('#soloSideBtn') as HTMLButtonElement;
      sideBtn.addEventListener('click', () => {
        this.soloSide = !this.soloSide;
        if (this.soloSide) this.soloMid = false;
        this.renderTabControls();
        this.emitParamChange('soloSide', { soloSide: this.soloSide });
      });

      const asymSlider = panel.querySelector('#matrixAsym') as HTMLInputElement;
      asymSlider.addEventListener('input', () => {
        const val = parseFloat(asymSlider.value);
        this.asymmetry = val;
        panel.querySelector('#val-matrix-asym')!.textContent = (val >= 0 ? '+' : '') + val.toFixed(2);
        this.emitParamChange('asymmetry', { value: val });
      });
    }
  }

  private emitParamChange(name: string, detail: any) {
    this.dispatchEvent(
      new CustomEvent('param-change', {
        detail: { name, ...detail },
        bubbles: true,
        composed: true,
      })
    );
  }

  public getActiveTab(): ImagerModeTab {
    return this.activeTab;
  }

  public isBypassed(): boolean {
    return this.bypassed;
  }

  public getBandWidths(): number[] {
    return [...this.bandWidths];
  }

  public getStereoizeMode(): string {
    return this.stereoizeMode;
  }

  public getRecoverSidesAmount(): number {
    return this.recoverSidesAmount;
  }
}

if (!customElements.get('sonods-imager')) {
  customElements.define('sonods-imager', SonodsImagerElement);
}
