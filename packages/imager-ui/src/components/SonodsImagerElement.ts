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

        /* Combined Top Display Panel Area */
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
          padding: 14px;
          margin-bottom: 12px;
          min-height: 120px;
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

      <div class="bottom-bar">
        <button class="bypass-btn" id="bypassBtn">IN</button>
        <span style="color: #64748b;">SonoDS DSP Core v0.1.0</span>
      </div>
    `;

    this.setupTabs();
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

  private setupTabs() {
    const tabBtns = this.shadowRoot!.querySelectorAll('.tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = (btn as HTMLElement).dataset.tab as ImagerModeTab;
        this.activeTab = tab;

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

  public getActiveTab(): ImagerModeTab {
    return this.activeTab;
  }

  public isBypassed(): boolean {
    return this.bypassed;
  }
}

if (!customElements.get('sonods-imager')) {
  customElements.define('sonods-imager', SonodsImagerElement);
}
