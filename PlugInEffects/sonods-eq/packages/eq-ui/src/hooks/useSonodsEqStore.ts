import { useSyncExternalStore } from 'react';
import { EqState, SonodsEqNode } from '@sonods/eq-engine';

const EMPTY_STATE: EqState = {
  bands: [],
  phaseMode: 0,
  sampleRate: 48000,
};

export function useSonodsEqStore(node: SonodsEqNode | null): EqState {
  return useSyncExternalStore(
    (callback) => {
      if (!node) return () => {};
      return node.onStateChange(callback);
    },
    () => (node ? node.getState() : EMPTY_STATE),
    () => EMPTY_STATE
  );
}
