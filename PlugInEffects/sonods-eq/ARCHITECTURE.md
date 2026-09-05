# SonoDS Parametric EQ 2 — Technical Architecture & Implementation Deep Dive

> **Document Intention**: This document serves as the ground-truth technical specification, data-flow guide, and architectural reference for human software engineers and AI coding assistants maintaining, extending, or refactoring the SonoDS Parametric EQ 2 codebase.

---

## 1. System Architecture & Topology

```
+---------------------------------------------------------------------------------------+
|                                    BROWSER MAIN THREAD                                |
|                                                                                       |
|  +---------------------------------------------------------------------------------+  |
|  | React UI Layer (@sonods/eq-ui)                                                  |  |
|  |                                                                                 |  |
|  |  +---------------+  +--------------------------------+  +--------------------+  |  |
|  |  | Readout.tsx   |  | CurveCanvas.tsx (60 FPS Canvas)|  | BandStrip.tsx      |  |  |
|  |  | (Freq Readout)|  | - CurveRenderer.ts             |  | - GainSlider.tsx   |  |  |
|  |  +---------------+  | - AnalyserRenderer.ts          |  | - Knob.tsx         |  |  |
|  |                     +--------------------------------+  +--------------------+  |  |
|  +-----------------------------------------┬---------------------------------------+  |
|                                            │ State Updates & User Events              |
|                                            ▼                                          |
|  +---------------------------------------------------------------------------------+  |
|  | Engine Coordinator Layer (@sonods/eq-engine)                                    |  |
|  |                                                                                 |  |
|  |  SonodsEqNode (AudioNode Interface)                                             |  |
|  |  - Dual AnalyserNodes (Pre-EQ & Post-EQ 4096-bin FFTs)                          |  |
|  |  - Cached Response Curve Evaluator (512 log bins)                               |  |
|  |  - SessionRegistry (BroadcastChannel Spectral Conflict Bus)                     |  |
|  +-----------------------------------------┬---------------------------------------+  |
+--------------------------------------------│------------------------------------------+
                                             │ Lock-Free SharedArrayBuffer RingBuffer
                                             ▼
+---------------------------------------------------------------------------------------+
|                                 AUDIOWORKLET THREAD                                   |
|                                                                                       |
|  +---------------------------------------------------------------------------------+  |
|  | WASM AudioWorklet Processor (sonods_dsp_core.wasm)                              |  |
|  |                                                                                 |  |
|  |  1. Drain Command RingBuffer (Set Param / Add Band / Set Phase)                 |  |
|  |  2. Update Exponential Parameter Smoothers (5ms time constant)                  |  |
|  |  3. Compute Biquad DF2T Coefficients (Orfanidis / Butterworth)                  |  |
|  |  4. Execute Filter Cascade per Sample across Stereo Channels                    |  |
|  |  5. Apply Dynamic Gain Modulation (RMS Envelope Detector)                       |  |
|  +---------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------+
```

---

## 2. Package-by-Package Deep Dive

### Package 1: `packages/dsp-core` (Rust DSP Kernel)

#### Source Files:
- `src/lib.rs`: WASM bindings (`wasm-bindgen`), WebAssembly export interface, engine lifecycle management, and offline test harnesses.
- `src/biquad.rs`: Direct Form II Transposed (DF2T) biquad filter implementation. Supports 9 standard filter topologies.
- `src/cascade.rs`: Multi-stage filter cascade supporting butterworth high-order slope rolloffs (up to 96 dB/octave).
- `src/smoothing.rs`: Clickless per-sample exponential parameter smoothing.
- `src/dynamic_eq.rs`: RMS sidechain detector, threshold comparison, soft-knee gain computer, and envelope ballistics.
- `src/ring_buffer.rs`: Single-producer single-consumer (SPSC) lock-free atomic ring buffer for audio thread safe messaging.

#### Key Invariants:
1. **Zero Allocations in Real-Time Audio**: No allocations (`Vec::push`, `Box::new`, `String`) may take place inside the `process()` loop. All filters, buffers, and coefficient arrays are pre-allocated during initialization.
2. **Denormal Protection**: State variables $s_1$ and $s_2$ in the DF2T biquad are flushed to zero when $|s| < 10^{-15}$ to eliminate CPU performance penalties from subnormal floating-point operations.

---

### Package 2: `packages/eq-engine` (Web Audio Engine)

#### Source Files:
- `src/SonodsEqNode.ts`: Main TypeScript entry point extending standard Web Audio. Coordinates `AudioWorkletNode`, FFT analyzers, fallback messaging, and analytical curve evaluations.
- `src/wasmLoader.ts`: Safe browser & Node.js dual loader for the compiled WebAssembly binary.
- `src/types.ts`: TypeScript enums and interfaces (`Shape`, `CutSlope`, `PhaseMode`, `ParamId`, `BandState`, `EqState`).
- `src/ringBuffer.ts`: Main-thread JS side of the SharedArrayBuffer atomic ring buffer.

#### Key Invariants:
1. **Analytical Curve Caching**: `getResponseCurve()` must only re-evaluate polynomial curves when `curveDirty == true`. Once computed, the 512-point curve is cached in memory.
2. **Thread Fallback**: If `SharedArrayBuffer` is unavailable due to browser COOP/COEP headers, the engine automatically falls back to `workletNode.port.postMessage()` seamlessly.

---

### Package 3: `packages/eq-ui` (Visual Interface)

#### Source Files & Components:
- `src/components/SonodsEq/`:
  - `SonodsEq.tsx`: Master plugin chassis integrating header, spectrum visualizer, rack channel strips, AI explainability banner, and master controls.
  - `SonodsEq.module.css`: Light theme studio styling with 3px solid chassis border, rounded 24px corners, and responsive layout.
- `src/components/CurveCanvas/`:
  - `CurveCanvas.tsx`: High-performance 60 FPS Canvas animation loop.
  - `src/render/CurveRenderer.ts`: Canvas 2D curve and handle renderer with bezier path interpolation and hover states.
  - `src/render/AnalyserRenderer.ts`: Live FFT spectrum analyser renderer with separate pre-EQ and post-EQ attack/release ballistic smoothing.
- `src/components/BandStrip/`:
  - `BandStrip.tsx`: Individual channel strip containing numbered badge, shape dropdown selector, gain fader, and rotary knobs.
  - `BandStrip.module.css`: Card styling with hover highlights and elevated z-index dropdown positioning.
- `src/components/GainSlider/`:
  - `GainSlider.tsx`: Vertical gain fader with zero-dB center line, proportional fill, and drag precision.
- `src/components/Knob/`:
  - `Knob.tsx`: Rotary knob control with green fill and gold accent ring matching original design sketches.
- `src/components/AiAssist/`:
  - `AiAssist.tsx`: AI assistant preset picker with animated transition and acoustic explainability annotations.
- `src/coords.ts`:
  - Logarithmic frequency to canvas $X$ pixel coordinate transforms ($20\text{ Hz} \leftrightarrow 20\text{ kHz}$).
  - Decibel gain to canvas $Y$ pixel coordinate transforms ($-18\text{ dB} \leftrightarrow +18\text{ dB}$).

---

### Package 4: `apps/demo` (Interactive Verification Harness)

#### Source Files:
- `src/App.tsx`: Interactive demo harness with audio source generators (Kick Drum, Sub Bass, Synth Lead, Pink Noise), master volume control, A/B snapshot testing, bypass, and collision simulation.
- `src/audioHarness.ts`: Web Audio oscillator and buffer synthesizer creating realistic test signals.

---

## 3. Mathematical Reference

### Logarithmic Coordinate Transformations

To map a frequency $f \in [20, 20000]\text{ Hz}$ to a canvas horizontal pixel $x \in [0, W]$:

$$x = W \cdot \frac{\log_{10}(f) - \log_{10}(20)}{\log_{10}(20000) - \log_{10}(20)}$$

Inverse mapping from pixel $x$ back to frequency $f$:

$$f = 10^{\log_{10}(20) + \frac{x}{W} \left(\log_{10}(20000) - \log_{10}(20)\right)}$$

### Decibel to Canvas Vertical Coordinate Transformations

To map a gain $g \in [-18, +18]\text{ dB}$ to a canvas vertical pixel $y \in [0, H]$:

$$y = H \cdot \left(0.5 - \frac{g}{36}\right)$$

---

## 4. Maintenance & Extension Rules for Future AI Agents

1. **Do Not Touch Working DSP Math Without Unit Tests**: If modifying `biquad.rs` or `cascade.rs`, always run `cargo test --manifest-path packages/dsp-core/Cargo.toml` and `pnpm test` to prevent audio distortion or filter instability.
2. **Preserve Canvas Layering Order**:
   In `CurveCanvas.tsx`, background grid must be drawn first (`renderBackground()`), followed by the FFT spectrum traces (`analyserRenderer.render()`), followed by the composite transfer curve (`curveRenderer.render()`).
3. **Respect Parameter Limits**:
   - Frequency: $20\text{ Hz} \le f \le 20000\text{ Hz}$
   - Gain: $-18\text{ dB} \le g \le +18\text{ dB}$
   - Bandwidth / Q: $0.1 \le Q \le 10.0$
   - Number of Active Bands: 5 default bands (Max 5 in UI rack).
