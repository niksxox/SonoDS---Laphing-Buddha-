/**
 * @sonods/imager-ui
 * SonoDS Stereo Imager — Web Component, canvas rendering, interaction, public API & factory presets.
 */

export { SonodsImagerElement, type ImagerModeTab } from './components/SonodsImagerElement.js';
export { SonodsCorrelationMeterElement } from './components/CorrelationMeterElement.js';
export { SonodsVectorscopeElement } from './components/VectorscopeElement.js';
export { SonodsMultibandDisplayElement } from './components/MultibandDisplayElement.js';

export {
  SonoDSImagerPlugin,
  createSonoDSImager,
  type ImagerState
} from './plugin.js';

export { FACTORY_PRESETS, type Preset } from './presets.js';

export const UI_VERSION = '0.1.0';
