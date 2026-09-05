import { describe, it, expect } from 'vitest';
import { UI_VERSION } from '../src/index';

describe('Imager UI Package (Phase 3/4)', () => {
  it('exports UI version string', () => {
    expect(UI_VERSION).toBe('0.1.0');
  });
});
