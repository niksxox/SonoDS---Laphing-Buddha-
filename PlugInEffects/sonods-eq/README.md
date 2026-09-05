# SonoDS Parametric EQ 2 — Studio DSP & Web Audio Worklet

A broadcast-grade, high-performance parametric equalizer built from scratch using **Rust + WebAssembly** for zero-latency audio DSP and a **Modern React + Canvas** interface inspired by studio-standard hardware and parametric EQ architectures (FL Studio Parametric EQ 2, FabFilter Pro-Q).

---

## Architecture Overview

```
                          ┌────────────────────────────────────────────────────────┐
                          │                      Audio Input                       │
                          └──────────────────────────┬─────────────────────────────┘
                                                     │
                                                     ▼
                                          ┌────────────────────┐
                                          │   Pre-EQ Analyser  │ (4096-bin FFT)
                                          └──────────┬─────────┘
                                                     │
                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ AudioWorklet Thread / WASM DSP Engine (packages/dsp-core & packages/eq-engine)                   │
│                                                                                                  │
│  ┌───────────────────────────┐      ┌───────────────────────────┐      ┌──────────────────────┐  │
│  │ 5ms Exponential Smoother  │ ───► │  Biquad Cascade (DF2T)    │ ───► │ Dynamic Gain Comp    │  │
│  │ (Clickless Param Updates) │      │  Butterworth / Orfanidis  │      │ (RMS Sidechain / Env)│  │
│  └───────────────────────────┘      └───────────────────────────┘      └──────────────────────┘  │
│                                                                                                  │
│  Lock-Free Ring Buffer & SharedArrayBuffer (SAB) for Zero-Allocation Thread Communication        │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
                                          ┌────────────────────┐
                                          │   Post-EQ Analyser │ (4096-bin FFT)
                                          └──────────┬─────────┘
                                                     │
                                                     ▼
                          ┌────────────────────────────────────────────────────────┐
                          │                     Audio Output                       │
                          └────────────────────────────────────────────────────────┘
```

---

## Monorepo Package Structure

| Directory | Package Name | Description |
| :--- | :--- | :--- |
| `packages/dsp-core/` | `@sonods/dsp-core` | Rust DSP core compiled to WebAssembly via `wasm-pack`. Implements biquad filters, smoothing, dynamic EQ, and response curves. |
| `packages/eq-engine/` | `@sonods/eq-engine` | TypeScript Web Audio wrapper. Manages AudioWorklet nodes, fallback messages, FFT analysers, and state snapshots. |
| `packages/eq-ui/` | `@sonods/eq-ui` | React UI component library and framework-agnostic HTML5 Canvas renderers. |
| `apps/demo/` | `@sonods/demo` | Standalone Vite demo application with built-in audio synthesizer harness for live testing. |

---

## Core Technologies & Mathematical Models

### 1. Rust DSP Engine (`packages/dsp-core`)
- **Direct Form II Transposed (DF2T)**:
  $$y[n] = b_0 x[n] + s_1[n-1]$$
  $$s_1[n] = b_1 x[n] - a_1 y[n] + s_2[n-1]$$
  $$s_2[n] = b_2 x[n] - a_2 y[n]$$
  DF2T provides superior numerical stability in 32-bit floating point arithmetic and minimises quantization noise during filter coefficient modulation.
- **Orfanidis & Audio EQ Cookbook Biquads**:
  Implements 9 filter shapes: `Bell / Peak`, `LowShelf`, `HighShelf`, `LowCut / HighPass`, `HighCut / LowPass`, `Notch`, `BandPass`, `TiltShelf`, and `Allpass`.
- **Butterworth Slopes**:
  Supports 6 dB/oct, 12 dB/oct, 24 dB/oct, 48 dB/oct, and 96 dB/oct slopes using cascaded 2nd-order stages with critically damped $Q$ distributions:
  $$Q_k = \frac{1}{2 \cos\left(\frac{2k + 1 - N}{2N} \pi\right)}$$
- **Parameter Smoothing**:
  All frequency, gain, and bandwidth adjustments are smoothed per-sample using an exponential low-pass filter ($\tau = 5\text{ ms}$) to prevent clicks and zipper noise:
  $$\alpha = 1.0 - e^{-2\pi \cdot f_{\text{smooth}} / f_s}$$
- **Dynamic EQ Section**:
  RMS level detector with peak hold and variable threshold ($-60\text{ dB}$ to $0\text{ dB}$), ratio, and compression/expansion range ($-24\text{ dB}$ to $+24\text{ dB}$).
- **SharedArrayBuffer Lock-Free RingBuffer**:
  Real-time UI thread to AudioWorklet thread parameter synchronization with zero dynamic heap allocations in the audio thread render loop.

### 2. Audio Engine Integration (`packages/eq-engine`)
- **`SonodsEqNode`**:
  An `AudioNode`-compatible interface that initializes the WASM module in an `AudioWorkletProcessor`.
- **Dual FFT Analysers**:
  Dedicated 4096-point FFT `AnalyserNode` taps on input (pre-EQ) and output (post-EQ) running with custom ballistics ($0.8$ smoothing constant).
- **Analytical Curve Evaluator**:
  Evaluates $H(z)$ over 512 logarithmically spaced frequency bins ($20\text{ Hz}$ to $20\text{ kHz}$) using complex polynomial evaluation in Rust, cached until filter parameters are modified.

### 3. Visual Interface & Design System (`packages/eq-ui`)
- **Chassis Design**:
  Clean, high-contrast light studio theme with 3px solid borders, rounded 24px corners, and subtle studio lighting drop shadows.
- **Canvas Visualizer (`CurveCanvas.tsx` & `CurveRenderer.ts`)**:
  - **Render Pipeline**:
    1. `renderBackground()`: Renders crisp white surface and decibel / frequency grid ticks.
    2. `AnalyserRenderer`: Renders live smoothed pre-EQ (sky tint) and post-EQ (lime green tint) frequency spectrum traces.
    3. `CurveRenderer`: Renders solid `#18181B` composite transfer response curve and optional ghost curves.
    4. Draggable numbered band handles with hover/selection rings and mouse coordinate transforms ($x \leftrightarrow \log_{10}(f)$, $y \leftrightarrow \text{dB}$).
- **Vertical Channel Strips (`BandStrip.tsx`)**:
  - 5-band channel strip rack on the right chassis panel.
  - Numbered circular band badge with per-band colour accents.
  - Shape selector dropdown (`HP`, `LS`, `Peak`, `HS`, `LP`) with automatic gain-to-shelf switching.
  - Vertical `GainSlider` with center-zero detent and responsive thumb.
  - Rotary `Knob` components for Frequency ($20\text{ Hz} - 20\text{ kHz}$) and Bandwidth / Q factor ($0.1 - 10.0$).
- **Explainable AI Assist (`AiAssist.tsx`)**:
  Intelligent acoustic presets (Vocal Air, Kick Thump, Bass Clarity) that annotate EQ decisions directly on the frequency spectrum.
- **Master Bar**:
  Real-time CPU timing metrics, global Bypass toggle, and full plugin Reset button.

---

## Quick Start & Development Guide

### Prerequisites
- Node.js $\ge 18.0.0$
- `pnpm` $\ge 8.0.0$
- Rust toolchain with `wasm-pack` (`cargo install wasm-pack`)

### Installation & Build

```bash
# 1. Install all monorepo dependencies
pnpm install

# 2. Build the Rust WebAssembly core
pnpm --filter @sonods/dsp-core build

# 3. Build the engine and UI packages
pnpm --filter @sonods/eq-engine build
pnpm --filter @sonods/eq-ui build

# 4. Start the interactive demo app
pnpm --filter @sonods/demo dev
```

Visit **`http://localhost:3000`** in your browser to launch the plugin interface and audio harness.

---

## Running Test Suites

```bash
# Run all unit and integration tests across packages
pnpm test

# Test Rust DSP offline algorithms specifically
cargo test --manifest-path packages/dsp-core/Cargo.toml
```

---

## API Reference

### Initializing the Node

```typescript
import { SonodsEqNode, Shape, ParamId } from '@sonods/eq-engine';

const audioCtx = new AudioContext();
const eqNode = new SonodsEqNode(audioCtx);

await eqNode.whenReady();

// Add default 5 bands
eqNode.addBand(Shape.LowCut, 35, 0.0, 0.7);
eqNode.addBand(Shape.LowShelf, 120, 3.0, 0.8);
eqNode.addBand(Shape.Bell, 800, -2.5, 1.4);
eqNode.addBand(Shape.HighShelf, 6000, 2.5, 0.9);
eqNode.addBand(Shape.HighCut, 18000, 0.0, 0.7);

// Connect audio graph
sourceNode.connect(eqNode.inputNode);
eqNode.connect(audioCtx.destination);
```

### Rendering the React Component

```tsx
import React from 'react';
import { SonodsEq } from '@sonods/eq-ui';

export const MyAudioEditor = ({ eqNode }) => {
  return (
    <SonodsEq
      node={eqNode}
      trackName="Lead Vocal"
      showDevOverlay={true}
    />
  );
};
```

---

## Design Guidelines for Future AI Agents & Maintainers

1. **Audio Thread Safety**: Never allocate heap memory (`malloc`, `new Array`, `Vec::push`) inside the audio processing loop (`process()` in `dsp-core` or AudioWorklet). Use the pre-allocated fixed-size buffers and the lock-free ring buffer.
2. **Canvas Render Order**: In `CurveCanvas.tsx`, always maintain the layering order:
   `Background/Grid` $\rightarrow$ `Spectrum Analyser` $\rightarrow$ `Response Curves` $\rightarrow$ `Handles & Tooltips`.
3. **Coordinate Systems**: Use `coords.ts` mapping functions (`frequencyToX`, `xToFrequency`, `gainToY`, `yToGain`) for all spatial transformations between pixels and logarithmic audio units.
4. **State Immutability**: Use `eqNode.getState()` and `eqNode.setState()` for preset management and A/B snapshot comparisons.

---

## License

Proprietary — SonoDS Studio DSP Audio Systems.
