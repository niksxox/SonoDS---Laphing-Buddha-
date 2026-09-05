# Maintenance Rules for SonoDS Parametric EQ 2

If it works, do not touch it or break it. Any future UI adjustments or backend changes must never regress what has already been built and verified.

## Invariants:
1. Always run tests and static analysis (`pnpm test` and `pnpm -r exec tsc --noEmit`) before and after edits.
2. In CurveCanvas.tsx, keep the exact rendering sequence: Background/Grid -> Live Spectrum Analyzer -> Dark Response Curve -> Draggable Band Handles.
3. No allocations inside the AudioWorklet real-time audio loop.
4. Parameter smoothing (5ms exponential) must always be used for filter adjustments.
5. Channel strips must maintain flex sizing without overflow clipping to protect floating dropdowns.
