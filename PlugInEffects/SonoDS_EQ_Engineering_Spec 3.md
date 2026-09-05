# SonoDS Studio EQ — Engineering Specification v1.0
**Prepared by: CTO Office | Audience: Engineering (DSP, Graphics/UI, QA) | Status: Build Authorization**

---

## 0. Read This First — Working Assumptions (Revised)

**Architecture decision, locked in as of this revision:** SonoDS EQ ships first as a **web application**, built as a **standalone, reusable, framework-agnostic module** — not as code embedded directly inside "the SonoDS app." Every future SonoDS surface (and any other web app we build) drops in the same EQ module the same way a DAW drops in a VST. A native VST3/AU build is a planned second target, not this phase's job — but we do not get to treat that as "someone else's problem later." The single most important architectural decision in this document is this:

> **We write the actual DSP math (filters, smoothing, dynamic EQ, analysis) once, in a portable, allocation-free core (C++ or Rust), compiled to WebAssembly for the web product today and compiled natively into a JUCE plugin later — from the identical source.** The UI, the Web Audio glue, and the plugin-host glue are different per platform. The DSP core is not. Get this separation right in Phase 1 and the eventual VST becomes a wrapper-writing exercise, not a rewrite. Get it wrong (e.g., write the DSP directly in JS/TS "for now") and the VST becomes a second full DSP implementation to maintain and keep bit-compatible forever — we are explicitly not doing that.

This changes the concrete technology choices in the phases below (Web Audio `AudioWorklet` instead of a native audio callback thread, Canvas/WebGL instead of Direct2D/Metal, npm package distribution instead of VST3/AU packaging) but **does not change any of the quality bars, math, smoothing rules, or phase structure** established in this document — a click-free filter and a liquid-smooth UI are exactly as mandatory in a browser tab as in a DAW plugin window. Anywhere below still reads "audio thread" — read that as "the AudioWorklet's dedicated rendering thread," which gives us the same real-time-safety guarantees (isolated from the main/UI thread, run by the browser's audio engine) as a native audio callback does.

Everything below assumes this is one component (the EQ) inside a larger mixing/mastering AI product. This spec covers the EQ module only, but Phase 5 assumes the EQ has access to session-level data (other tracks' spectra) — that dependency is called out explicitly where it matters.

**Design reference note**: the original hand-drawn UI sketch (rounded window, single response curve, traffic-light status dots, three bottom circular mode buttons) will be distributed directly to the design and engineering team as the authoritative visual/vibe reference for Phase 3 — see the correction and instruction at the top of §3.2 before implementing any visual element.

---

## 1. What We Are Building — Executive Summary

**SonoDS EQ** is a parametric equalizer that must feel and perform at the level of FabFilter Pro-Q 4 — the current industry benchmark — while presenting a radically simpler, more minimal interface than any competitor on the market, and while offering one capability none of them have: **awareness of the rest of the mix**.

In one sentence: **a beginner can get a professional EQ curve in under 30 seconds by dragging on a glowing line, while a professional gets surgical dynamic and multiband control one layer deeper, and the whole thing is the only EQ on the market that tells you when you're fighting your own mix.**

Three pillars, non-negotiable:

1. **Sonic quality**: transparent, high-precision, multiple phase-response modes, no audible artifacts at any setting.
2. **Feel**: every interaction — dragging a band, typing a value, opening a menu — must complete in a single visual frame with no perceptible lag, no zipper noise, no dropped frames.
3. **Intelligence**: the EQ must be able to reason about frequency conflicts across the session and explain its own suggestions in plain language, because our audience skews toward less experienced producers who need to learn, not just execute.

We are not building 24 exotic filter shapes or Dolby Atmos surround support in v1. We are building 8–10 things done at a reference-quality bar. Depth comes from precision of execution, not breadth of feature count.

---

## 2. Non-Negotiable Quality Bar (applies to every phase)

Every engineer on this project should treat the following as acceptance gates, not aspirations:

| Requirement | Target | How we verify it |
|---|---|---|
| Audio thread never allocates, locks, or blocks | Zero heap allocations, zero mutexes in `processBlock` | Static analysis + real-time-safety unit test harness (see Phase 1.6) |
| Parameter change → audible change, click-free | No zipper noise/clicks on any parameter at any automation rate | Null-test against reference smoothed output; ear + spectrogram review |
| UI interaction → visual response | ≤ 1 frame at 60fps (16.6ms), target ≤ 8ms | Frame-timing instrumentation, see Phase 2.5 |
| Filter frequency response accuracy | Within 0.1 dB of theoretical target at all Q/gain combinations | Automated sweep test vs. analytic transfer function |
| CPU usage, 10-band stereo instance | < 1.5% of one core on a 2020-class CPU (zero latency mode) | Benchmark harness, Phase 6.1 |
| Total harmonic distortion added by "clean" EQ path | < -100 dBFS at unity gain | THD+N automated test |
| Crash-free hours in fuzz/automation testing | > 500 hours before any release candidate | Automated DAW-simulation fuzzer |

If a feature cannot meet these, it does not ship in that form — we descope or redesign, we do not lower the bar.

---

## PHASE 1 — Foundation: The DSP Core

### 1.0 Phase Goal (short version)

Build the mathematically correct, real-time-safe, inaudibly-artifact-free filter engine that every later phase sits on top of. At the end of Phase 1, we have **no UI at all** — just a processing core that can be driven by unit tests and a debug console, proven correct against reference transfer functions, proven glitch-free under parameter automation, and proven cheap enough on CPU to support 10+ simultaneous bands.

If Phase 1 has a bug, every later phase inherits it. This phase gets the most review rigor of the entire project.

### 1.1 Filter Types (v1 scope — exactly these, nothing more)

| Shape | Use case | Slope options |
|---|---|---|
| Bell (peak/notch) | General tonal shaping | Continuous Q, 0.1–40 |
| Low Shelf | Bass/low-end tilt | Continuous Q (analog-style shelf slope) |
| High Shelf | Air/brightness tilt | Continuous Q |
| Low Cut (High Pass) | Rumble/mud removal | 6, 12, 24, 48 dB/oct, plus a "steep" 96 dB/oct option |
| High Cut (Low Pass) | De-essing/harshness removal | 6, 12, 24, 48 dB/oct, plus "steep" 96 dB/oct |

Explicitly out of scope for v1: notch/band-pass/tilt-shelf/flat-tilt/all-pass shapes. These are Pro-Q's "completionist" shapes aimed at power users; our minimalism thesis says we ship the 5 shapes that cover ~95% of real mixing decisions and add the rest only if user data tells us to.

### 1.2 Filter Math — Minimum Phase (Zero Latency) Mode, Default

Implement using the **Robert Bristow-Johnson (RBJ) Audio EQ Cookbook biquad formulas** — this is the industry-standard, well-vetted starting point (FabFilter, Ableton, and most DAW-stock EQs derive from the same family, though the highest-end products refine coefficient precision and add analog-modeled nonlinearity on top; we do the former in v1, and defer analog modeling to a later "Character" mode).

For each band, compute standard biquad coefficients (`b0,b1,b2,a0,a1,a2`) per shape:

- **Bell**: intermediate variable `A = 10^(gainDB/40)`, `alpha = sin(w0)/(2*Q)`. Standard peaking-EQ cookbook formula.
- **Shelf**: use the cookbook's shelving formulas with the `S` (shelf slope) parameter mapped from our UI's Q control so that Q=0.5 → gentle analog-style shelf, Q=2+ → steep/surgical shelf. This mapping is a product decision the DSP and UI leads must agree on together and document in the shared constants file — do not let each team invent its own mapping.
- **Cuts**: standard Butterworth-derived high-pass/low-pass cascades. For 12dB/oct, one biquad section; for 24, two sections in series; for 48, four sections; for the 96dB "steep" option, eight sections. Cascade multiple 2nd-order sections rather than trying to hand-derive a single higher-order transfer function — it's numerically safer and each section can be independently coefficient-smoothed.

**Precision requirement:** coefficients and the state variables (`z1, z2` in Direct Form II Transposed) must be computed and stored in **double precision (64-bit float)** internally, even though the audio samples flowing through can remain 32-bit float. This single decision prevents the coefficient-quantization artifacts that make cheap EQs sound "grainy" when Q is high or when many bands stack — do not let this get "optimized away" later for a marginal CPU win.

**Topology:** Direct Form II Transposed per biquad section. It is the standard for numerical stability with time-varying coefficients (i.e., when the user is dragging a knob), which matters more to us than the raw multiply-count.

### 1.3 Parameter Smoothing — This Is Where "Feel" Actually Lives

This is the single most important subsection in the entire document. A SOTA-feeling EQ and a mediocre one usually run *the same filter math* — the difference is entirely in how parameter changes are applied over time.

Rules, all mandatory:

1. **Never recompute-and-snap coefficients directly from a raw UI value on every audio block.** Instead, every user-facing parameter (frequency, gain, Q, band on/off) has a **smoothed shadow value** that ramps toward the UI target over a fixed time constant.
2. Recommended ramp times (tune by ear during Phase 1.7, but start here):
   - Gain: 15ms exponential smoothing
   - Frequency: 20ms (frequency changes are the most prone to audible "zipper"/warble if snapped)
   - Q: 20ms
   - Band bypass (on/off): 5ms linear fade to avoid a hard click, not a coefficient snap
3. Recompute actual biquad coefficients from the smoothed values **once per audio block** (not once per sample — that's wasteful; block-rate coefficient updates at typical buffer sizes of 64–512 samples are inaudible when combined with per-sample smoothing of the *signal* itself where needed).
4. For extremely fast automation or MIDI-mapped real-time control, add a secondary safety smoother with a shorter time constant (~3ms) purely to prevent zipper artifacts from stair-stepped automation data, independent of the UI-drag smoother above.

**Definition of done for this subsection:** an engineer can automate any parameter at DAW-max speed (fast LFO into a parameter) and there must be no audible clicking, zippering, or aliasing artifact in the output — verified by spectrogram review, not just "it sounds fine to me."

### 1.4 Signal Chain & Threading Architecture (Web Audio / AudioWorklet)

- **DSP core language and build target**: the filter engine, smoothing system, and dynamic-EQ logic are written in **C++ (or Rust — pick one and standardize across the team; do not mix)**, with zero dependency on any browser or JS API inside the core itself. This core is compiled to **WebAssembly via Emscripten (C++) or wasm-pack (Rust)** for the web build. Writing it this way, with no web-specific code inside the math itself, is what makes the later native VST build a matter of compiling the same source with JUCE's build system rather than porting logic.
- **Audio rendering thread**: implemented as an `AudioWorkletProcessor`, which the browser already runs on its own dedicated, high-priority audio rendering thread, isolated from the main UI thread — this gives us the same fundamental guarantee a native audio callback thread gives us. The compiled WASM module is instantiated **inside** the AudioWorklet's global scope (this requires the WASM binary to be loaded and instantiated specifically within the worklet, which has a restricted global scope — this is a common early stumbling block and should be validated with a hello-world spike before real DSP code is written). **This thread must never allocate memory during `process()`, never block, never call back to the main thread synchronously** — identical rules to the native version of this document, just enforced by discipline rather than an OS scheduler.
- **Main/UI thread**: owns the "true" UI-facing parameter values (band frequency, gain, Q, etc.) and all rendering (Phase 2/3). Communicates with the AudioWorklet **not** via `postMessage` for per-parameter updates (too slow/GC-heavy for anything time-sensitive) but via a **`SharedArrayBuffer` + `Atomics`**-backed lock-free structure: a fixed-layout array of parameter slots the main thread writes to and the worklet reads from every block, mirroring the atomic-scalar approach described for native builds. Note: `SharedArrayBuffer` requires the page to be served with COOP/COEP cross-origin-isolation headers — confirm this is compatible with however the broader SonoDS web app is hosted/embedded (including if it's ever embedded via iframe in a third-party page) before this is load-bearing; if cross-origin isolation turns out to be impractical in some embedding context, the fallback is a `postMessage`-based ring buffer with slightly higher (but still sub-frame) latency, which must be benchmarked, not assumed acceptable.
- **Structural changes** (adding/removing a band, changing shape) go through a small **lock-free SPSC ring buffer**, same design as the native version, laid out inside the shared buffer — the worklet applies queued structural commands only at the start of a `process()` call, never mid-block.
- **Double-buffering the band list** inside the WASM core: identical to the native design — structural edits are built on an inactive copy and atomically swapped in, so `process()` is never reading a half-modified list.
- **Analysis/FFT work** (Phase 2) should run either inside the same worklet (if budget allows) or, more likely, be shipped as smoothed summary data from the worklet to a regular Web Worker (not the main thread) for FFT and any heavier analysis, keeping the main thread free for rendering exactly as described in Phase 2's original design — the only change from the native version is "dedicated analysis thread" becomes "dedicated Web Worker."

### 1.5 Dynamic Range / Numerical Safety

- Denormal protection: flush denormals to zero (FTZ/DAZ CPU flags enabled on the audio thread, or an explicit tiny-DC-offset/noise-floor technique) — unprotected denormals are a classic, silent cause of CPU spikes that show up as random crackling under specific silence conditions. This must be tested explicitly with a "silence for 30 seconds then transient" test case.
- Internal headroom: allow internal processing to exceed 0dBFS without hard clipping (we are a linear EQ, not a saturator, in v1) — only clip/limit at the final output stage if the user has pushed gains extremely high, and make that behavior explicit and documented, not a silent surprise.

### 1.6 Testing Infrastructure to Build *Alongside* the Engine (not after)

- **Analytic transfer function test**: for every filter shape/Q/gain/frequency combination in a defined grid, generate the theoretical magnitude/phase response from the math and assert our actual FFT-measured output matches within 0.1dB / 1 degree.
- **Null test harness**: freeze a "golden" reference render for a complex automation pass (many parameters moving); every future code change must null against this reference within a defined noise floor, or the diff must be explained and re-approved — this is our primary regression-catcher for the entire life of the product.
- **Real-time-safety linter**: a custom static-analysis pass (or a runtime instrumentation build) that fails CI if the audio thread's call graph touches `malloc`, `new`, mutex primitives, or other blacklisted calls. For the WASM build specifically, also verify no calls into JS glue code occur inside `process()` (a JS↔WASM boundary crossing inside the audio callback is a common, easy-to-miss source of dropped audio frames in browsers).
- **Dual-target build verification**: since the same C++/Rust source compiles to both WASM (today) and, later, native (VST), set up the native build target now — even with no plugin UI — purely as a compile-and-unit-test target in CI, so we catch any accidental web-only assumption creeping into the "portable" core the day it's introduced, not a year from now when the VST work actually starts.
- **THD+N automated measurement**: sine sweep through the "flat" EQ (all bands at 0dB) and confirm added distortion is below -100dBFS.

### 1.7 Phase 1 Deliverables (Definition of Done)

- [ ] Biquad engine for all 5 shapes, double-precision coefficients, Direct Form II Transposed
- [ ] Full parameter smoothing system per §1.3
- [ ] Lock-free parameter + structural command architecture per §1.4
- [ ] Denormal protection verified under silence-then-transient test
- [ ] Full analytic transfer function test suite passing
- [ ] Null-test golden reference established and checked into CI
- [ ] Real-time-safety linter integrated into CI and passing
- [ ] CPU benchmark: 10-band stereo instance at < 1.5% of one 2020-class CPU core (measured in-browser via the WASM build, not just a native test binary — browser JIT/WASM performance is not identical to native and must be measured where it actually runs)
- [ ] Command-line/headless debug harness that can load an audio file, apply a defined EQ curve, and render output — this is how QA and DSP will validate everything before any UI exists
- [ ] DSP core builds cleanly as both a WASM module (Emscripten/wasm-pack) and a native static library target in CI, from the same unmodified source tree

---

## PHASE 2 — The Real-Time Visualization Engine

### 2.0 Phase Goal (short version)

Before we build a single pixel of "the design," we build the **rendering pipeline** that will drive it: a GPU-accelerated curve renderer and a real-time spectrum analyzer, both running independently of the audio thread, both hitting 60fps minimum (120fps on capable displays) with zero stutter. This phase produces a blank-but-functioning canvas: a live analyzer and a live response curve, no interactivity yet.

### 2.1 Data Flow: Audio Thread → Visualization

- The audio thread, at the end of each processing block, pushes lightweight summary data (block RMS/peak per FFT bin bucket, or raw samples into a lock-free ring buffer for the analyzer to FFT later) — **it never does the FFT itself**. FFT and any heavier math for visualization happens on a **dedicated analysis thread**, separate from both the audio thread and the UI/render thread.
- Analysis thread: consumes the ring buffer, runs windowed FFT (recommend 4096-point with 75% overlap and a Hann or Blackman-Harris window for a good resolution/smoothness tradeoff), produces smoothed per-bin magnitude data at a fixed refresh rate (30Hz analysis update is plenty; the *rendering* can interpolate this up to 60/120fps so motion still looks fluid between analysis updates).
- UI/render thread: reads the latest analysis snapshot (again via lock-free double-buffering, never a lock) and the current EQ curve parameters, and draws.

### 2.2 The Response Curve — Rendering Requirements

- The curve is **not** drawn by evaluating the filter's magnitude response at every pixel column naively on the CPU every frame if that's expensive — precompute the combined magnitude response at a fixed resolution (e.g. 512–1024 frequency points, log-spaced to match the x-axis) whenever parameters change, then let the GPU interpolate/rasterize the path every frame. Recompute the 512-point response only when a parameter actually changes, not unconditionally every frame.
- Render the curve as a smooth vector path (cubic Bezier or Catmull-Rom interpolation between the computed points), not a jagged polyline — this is a large part of "premium feel."
- Apply the soft outer glow specified in the design (§ Phase 3) as a GPU shader effect (blur/bloom), not as a pre-rasterized bitmap, so it scales cleanly at any window size/DPI.
- Individual band contributions can optionally be shown as faint "ghost" curves under the combined curve when a band is selected — helps users (especially beginners) understand what each band is doing. This is cheap once the per-band magnitude arrays already exist from the combined computation.

### 2.3 The Spectrum Analyzer — Rendering Requirements

- Pre-EQ and Post-EQ traces, togglable, rendered as filled/translucent areas behind the curve (matching the soft aesthetic of the sketch) rather than the harsh line-only analyzers common in older plugins.
- Smoothing: apply exponential smoothing (separate attack/release-style time constants, e.g. faster rise, slower fall — like a VU meter) to the analyzer trace so it doesn't flicker distractingly; this is a UX decision as much as a technical one and should be tuned by ear/eye alongside a mix engineer, not just implemented to a formula and shipped.
- Frequency axis: logarithmic, 20Hz–20kHz. Amplitude axis: selectable range presets (e.g., a tight ±6dB "mastering" range and a wider ±24dB "mixing" range) — mirrors an approach the reference product (Pro-Q) also offers, because it's genuinely useful, not because we're copying for its own sake.

### 2.4 Web Rendering Approach

- Render target: **WebGL (via a lightweight direct WebGL setup, or a thin library like PixiJS/regl if it earns its weight — do not reach for a heavy general-purpose 2D framework here)** for the curve, glow, and analyzer fill, since these need per-frame path/shader rendering at 60–120fps. Plain 2D Canvas is acceptable as a fallback/simpler starting implementation in an early prototype, but the glow shader and smooth high-DPI curve rendering called for in §2.2/§3.2 are meaningfully better and cheaper on WebGL — plan to land there, not stay on 2D Canvas as the final answer.
- Run rendering on an **`OffscreenCanvas`** inside a dedicated Web Worker where browser support allows, so heavy drawing never contends with the main thread's other responsibilities (input handling, layout) — fall back to main-thread `requestAnimationFrame` rendering on browsers without `OffscreenCanvas` transfer support, but treat that as the fallback path, not the primary design target.
- All drawing must be **retained where possible**: cache static elements (grid lines, axis labels) as pre-rendered textures/layers and only redraw what actually changed (curve shape, analyzer trace, drag handles) each frame — full-scene redraws every frame at high DPI (`devicePixelRatio` > 1, which is most modern laptops/monitors) are a common, avoidable cause of "laggy-feeling" web UIs, exactly as with native plugin UIs.
- Respect `devicePixelRatio` explicitly in the canvas backing-store size (not just CSS size) or the entire "premium, crisp" visual quality goal from Phase 3 is undermined by blurry rendering on any high-DPI display — this is an easy thing to get subtly wrong and must be part of code review checklist, not just a one-time setup detail.

### 2.5 Performance Instrumentation (build this now, not later)

- Frame-timing overlay (debug-build only) showing current FPS and per-frame CPU time breakdown (analyzer FFT, curve recompute, GPU draw) so every engineer can see immediately if a change regresses frame time.
- Automated frame-time regression test: run a scripted sequence of parameter automation + window resize + band drag simulation, assert p99 frame time stays under budget (8.3ms for 120fps target, hard ceiling 16.6ms for 60fps).

### 2.6 Phase 2 Deliverables (Definition of Done)

- [ ] Lock-free audio-thread → analysis-thread → render-thread data pipeline implemented and proven glitch-free
- [ ] FFT-based analyzer with configurable window/overlap, smoothed Pre/Post traces
- [ ] Combined + per-band response curve computation, recomputed only on parameter change
- [ ] GPU-accelerated, vector-path curve rendering with glow shader
- [ ] Retained-mode rendering for static elements (grid, labels) — *note: per the design correction in §3.2, "grid" here should read as background/chrome/labels only; no visible grid lines in the final design*
- [ ] Frame-timing instrumentation and automated regression test in CI
- [ ] Demonstrable blank canvas: live analyzer + live curve responding to a debug parameter feed, 120fps sustained on target hardware, no interactivity yet

---

## PHASE 3 — Interaction Model & Visual Design Implementation

### 3.0 Phase Goal (short version)

Now we build the actual product surface from the sketch: click-and-drag band creation directly on the curve, the soft rounded window chrome, the traffic-light system status dots, the glowing band handles, the bottom mode-pill buttons, and the monospace numeric readouts. This phase turns Phase 1+2's engine into the thing a producer actually touches.

### 3.1 Interaction Model — Exact Gesture Spec

This must be written down precisely so there is zero ambiguity between design and engineering:

| Gesture | Result |
|---|---|
| Click empty space on the curve | Create a new Bell band at that frequency/gain, band becomes selected |
| Click-drag an existing band handle | Move frequency (x-axis) and gain (y-axis) simultaneously, live-updating the curve and audio in real time |
| Scroll wheel over a selected band handle | Adjust Q (scroll up = narrower, down = wider), with the numeric Q readout updating live |
| Shift + drag | Constrain movement to gain-only (vertical) or frequency-only (horizontal) — engineering must pick and document one modifier convention and apply it consistently |
| Double-click a band handle | Reset that band to a neutral default (0dB gain, default Q) — not delete |
| Right-click / long-press a band handle | Context menu: shape switch (Bell/Shelf/Cut), delete, solo, enable dynamic (Phase 4) |
| Double-click empty space near a numeric readout | Enter direct text-entry mode for exact value input (matches the "monospace numeric readout" design language and Pro-Q's proven pattern of allowing precise typed values, not just mouse drag) |
| Drag a band handle off the top/bottom of the visible range | Clamp gain to the display's max/min range but keep the underlying value draggable back in — never let a value become inaccessible |

### 3.2 Visual Design System — Codify the Sketch into Specs

> **CORRECTION TO THIS SECTION — READ BEFORE IMPLEMENTING.** The original hand-drawn UI reference image (the rounded-window sketch with the curve, traffic-light dots, and three bottom circular buttons) is the **authoritative design reference** for this entire phase and will be shared directly with the design/engineering team as-is — implement against that image, not just the prose description below. One correction to the prose below: the faint grid visible in that sketch is **not** an intentional design element — it was the default canvas background of the app the sketch was drawn in, and should **not** be treated as a spec requirement. **The EQ display background is a clean, ungridded surface** (a plain or very subtly gradient-shaded background consistent with the "soft, premium, minimalistic" direction), not a grid of horizontal/vertical reference lines. Wherever "Grid" is mentioned below and elsewhere in this document as a rendered UI element, treat that as superseded by this correction — do not implement a visible grid unless a future revision of this spec explicitly reinstates one.


- **Color**: single accent (the green from the sketch) used for: the curve line + its glow, band handle fill/ring, the bottom mode-pill active state, and the on-curve drag cursor. Red and amber are reserved exclusively for system/status chrome (matching the sketch's traffic-light dots) and must never appear as a functional EQ color, to avoid the beginner-facing confusion of "is this a warning or just a color."
- **Curve**: rendered at ~2–3px logical weight with a soft outer glow (~8–12px blur radius at 100% UI scale, must scale proportionally with the window/DPI).
- **Grid**: ~~single hairline weight, low opacity (~8–12% of full white/black depending on theme), never competing visually with the curve or analyzer fill.~~ **SUPERSEDED per the correction above — no grid element in the design.** Background is a clean, ungridded surface; do not implement grid lines. (Original bullet left in place for traceability, not as an instruction to build.)
- **Band handles**: soft filled circles with a lighter ring, exactly matching the visual language already present in the sketch's three bottom icons — reuse that same component definition for both the bottom mode buttons and the on-curve handles so the design system is internally consistent, not two different circle styles invented separately.
- **Typography**: tabular/monospace figures for every numeric readout (Hz, dB, Q, %) so widths never jitter mid-drag; a humanist sans for labels/menus.
- **Window chrome**: rounded-rect frame per the sketch, traffic-light status dots reserved for actual system status (e.g., green = processing normally, amber = CPU load warning, red = error/overload) rather than purely decorative — giving them real meaning is a small touch that reinforces "premium and considered," not a random borrowed macOS convention.
- **Bottom mode pills**: the sole mechanism for switching analyzer/EQ display modes (e.g., "Curve," "Dynamic," "Match" — to be finalized with product) — no additional tab bars, no hamburger menus, reinforcing the one-canvas minimalist identity.

### 3.3 Accessibility & Precision Controls (do not skip)

- Full keyboard control: selected band adjustable via arrow keys (fine steps) and shift+arrow (coarse steps), Tab to cycle band selection.
- All colors must pass WCAG-reasonable contrast for the readouts/text even though the curve/glow is stylistic.
- Every draggable value must also be reachable via typed numeric entry (per §3.1) — mouse-only precision is not acceptable for a mixing tool used by professionals doing surgical work.

### 3.4 Reusable Module Architecture — Build It As a Package, Not a Page

This is a direct requirement from product, not an engineering nice-to-have, and it affects how Phases 1–3 get organized in the codebase, so it belongs here explicitly rather than being assumed:

- **The EQ ships as a self-contained, framework-agnostic package** (its own repo or a clearly isolated package in a monorepo, versioned independently, e.g. `@sonods/eq-core` for the WASM DSP + state logic and `@sonods/eq-ui` for the rendering/interaction layer) — not as code written directly inside "the SonoDS app's" codebase. Any future SonoDS web surface, and any other web app we build later, installs and mounts this package rather than re-implementing or copy-pasting it.
- **Public API surface must be intentionally small and stable**, roughly: mount the UI into a given container element/component, pass it an audio node to connect into the host app's Web Audio graph, expose a clean get/set state API (band list, parameters) for the host app to save/load presets or drive the EQ programmatically, and expose events/callbacks for state changes (so a host app's own AI logic — e.g., Phase 5's suggestions — can react to user edits). Treat this API contract with the same rigor as a public library used by external developers, even though today the only consumer is our own future apps.
- **Framework-agnostic core, thin framework wrapper**: build the actual UI/interaction logic (Phases 2–3) in a way that does not hard-depend on React/Vue/etc. (e.g., vanilla TS + Web Components, or a framework-agnostic core with a thin optional React wrapper) so it can be dropped into whatever the next SonoDS surface happens to be built in without a rewrite — we do not know today what every future host app's stack will be, so the EQ module should not bet on one.
- **No global state, no singleton assumptions**: the module must support multiple simultaneous instances on one page (one EQ per track, in a multi-track mixing view) cleanly — this directly matters for Phase 5's cross-track awareness, which requires many EQ instances to coexist and communicate via the session registry, not a single hardcoded instance.
- **Path to native VST reuse**: because the DSP core (§1.4) is already isolated, portable C++/Rust, this package's web-specific layers (AudioWorklet glue, WebGL rendering, DOM interaction) are exactly the parts that get *replaced*, not reused, when we eventually build the VST — the UI/interaction *design* (Phase 3's gesture spec and visual system) should still be reimplemented faithfully in the native UI toolkit (e.g., JUCE's component system) for brand consistency, but that is native UI engineering work at that future point, not something this phase needs to solve now. Flag this expectation to whoever leads the eventual VST effort so it isn't a surprise.

### 3.5 Phase 3 Deliverables (Definition of Done)

- [ ] Full gesture set from §3.1 implemented and feeling "liquid" at the frame-time budget set in Phase 2.5
- [ ] Complete visual design system componentized (handles, curve, chrome, pills, typography) matching the approved sketch — **no grid element** (see correction note in §3.2)
- [ ] Keyboard/precision-entry accessibility complete
- [ ] Usability pass with at least 3 external test users (mix of "beginner producer" and "experienced engineer" personas) with zero unresolved "this feels laggy/confusing" reports before sign-off

---

## PHASE 4 — Advanced Processing: Linear Phase, Natural Phase, Dynamic EQ, Mid/Side

### 4.0 Phase Goal (short version)

This phase adds the "one layer deeper" professional depth: alternate phase-response modes for mastering-grade transparency, dynamic (compressor-linked) EQ bands, and mid/side or stereo-linked processing per band — all exposed through progressive disclosure, never cluttering the default view built in Phase 3.

### 4.1 Linear Phase Mode

- Implement via FIR filter design (windowed-sinc or frequency-sampling method) matching the target magnitude response computed from the same band parameters used in Zero Latency mode, so switching modes doesn't change the tonal result, only the phase behavior and latency.
- This mode **adds real, reportable latency** to the host (via the plugin's `setLatencySamples` or equivalent) — this must be correct and dynamic (recalculated if the user changes FIR length/quality setting), because reporting wrong latency silently breaks sync in a DAW, which is one of the most trust-destroying bugs an EQ plugin can have.
- Offer at least two quality/latency tradeoff presets (e.g., "Medium" and "High" resolution) rather than a single fixed FIR length, mirroring the adjustable-latency approach of the reference product.

### 4.2 Natural Phase Mode (our version of Pro-Q's hybrid mode)

- Goal: reduce phase distortion relative to minimum-phase filtering without the full latency cost of linear phase — implementable via a mixed-phase design (e.g., minimum-phase magnitude response combined with a partial all-pass phase-correction stage) or via a shorter/asymmetric FIR design that trades some phase linearity for much lower latency than the full Linear Phase mode.
- This is R&D-flavored work; budget explicit prototyping and listening-test time here rather than assuming a single formula will sound right — this is exactly the kind of feature where "technically correct" and "sounds premium" are not automatically the same thing, and the reference product's version of this took real iteration to get right.

### 4.3 Dynamic EQ

- Any Bell or Shelf band can be toggled into "dynamic" mode: the band's gain becomes driven by an envelope follower monitoring energy in that band's own frequency region (or an external sidechain input), moving the effective gain between a resting value and a target value based on threshold/ratio, with attack/release.
- Per §Phase 1 findings on the reference product: attack/release should be **program-dependent by default** (auto-computed based on the detected transient content and the frequency range of the band) with manual override available for advanced users — a fixed universal attack/release knob is what makes budget dynamic EQs sound pumpy; adaptive timing is what makes it sound "smart."
- Dynamic bands must reuse the exact same parameter-smoothing discipline from §1.3 for their real-time gain modulation — this is not exempt from the click/zipper rules just because it's automatic rather than user-dragged.
- UI: dynamic controls (threshold, range, attack/release) are hidden until the user enables dynamic mode on a band — do not show them by default (progressive disclosure, consistent with Phase 3's minimalism principle and directly modeled on how the reference product handles this).

### 4.4 Mid/Side and Stereo/Left-Right Per Band

- Each band gets a processing-mode selector: Stereo (default), Mid/Side, or Left/Right.
- Implementation: mid/side encode-decode (`M = (L+R)/2, S = (L-R)/2` and inverse) must happen with correct gain compensation to avoid perceived loudness jumps when toggling modes, and must be sample-accurate/phase-coherent on decode.
- This must not double the CPU cost of every band by default — only bands actually set to M/S or L/R mode should carry the encode/decode overhead; Stereo-mode bands (the common case) should stay on the cheaper shared path.

### 4.5 Phase 4 Deliverables (Definition of Done)

- [ ] Linear Phase mode implemented, latency correctly reported to host, verified via automated latency-compensation test
- [ ] Natural Phase mode implemented and validated via both objective phase-response measurement and subjective listening panel sign-off
- [ ] Dynamic EQ with program-dependent auto timing, manual override, fully smoothed, no audible pumping artifacts on standard test material (drums, vocal, full mix)
- [ ] Mid/Side and L/R per-band modes implemented with verified gain compensation and phase coherence
- [ ] All new modes pass the same null-test/THD/CPU benchmark bar established in Phase 1

---

## PHASE 5 — The USP Layer: Cross-Track Awareness & Explainability

### 5.0 Phase Goal (short version)

This is what makes SonoDS EQ different from every EQ plugin on the market, because it is the one phase that requires our product's unique context: visibility into the *entire session*, not just the single track being processed. This phase depends on the broader AI mixing product exposing session-level audio/analysis data to the EQ module — confirm and lock that API contract with the platform team before starting Phase 5 engineering.

### 5.1 Cross-Track Masking / Collision Detection

- Each track's post-EQ spectral analysis data (already computed by Phase 2's analyzer per instance) is published to a shared, lightweight session-level registry (e.g., smoothed per-band energy snapshots at a low update rate — this does not need to be sample-accurate, a few updates per second is sufficient and keeps this cheap).
- The EQ instance on Track A can subscribe to relevant other tracks (e.g., product logic decides "bass" and "kick" are relevant to each other, or simply compare against all currently-soloed/audible tracks) and detect frequency regions where both tracks carry significant, competing energy.
- Visualize this directly on the curve display as a soft highlighted region ("collision zone") rather than a popup or separate panel — keeping with the one-canvas philosophy from Phase 3.
- Reference product's version of this (collision detection) works within a single instance comparing pre/post or against a reference signal; ours is a genuine differentiator specifically because it's cross-instance/session-aware — this is the core technical risk of this phase and should get a design spike before full implementation to validate the session-registry approach performs acceptably with many tracks open simultaneously.

### 5.2 AI Curve Suggestions (Reference Matching + Instrument-Aware Presets)

- Reference matching: analyze a user-provided reference track's spectral balance and compute a target EQ curve that would move the current track's spectral balance toward it, subject to sensible constraints (max total boost/cut, avoid over-correcting narrow peaks) — same category of feature as the reference product's "EQ Match," but the presentation should stay inside our minimal one-canvas UI rather than a separate matching panel.
- Instrument-aware starting points: if the track is tagged (by the user or by an upstream classifier in the broader AI product) as vocal/kick/bass/etc., offer a suggested starting curve and suggested dynamic-EQ ranges tuned to that instrument's typical problem frequencies — this is a data/ML component that sits partially outside this EQ module (classification) and partially inside it (applying the suggested curve smoothly, never snapping it in instantly).
- All AI-suggested curves must be applied as an *animated, smooth transition* into the existing curve (reuse Phase 1's parameter smoothing, just at a slightly longer, deliberately visible time constant like 300-500ms so the user can see and understand what changed) — never an instant jump cut, both for "feel" and so the user can learn from watching what the AI changed.

### 5.3 Explainability

- Every AI-suggested change (masking correction, reference match, instrument preset) must carry a short, plain-language annotation displayed near the affected part of the curve (e.g., "Cut here to make room for the kick drum around 80Hz") — this is a product requirement, not just a nice-to-have, because it's central to the beginner-education thesis established in Phase 0/1.
- Annotations should be dismissible and should not persist as permanent clutter — show briefly on change, available again on hover/click of that band, consistent with the minimal-canvas design language.

### 5.4 Phase 5 Deliverables (Definition of Done)

- [ ] Session-level spectral registry API contract confirmed with platform team and implemented
- [ ] Cross-track collision detection visualized on-curve, validated on real multi-track sessions (not just synthetic test tones)
- [ ] Reference-matching curve generation implemented with smooth, animated application
- [ ] Instrument-aware preset suggestion pipeline integrated with upstream classification (or manual tagging fallback if classification isn't ready yet)
- [ ] Explainability annotation system implemented and content-reviewed for plain-language clarity (no jargon a beginner wouldn't know)
- [ ] Performance validated with a realistic session size (define this number with product — e.g., 24 simultaneous tracks) without violating the CPU/frame-time budgets from Phases 1 and 2

---

## PHASE 6 — Performance Hardening, QA, and Ship Readiness

### 6.0 Phase Goal (short version)

Everything above has been built and unit-tested in isolation. This phase is where we prove the whole thing holds up under real-world abuse: long sessions, extreme parameter automation, resource-constrained machines, and actual working producers trying to break it.

### 6.1 Performance Benchmarking

- Define and run a standard benchmark suite across a matrix of: band count (1, 8, 16, 24), phase mode (Zero Latency, Natural, Linear), dynamic EQ on/off, M/S usage on/off, buffer size (64/128/256/512/1024 samples), on a defined set of reference machines (a deliberately modest "minimum spec" machine must be included, not just top-tier dev hardware).
- Publish CPU%, memory, and measured latency for every combination — this becomes both an internal regression gate and (eventually) honest marketing-facing system requirements.

### 6.2 Automated Stress & Fuzz Testing

- Automation fuzzer: randomly generates parameter automation (band creation/deletion, extreme rapid value changes, mode switching mid-stream) and runs for extended unattended sessions (target: 500+ hours cumulative before a release candidate is approved), watching for crashes, denormal-related CPU spikes, or audio glitches (auto-detected via silence/discontinuity analysis on the output, not just "did it crash").
- Host compatibility matrix: validate in the actual DAWs our target users use (confirm this list with product — likely at minimum Ableton Live, Logic Pro, FL Studio, Pro Tools, Cubase) since plugin hosts vary meaningfully in threading and automation behavior, and a bug that never appears in our own test harness can absolutely appear in a specific host's automation lane implementation.

### 6.3 Perceptual/Listening QA (do not skip — this cannot be fully automated)

- Structured A/B listening panel (mix engineers, not just the dev team) comparing SonoDS EQ against the reference product on identical source material and identical target curves, specifically checking: does a "flat" pass sound truly transparent, does dynamic EQ sound musical vs. pumpy, does linear phase sound as advertised vs. natural phase vs. zero latency.
- This should happen at the end of Phase 4 and again at the end of Phase 6, not only once at the very end.

### 6.4 Final Polish Checklist

- [ ] Full undo/redo history for every parameter and structural change
- [ ] A/B comparison state (store two full EQ states, instant switch, matched perceived loudness if gain differs significantly between the two)
- [ ] Preset save/load/browse, including factory presets built from the instrument-aware suggestions in Phase 5
- [ ] Full text-entry precision for every numeric control (per §3.1/§3.3)
- [ ] Crash reporting and telemetry wired up (with user consent/privacy handling defined by the platform, not invented ad hoc by this module) so post-launch issues surface fast
- [ ] Documentation for the DSP core handed to the platform/ML team so Phase 5's session-registry and classification hooks are maintainable by people outside this specific team

### 6.5 Phase 6 Deliverables (Definition of Done — Ship Gate)

- [ ] Full benchmark matrix published and within budget on minimum-spec hardware
- [ ] 500+ cumulative fuzz-test hours clean
- [ ] Host compatibility matrix fully green on the agreed DAW list
- [ ] Listening panel sign-off comparing favorably to the reference product on transparency and musicality
- [ ] Final polish checklist 100% complete
- [ ] Go/no-go review with product + CTO sign-off

---

## Appendix A — Team Ownership Suggestion

- **DSP Engineer(s)**: Phases 1, 4 primary; Phase 6.1/6.2 support
- **Graphics/Rendering Engineer(s)**: Phase 2 primary; Phase 3 support
- **UI/Interaction Engineer(s)**: Phase 3 primary
- **Platform/ML Engineer(s)** (may sit outside this immediate team): Phase 5 session-registry API and classification integration
- **QA/Test Engineer(s)**: build the automated harnesses starting in Phase 1.6, own Phase 6 end-to-end
- **Product/Design**: owns sign-off on §3.2's visual system fidelity to the original sketch, and on Phase 5's explainability copy

## Appendix B — Open Decisions Requiring Sign-Off Before Phase 1 Starts

1. **C++ vs. Rust** for the portable DSP core (§1.4) — pick one now; this is expensive to change later since it's also the code that eventually becomes the VST's DSP engine. C++ has the shorter path to JUCE reuse; Rust has stronger memory-safety guarantees for a team that's comfortable with it. Either is acceptable — indecision is the only wrong answer here.
2. **Cross-origin isolation feasibility** (`SharedArrayBuffer`/`Atomics`, §1.4) across every context this module will realistically be embedded in (the main SonoDS web app, any future SonoDS surface, potential third-party embedding) — confirm with platform/infra before this becomes load-bearing, with the `postMessage` fallback path benchmarked as a backup plan either way.
3. Confirm the Shelf-slope-to-Q UI mapping referenced in §1.2 with the design/UI lead before DSP implementation locks it in.
4. Confirm target minimum-spec hardware/browser matrix for the Phase 6.1 benchmark matrix (e.g., which browsers, whether mobile web is in scope for v1 — mobile Safari's Web Audio/AudioWorklet support has real limitations worth checking early, not late).
5. Confirm the package boundary and naming (§3.4) with whoever owns the broader SonoDS web app's build/monorepo setup, so the module is actually consumed as intended from day one rather than informally copy-pasted between projects "for now."
6. Confirm ownership and rough timeline expectation for the eventual native VST effort (§3.4's path-to-native note) — not to start it now, but so Phase 1's portability discipline is enforced with a real future consumer in mind rather than a hypothetical one nobody's accountable for.
