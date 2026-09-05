// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSonoDSImager, SonoDSImagerPlugin } from '../src/plugin';

describe('Public Plugin API (Task 5.1)', () => {
  let plugin: SonoDSImagerPlugin;

  beforeEach(() => {
    plugin = createSonoDSImager();
  });

  it('mounts and unmounts custom element into DOM container', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    plugin.mount(container);
    expect(container.querySelector('sonods-imager')).not.toBeNull();

    plugin.unmount();
    expect(container.querySelector('sonods-imager')).toBeNull();
  });

  it('gets and updates plugin state via getState and setState', () => {
    const initialState = plugin.getState();
    expect(initialState.bypassed).toBe(false);
    expect(initialState.bandWidths[0]).toBe(0.0);

    plugin.setState({
      bypassed: true,
      bandWidths: [0.5, 1.2, 1.0, 1.0],
      stereoizeMode: 'mode_ii'
    });

    const updatedState = plugin.getState();
    expect(updatedState.bypassed).toBe(true);
    expect(updatedState.bandWidths[0]).toBe(0.5);
    expect(updatedState.stereoizeMode).toBe('mode_ii');
  });

  it('dispatches events to registered listeners via on() method', () => {
    const listener = vi.fn();
    const unsubscribe = plugin.on('state-change', listener);

    plugin.setState({ recoverSidesAmount: 0.6 });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();

    plugin.setState({ recoverSidesAmount: 0.8 });
    expect(listener).not.toHaveBeenCalled();
  });
});
