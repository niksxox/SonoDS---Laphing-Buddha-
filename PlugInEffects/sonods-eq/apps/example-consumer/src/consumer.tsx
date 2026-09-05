import React from 'react';
import { createRoot } from 'react-dom/client';
import { SonodsEqNode } from '@sonods/eq-engine';
import { SonodsEq, mount } from '@sonods/eq-ui';

// 1. React Consumer Pattern
export const ReactHostApp: React.FC<{ node: SonodsEqNode }> = ({ node }) => {
  return (
    <div style={{ width: '900px', height: '500px', padding: '20px' }}>
      <SonodsEq node={node} trackName="Host Vocal Track" />
    </div>
  );
};

// 2. Non-React Imperative Consumer Pattern (Task 7.1)
export function mountVanillaHost(container: HTMLElement, audioCtx: AudioContext) {
  const eqNode = new SonodsEqNode(audioCtx);
  return mount(container, eqNode, {
    trackName: 'Vanilla Host Track',
    showDevOverlay: true,
  });
}
