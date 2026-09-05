import React from 'react';
import { createRoot } from 'react-dom/client';
import { SonodsEqNode } from '@sonods/eq-engine';
import { SonodsEq, SonodsEqProps } from './components/SonodsEq/index.js';

export * from './theme/tokens.js';
export * from './coords.js';
export * from './render/index.js';
export * from './sessionRegistry.js';
export * from './collision.js';
export * from './explainability.js';
export * from './hooks/useSonodsEqStore.js';

// Components
export * from './components/StatusDots/index.js';
export * from './components/Readout/index.js';
export * from './components/Knob/index.js';
export * from './components/GainSlider/index.js';
export * from './components/BandStrip/index.js';
export * from './components/AiAssist/index.js';
export * from './components/ContextMenu/index.js';
export * from './components/Annotations/index.js';
export * from './components/CurveCanvas/index.js';
export * from './components/SonodsEq/index.js';

/**
 * Non-React mount convenience function (Task 7.1-R)
 */
export function mount(
  container: HTMLElement,
  node: SonodsEqNode | null,
  options?: Partial<SonodsEqProps>
): { unmount: () => void } {
  const root = createRoot(container);
  root.render(React.createElement(SonodsEq, { node, ...options }));
  return {
    unmount: () => root.unmount(),
  };
}
