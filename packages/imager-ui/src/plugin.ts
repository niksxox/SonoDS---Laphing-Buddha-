import { SonodsImagerElement, type ImagerModeTab } from './components/SonodsImagerElement.js';
import type { SonodsImagerNode, ImagerTelemetry } from '@sonods/imager-engine';

export interface ImagerState {
  bypassed: boolean;
  activeTab: ImagerModeTab;
  numBands: number;
  crossovers: [number, number, number];
  bandWidths: number[];
  stereoizeMode: 'off' | 'mode_i' | 'mode_ii';
  stereoizeAmount: number;
  recoverSidesAmount: number;
  asymmetry: number;
  soloMid: boolean;
  soloSide: boolean;
}

export class SonoDSImagerPlugin {
  private element: SonodsImagerElement;
  private node: SonodsImagerNode | null = null;
  private telemetryUnsubscribe: (() => void) | null = null;
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(options?: { container?: HTMLElement; node?: SonodsImagerNode }) {
    this.element = document.createElement('sonods-imager') as SonodsImagerElement;

    if (options?.container) {
      this.mount(options.container);
    }
    if (options?.node) {
      this.connect(options.node);
    }

    this.setupElementListeners();
  }

  public mount(container: HTMLElement): void {
    if (!container.contains(this.element)) {
      container.appendChild(this.element);
    }
  }

  public unmount(): void {
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }

  public connect(node: SonodsImagerNode): void {
    this.disconnect();
    this.node = node;

    // Subscribe to telemetry from AudioWorklet node
    this.telemetryUnsubscribe = node.onTelemetry((telemetry: ImagerTelemetry) => {
      this.element.updateTelemetry(telemetry);
      this.emit('telemetry', telemetry);
    });

    // Apply initial state to node
    this.syncStateToNode();
  }

  public disconnect(): void {
    if (this.telemetryUnsubscribe) {
      this.telemetryUnsubscribe();
      this.telemetryUnsubscribe = null;
    }
    this.node = null;
  }

  public getState(): ImagerState {
    return this.element.getState();
  }

  public setState(state: Partial<ImagerState>): void {
    this.element.setState(state);
    this.syncStateToNode();
    this.emit('state-change', this.getState());
  }

  public on(event: string, callback: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((fn) => {
        try {
          fn(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      });
    }
  }

  private setupElementListeners(): void {
    this.element.addEventListener('param-change', (e: any) => {
      this.syncStateToNode();
      this.emit('param-change', e.detail);
      this.emit('state-change', this.getState());
    });

    this.element.addEventListener('crossover-change', (e: any) => {
      this.syncStateToNode();
      this.emit('crossover-change', e.detail);
      this.emit('state-change', this.getState());
    });

    this.element.addEventListener('tab-change', (e: any) => {
      this.emit('tab-change', e.detail);
    });

    this.element.addEventListener('bypass-change', (e: any) => {
      this.syncStateToNode();
      this.emit('bypass-change', e.detail);
      this.emit('state-change', this.getState());
    });
  }

  private syncStateToNode(): void {
    if (!this.node) return;
    const state = this.getState();

    // Map UI state to engine AudioWorklet node parameters
    this.node.setBypass(state.bypassed);
    this.node.setCrossovers(state.crossovers[0], state.crossovers[1], state.crossovers[2]);
    for (let b = 0; b < state.bandWidths.length; b++) {
      this.node.setBandWidth(b, state.bandWidths[b]);
    }
    this.node.setStereoize(state.stereoizeMode, state.stereoizeAmount);
    this.node.setRecoverSides(state.recoverSidesAmount);
    this.node.setAsymmetry(state.asymmetry);
    this.node.setSoloMid(state.soloMid);
    this.node.setSoloSide(state.soloSide);
  }

  public getElement(): SonodsImagerElement {
    return this.element;
  }

  public destroy(): void {
    this.disconnect();
    this.unmount();
    this.eventListeners.clear();
  }
}

export function createSonoDSImager(options?: { container?: HTMLElement; node?: SonodsImagerNode }): SonoDSImagerPlugin {
  return new SonoDSImagerPlugin(options);
}
