/**
 * @sonods/reverb-ui
 *
 * Web Component UI for the SonoDS Reverb plugin.
 * Handles canvas rendering, user interaction, and visualization.
 *
 * This package has zero knowledge of raw audio math.
 */

export const UI_VERSION = '0.1.0';

export { SonoDsReverbElement } from './SonoDsReverbElement';
export { ReverbCanvas } from './ReverbCanvas';
export type { EqBandPoint } from './ReverbCanvas';
export { KnobComponent } from './KnobComponent';
