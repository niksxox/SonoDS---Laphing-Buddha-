# Engineering Rules and Architectural Invariants for SonoDS Parametric EQ 2

## Golden Rule
If a system, algorithm, component, or layout is working correctly and verified by tests, do not rewrite, redesign, or touch it without explicit justification and confirmation. Any future UI changes or backend fixes must strictly preserve and never regress the existing working state.

---

## 1. Zero-Regression Policy
- Before modifying any file, run `pnpm test` and `pnpm -r exec tsc --noEmit` to verify baseline integrity.
- After making any changes, you must immediately verify that:
  1. `cargo test --manifest-path packages/dsp-core/Cargo.toml` passes (13/13 tests).
  2. `pnpm test` passes across all packages (6/6 tests).
  3. `pnpm -r exec tsc --noEmit` succeeds with zero TypeScript errors.
  4. The UI layout, spectrum analyzer, and audio pipeline continue to function without visual or acoustic degradation.

---

## 2. DSP and Audio Core Constraints (`packages/dsp-core` & `packages/eq-engine`)
- Real-time Audio Safety: Zero dynamic heap allocations (`malloc`, `new Array`, `Vec::push`, `Box::new`) inside the audio processing loop (`process()`).
- Numerical Stability: State variables in Direct Form II Transposed (`DF2T`) biquad filters must flush subnormal/denormal numbers to zero (`< 1e-15`).
- Clickless Parameter Modulation: Never apply raw instantaneous jumps to filter frequencies, gains, or Q factors. All modulation must go through the 5ms exponential parameter smoother.
- Filter Math Integrity: Do not modify biquad coefficient calculations (`biquad.rs`), Butterworth cascade distribution formulas (`cascade.rs`), or RMS envelope detection without passing all mathematical regression tests.

---

## 3. UI and Canvas Rendering Invariants (`packages/eq-ui`)
- Canvas Render Order in `CurveCanvas.tsx`:
  Layer 1 (Bottom): `curveRenderer.renderBackground()` - Clears canvas to white and draws frequency/decibel grid ticks.
  Layer 2: `analyserRenderer.render()` - Draws real-time FFT spectrum curves with attack/release smoothing.
  Layer 3: `curveRenderer.render()` - Draws the solid dark composite transfer curve (`#18181B`) and optional ghost curves.
  Layer 4 (Top): Draggable band handles with selection outlines and tooltips.
- Do not add `clearRect` or background fills inside `CurveRenderer.render()` as this will erase the live spectrum analyzer underneath.
- Coordinate Mapping: All pixel-to-audio coordinate conversions must strictly use the standard logarithmic equations in `coords.ts`.

---

## 4. Layout and Style Guidelines
- Light Studio Aesthetic: White chassis background, solid dark 3px border, 24px corner radius, and subtle drop shadows.
- Visual Separation: The right-hand rack panel uses a distinct `#E8E8EC` surface with a 2px left border.
- Channel Strips: Maximum of 5 active bands. Strips must use flex sizing (`flex: 1 1 0; min-width: 0; max-width: 58px;`) to prevent clipping.
- Floating Popups: Keep `overflow: visible` on channel strips and rack panels so shape dropdowns and tooltips float above with elevated z-index without being clipped.

---

## 5. State Management and Inter-Track Protocol
- Preset and Snapshot Safety: Always use deep-cloned immutable states when capturing or restoring A/B snapshots via `node.getState()` and `node.setState()`.
- Reset Action: The `Reset` button must restore the pristine 5-band default configuration, clear annotations, reset bypass, and reset selection.
