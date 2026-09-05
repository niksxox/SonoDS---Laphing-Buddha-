# SonoDS EQ — Agent Build Specification
**Audience: an autonomous/semi-autonomous coding agent (Claude Code, Antigravity, or similar) building this incrementally, task by task.**
**Companion document to `SonoDS_EQ_Engineering_Spec.md` — that document explains *why*; this one tells the agent exactly *what to type and run*, broken small enough to execute one task at a time.**

---

## HOW TO USE THIS DOCUMENT (read this before touching any code)

You are building this **one Task at a time**, in the exact order given. Every Task has: an Objective, exact commands/files, and an **Acceptance Check** you must pass before moving to the next Task. Rules:

1. **Never skip a Task's Acceptance Check.** If it fails, fix the current Task — do not move forward and "fix it later."
2. **Never combine two Tasks into one commit.** One Task = one commit, with a commit message in the form `[Phase N.M] <short description>` (e.g. `[1.3] Implement bell filter biquad coefficients`).
3. **Never invent architecture not specified here.** If something genuinely isn't covered and you must choose (a library name, a variable name), pick the simplest reasonable option and note the choice in the commit message — but if the missing piece is a real fork in the road (data format, threading approach, security-relevant choice), STOP and output a message starting with `NEEDS HUMAN DECISION:` instead of guessing.
4. **Run all existing tests before starting a new Task**, not just after finishing one — this catches regressions from a previous Task immediately rather than three Tasks later.
5. Every phase below is intentionally small in scope. If a Task feels too big to finish and verify in one sitting, stop and split it further yourself before writing code — do not push forward on a half-tested Task.
6. This spec occasionally deviates from the original human-engineer spec **on purpose**, to make the build order more incremental and machine-executable (e.g., using the browser's built-in `AnalyserNode` before building a fully custom FFT pipeline). Every deviation is called out explicitly with the tag **[AGENT SIMPLIFICATION]** and includes the future task that upgrades it, so nothing is silently lost — this preserves the original spec's *intent* while making the build order safer for incremental, testable progress.

---

## GLOBAL FIXED DECISIONS (no ambiguity left for you to resolve)

Do not re-litigate these. They are decided:

| Decision | Choice |
|---|---|
| App/UI language | TypeScript |
| DSP core language | Rust |
| DSP → Web bridge | WebAssembly via `wasm-pack` |
| Package manager / monorepo tool | `pnpm` workspaces |
| Build tool (TS/web) | Vite |
| Audio engine | Web Audio API, `AudioWorkletProcessor` for the actual filtering |
| Rendering (Phase 3 initial) | Canvas 2D (`CanvasRenderingContext2D`), **not** WebGL yet — see [AGENT SIMPLIFICATION] note in Phase 3 |
| UI component model | Native Web Components (`customElements.define`), no React/Vue dependency in the core package |
| State management | A small hand-written TypeScript event-emitting store class — no Redux/MobX/etc. |
| TS test runner | Vitest |
| Rust test runner | `cargo test` (native target) + a Node-based smoke test against the compiled `.wasm` |
| E2E/interaction testing | Playwright (introduced in Phase 4) |

---

## REPO LAYOUT (create this exact structure in Task 1.1)

```
sonods-eq/
├── pnpm-workspace.yaml
├── package.json
├── packages/
│   ├── dsp-core/           # Rust crate — the portable filter math
│   │   ├── Cargo.toml
│   │   └── src/
│   ├── eq-engine/          # TypeScript — wasm loader, AudioWorklet glue, state, public API
│   │   ├── package.json
│   │   └── src/
│   └── eq-ui/              # TypeScript — Web Component, canvas rendering, interaction/gestures
│       ├── package.json
│       └── src/
└── apps/
    └── demo/               # Vite app used only to manually test/host the module during dev
        ├── index.html
        └── src/
```

`dsp-core` has zero knowledge of the browser. `eq-engine` has zero knowledge of pixels/rendering. `eq-ui` has zero knowledge of raw audio math. This separation is the whole point — do not let imports cross these boundaries in the wrong direction (e.g., `dsp-core` must never import anything from `eq-engine`).

---

# PHASE 1 — DSP Core (Rust, no browser, no UI)

**Phase goal:** a native Rust library, fully unit-tested, that computes correct filter coefficients and processes audio sample-by-sample with zero heap allocation in the hot path. At the end of Phase 1 there is still no audio playing anywhere — just a library and its test suite.

### Task 1.1 — Repo & workspace scaffold

- Run: `mkdir sonods-eq && cd sonods-eq && git init`
- Create `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - "packages/*"
    - "apps/*"
  ```
- Create the directory tree exactly as shown in **REPO LAYOUT** above (empty folders are fine for now, populate in later tasks).
- Create root `package.json` with `"private": true` and a `"workspaces"` note (pnpm doesn't need it, but keep the field out — pnpm uses the yaml file only; do not add a conflicting `workspaces` key).
- **Acceptance Check:** `pnpm install` runs at the repo root with no errors (even with empty packages, it should not fail). Commit as `[1.1] Repo and workspace scaffold`.

### Task 1.2 — Rust crate scaffold + test harness

- `cd packages/dsp-core && cargo init --lib`
- Edit `Cargo.toml`: crate name `sonods_dsp_core`, add `[lib] crate-type = ["cdylib", "rlib"]` (cdylib is required later for the wasm build; rlib lets `cargo test` run natively now).
- Create `src/biquad.rs` with a `Biquad` struct holding coefficients (`b0, b1, b2, a1, a2` — normalize so `a0 = 1` at coefficient-computation time, not in the hot loop) and state (`z1, z2`), all as `f64`. Add a `process_sample(&mut self, x: f64) -> f64` method implementing Direct Form II Transposed:
  ```
  y  = b0*x + z1
  z1 = b1*x - a1*y + z2
  z2 = b2*x - a2*y
  return y
  ```
- Add one trivial test in `src/lib.rs` (`#[test] fn biquad_compiles_and_runs()`) that constructs an identity biquad (`b0=1`, everything else `0`) and asserts `process_sample(x) == x` for a few values.
- **Acceptance Check:** `cargo test` passes. Commit as `[1.2] Biquad struct scaffold with DF2T processing`.

### Task 1.3 — Bell (peaking) filter coefficient calculation

- Create `src/coeffs.rs`. Implement `pub fn bell(freq_hz: f64, sample_rate: f64, gain_db: f64, q: f64) -> BiquadCoeffs` using the standard peaking-EQ biquad design (this is the widely-published Audio EQ Cookbook peaking formula — implement it precisely, don't approximate):
  ```
  w0 = 2 * PI * freq_hz / sample_rate
  cos_w0 = cos(w0)
  sin_w0 = sin(w0)
  alpha = sin_w0 / (2.0 * q)
  A = 10f64.powf(gain_db / 40.0)

  b0 =  1.0 + alpha * A
  b1 = -2.0 * cos_w0
  b2 =  1.0 - alpha * A
  a0 =  1.0 + alpha / A
  a1 = -2.0 * cos_w0
  a2 =  1.0 - alpha / A

  // normalize by a0 before returning, so the runtime struct never divides
  ```
- Write a test that computes the coefficients for a known case (e.g. 1000 Hz, 48000 Hz sample rate, +6 dB, Q=1.0) and asserts the resulting frequency response, evaluated at `freq_hz` itself, is within 0.1 dB of +6 dB, and the response far away (e.g. 20 Hz and 20 kHz) is within 0.1 dB of 0 dB. To evaluate frequency response from coefficients analytically (not by running audio), implement a small helper `pub fn magnitude_db(coeffs: &BiquadCoeffs, freq_hz: f64, sample_rate: f64) -> f64` using the standard z-transform magnitude formula — this helper is reused for every filter type's test **and** later reused directly for the on-screen curve (Phase 3), so implement it once, correctly, here.
- **Acceptance Check:** `cargo test` passes, including the new analytic magnitude tests. Commit as `[1.3] Bell filter coefficients + analytic magnitude test helper`.

### Task 1.4 — Shelf filters (low shelf, high shelf)

- Add `pub fn low_shelf(...)` and `pub fn high_shelf(...)` to `coeffs.rs` using the standard Audio EQ Cookbook shelving-filter formulas, parameterized by a shelf-slope value `s` (range roughly `0.1` to `2.0`) instead of exposing `Q` directly to callers of this function — the UI-facing Q-to-shelf-slope mapping happens one layer up in `eq-engine` (Task 2.x), not here. Keep the function signature as `low_shelf(freq_hz: f64, sample_rate: f64, gain_db: f64, shelf_slope: f64) -> BiquadCoeffs`.
- Test the same way as Task 1.3: known input → assert the shelf plateau gain is reached well above/below the corner frequency, and the corner frequency itself is at the mathematically expected midpoint gain.
- **Acceptance Check:** tests pass. Commit as `[1.4] Low shelf and high shelf filter coefficients`.

### Task 1.5 — Cut filters (high-pass / low-pass), cascaded to reach steep slopes

- Add `pub fn high_pass_section(freq_hz, sample_rate, q) -> BiquadCoeffs` and `pub fn low_pass_section(...)` — a single Butterworth-style 2nd-order section (12 dB/oct).
- Add `pub struct FilterChain { sections: Vec<Biquad> }` (this is the **only** place a `Vec` — i.e. heap allocation — is allowed, and only because it is built once at construction/parameter-change time, never inside the per-sample audio loop) with a constructor `FilterChain::high_pass(freq_hz, sample_rate, slope_db_per_oct)` that cascades the correct number of sections: 1 section for 12 dB/oct, 2 for 24, 4 for 48, 8 for the "steep" 96 dB/oct option. Each section uses a slightly different Q value per standard Butterworth cascade design (equal-ripple Q distribution) — do not just repeat the same Q on every section, that produces an incorrect (non-Butterworth) combined response; look up or derive the correct per-section Q values for an N-th order Butterworth cascade (they follow `Q_k = 1 / (2 * cos((2k-1)*PI / (4*N)))` for section `k` of `N` total 2nd-order sections) and encode them as a small lookup/formula in this file.
- Test: assert the combined magnitude response at 2x and 4x the cutoff frequency drops by approximately the expected dB for the configured slope (e.g., 24 dB/oct should be down ~24 dB one octave past cutoff, within a couple dB of tolerance since this is a real filter, not a brick wall).
- **Acceptance Check:** tests pass. Commit as `[1.5] Cascaded high-pass/low-pass filter chains with correct Butterworth Q distribution`.

### Task 1.6 — Parameter smoothing module

- Create `src/smoothing.rs`. Implement `pub struct SmoothedParam { current: f64, target: f64, coeff: f64 }` where `coeff` is precomputed from a time constant and the sample rate: `coeff = exp(-1.0 / (time_constant_seconds * sample_rate))`. Method `pub fn set_target(&mut self, target: f64)` just updates `target`. Method `pub fn tick(&mut self) -> f64` advances one sample: `current = target + (current - target) * coeff; return current`.
- This is used for gain (15 ms), frequency (20 ms), Q (20 ms), and bypass (5 ms linear fade — implement bypass as a **separate**, simpler linear ramp toward 0.0/1.0, not the exponential smoother, since a fixed-duration linear fade is what's specified). Encode these four default time constants as named constants in this file (`GAIN_SMOOTHING_MS`, `FREQ_SMOOTHING_MS`, `Q_SMOOTHING_MS`, `BYPASS_FADE_MS`) so they are easy to find and tune later, not magic numbers scattered around.
- Test: construct a `SmoothedParam`, set a target, tick it many times, assert it approaches (within a small epsilon) the target and never overshoots or oscillates.
- **Acceptance Check:** tests pass. Commit as `[1.6] Parameter smoothing module`.

### Task 1.7 — Band + EqEngine: the real per-sample processing path

- Create `src/band.rs`: `pub struct Band { shape: Shape, freq: SmoothedParam, gain: SmoothedParam, q: SmoothedParam, enabled: bool, biquad: Biquad /* or FilterChain for cuts */ }` with a method `recompute_coeffs_if_needed(&mut self, sample_rate: f64)` that ticks the smoothed params and recomputes biquad coefficients **only if any smoothed value actually changed since last call** (cheap comparison, avoid recomputing trig functions every single sample when nothing is moving).
- Create `src/engine.rs`: `pub struct EqEngine { bands: [Option<Band>; MAX_BANDS], sample_rate: f64 }` with `MAX_BANDS = 12` as a fixed-size array — **no heap allocation for the band list itself**, this is the real-time-safe hot path. Method `pub fn process_block(&mut self, buffer: &mut [f32])`: for each sample, call each enabled band's `process_sample` in series (the cascade), reading each band's already-smoothed coefficients (coefficients recomputed once per block per Task 1.3's note in the original spec, not per sample — call `recompute_coeffs_if_needed` once at the top of `process_block`, not inside the sample loop).
- Also implement `pub fn magnitude_response_db(&self, freqs_hz: &[f64]) -> Vec<f64>` — the **combined** response across all active bands at a given set of frequencies, reusing the `magnitude_db` helper from Task 1.3 per band and summing in dB. This function is what Phase 3's on-screen curve will call — building it now, in the same engine that actually processes audio, guarantees the curve can never visually disagree with what's actually being heard.
- Write a test processing a short buffer of a pure sine wave through a single bell band and confirming the output RMS gain roughly matches the expected boost/cut in dB (a practical, not just analytic, correctness check).
- **Acceptance Check:** tests pass. Commit as `[1.7] EqEngine: fixed-size band array, block processing, combined magnitude response`.

### Task 1.8 — Denormal protection and numerical safety test

- In `engine.rs`, at the very top of `process_block`, add denormal protection: the simplest robust approach in Rust without unsafe CPU flag manipulation is to add a tiny DC bias (e.g. `1e-25`) to the input of each biquad's internal state on each call, or explicitly flush any state variable below a tiny threshold to `0.0` after each sample. Implement the explicit-flush approach (`if z1.abs() < 1e-15 { z1 = 0.0 }`, same for `z2`) inside `Biquad::process_sample` — simplest to reason about and test directly.
- Write a test: feed 48000 samples of silence (`0.0`) into a high-Q bell band, then a single unit-impulse, and assert the CPU-observable behavior is correct (output responds to the impulse) and that state values never become subnormal floats (`f64::is_subnormal()` check on `z1`/`z2` after the silence period — should be exactly `0.0`, not a tiny subnormal value, proving the flush worked).
- **Acceptance Check:** tests pass. Commit as `[1.8] Denormal protection with test`.

### Task 1.9 — Compile to WebAssembly

- Run: `cargo install wasm-pack` (if not already available), then from `packages/dsp-core`: `wasm-pack build --target no-modules --release`. Use `--target no-modules` specifically (not `web` or `bundler`) — `AudioWorkletGlobalScope` cannot use ES module imports or `fetch`, so we need a build that produces a plain global-scope-instantiable wasm binary plus a minimal glue file we control, not one that assumes a normal browser module context.
- Add a small `wasm-bindgen`-exposed surface: `#[wasm_bindgen] pub fn create_engine(sample_rate: f64) -> *mut EqEngine`, `process_block(ptr, buffer_ptr, len)`, `set_band_param(ptr, band_index, param_id, value)`, `get_magnitude_response(ptr, freqs_ptr, out_ptr, len)` — raw pointer-based exports so the JS side can operate directly on WASM linear memory without per-call serialization overhead (this matters for audio-rate calls). Keep this exported surface **as small as possible** — it is the only part of the Rust code that has to stay JS-compatible forever, everything else in `dsp-core` can be refactored freely later.
- Write a Node-based smoke test (plain `.mjs` script, not a full test framework yet) that loads the compiled `.wasm` via `WebAssembly.instantiate`, calls `create_engine`, sets a band, calls `process_block` on a small buffer, and asserts the output differs from the input in the expected direction. This is the first proof that the exact same math verified natively in Rust also works correctly through the WASM boundary.
- **Acceptance Check:** the Node smoke test passes. Commit as `[1.9] WASM build target + minimal wasm-bindgen export surface + Node smoke test`. **End of Phase 1 — do not start Phase 2 until every Phase 1 Acceptance Check is green.**

---

# PHASE 2 — Web Audio Integration

**Phase goal:** real audio, actually filtered, actually playing in a browser tab — driven by the WASM core from Phase 1 — with zero UI yet beyond a bare test page. This is where "does it actually work end to end" gets proven for the first time.

### Task 2.1 — `eq-engine` package scaffold + copy wasm artifact

- `cd packages/eq-engine`, `pnpm init`, add `typescript`, `vite`, `vitest` as dev dependencies.
- Create `src/wasmLoader.ts`: a function `loadDspModule(wasmBytes: ArrayBuffer): Promise<DspExports>` that wraps `WebAssembly.instantiate` and returns a typed interface matching the exports from Task 1.9 (`create_engine`, `process_block`, `set_band_param`, `get_magnitude_response`, plus `memory` for direct buffer access).
- **Acceptance Check:** a Vitest test in Node loads the `.wasm` file (copy it from `packages/dsp-core/pkg/` into `packages/eq-engine/src/wasm/` as part of this task — decide now whether this copy is manual or scripted via a `pnpm build:dsp` script; scripted is better, add it now) and confirms `loadDspModule` resolves and the exported functions exist. Commit as `[2.1] eq-engine scaffold + wasm loader`.

### Task 2.2 — AudioWorkletProcessor shell

- Create `src/worklet/sonods-eq-processor.ts` (this file gets bundled separately and loaded via `audioContext.audioWorklet.addModule(...)`, so keep it self-contained — it cannot import from the rest of the package the normal way; bundle it as its own entry point in the Vite/build config).
- Implement a class extending `AudioWorkletProcessor` that: (a) on construction, receives the compiled wasm bytes via `this.port.onmessage` (the main thread `fetch`es the `.wasm` file and posts the `ArrayBuffer` over, since the worklet global scope cannot `fetch` it directly) and instantiates the module using `wasmLoader.ts`'s function; (b) implements `process(inputs, outputs)` calling into the wasm `process_block` for each channel; (c) registers itself via `registerProcessor('sonods-eq-processor', SonodsEqProcessor)`.
- **[AGENT SIMPLIFICATION]**: for this task, use `port.postMessage`/`onmessage` for parameter updates too (not `SharedArrayBuffer` yet) — get the whole pipeline working end-to-end first with the simpler mechanism, then Task 2.3 specifically upgrades the parameter path to `SharedArrayBuffer` once correctness is already proven. Do not try to do both at once.
- **Acceptance Check:** a manual test page (put it in `apps/demo`, minimal, not polished) that creates an `AudioContext`, loads a short audio file or generates a test tone via `OscillatorNode`, routes it through the worklet node, and plays it — confirm by ear (documented in the commit message that this was manually verified, since audible output can't be asserted by an automated test at this stage) that a boosted band is audibly louder in that frequency region. Commit as `[2.2] AudioWorkletProcessor shell with postMessage parameter updates, manually verified audible output`.

### Task 2.3 — Upgrade parameter path to SharedArrayBuffer

- First: add a small feature-detection utility `isCrossOriginIsolated(): boolean` checking `self.crossOriginIsolated`. This governs whether `SharedArrayBuffer` is even usable — if the demo app isn't served with the required COOP/COEP headers, `SharedArrayBuffer` will not exist or won't be shareable across the worklet boundary.
- Configure the Vite dev server (`apps/demo/vite.config.ts`) to send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers, so local development actually exercises the real code path rather than always silently falling back.
- Implement a fixed-layout `Float64Array` backed by a `SharedArrayBuffer`, one slot per (band index × parameter type), main thread writes via plain array index assignment (this is safe for single-writer/single-reader scalar values without needing full `Atomics.wait`/`Atomics.store` ceremony — plain reads/writes to a `SharedArrayBuffer`-backed typed array are sufficient here since we only need eventual consistency within a few samples, not cross-thread synchronization of a critical section).
- Implement the `postMessage` fallback path from Task 2.2 as a real fallback (not dead code) selected at runtime via the feature-detection utility, and write a small integration test that forces each path (mock `crossOriginIsolated` true/false) and confirms parameter changes still reach the processor either way.
- **Acceptance Check:** the fallback-selection test passes in both modes; the manual audible test from Task 2.2 still works with headers enabled. Commit as `[2.3] SharedArrayBuffer parameter path with tested postMessage fallback`.

### Task 2.4 — Structural commands (add/remove/change band shape)

- Extend the shared-memory layout with a small fixed-size ring buffer region for structural commands (`{commandType, bandIndex, shapeEnum}` tuples packed into a few `Int32` slots per command) — reuse the SPSC ring buffer pattern: a write index and read index, main thread advances write index after writing, worklet advances read index after consuming, never the reverse, no locks needed for this single-producer/single-consumer case.
- On the Rust side, this was already designed for in Task 1.7's `EqEngine` (fixed-size array of `Option<Band>` — "removing" a band is just setting its slot to `None`, "adding" is finding an empty slot and constructing a new `Band`). Confirm the wasm export surface from Task 1.9 already covers this, or add a minimal `set_band_shape(ptr, index, shape_enum)` export if it doesn't yet — if you need a new Rust-side export here, that's a small change to `dsp-core`, go back and add it, write its Rust test, rebuild the wasm artifact, then continue this task.
- **Acceptance Check:** an integration test that adds a band, plays a test tone, removes the band mid-stream (simulated via directly writing to the ring buffer in the test, not via UI since none exists yet), and confirms the output reverts to unfiltered — proving structural changes apply cleanly without clicks or crashes. Commit as `[2.4] Structural command ring buffer for add/remove/change-shape`.

### Task 2.5 — End-to-end automated correctness test (OfflineAudioContext)

- Write a Vitest test using `OfflineAudioContext` (works in `jsdom`-free Node test environments via a WebAudio polyfill, or run this specific test in a headless-browser test runner if a pure-Node WebAudio implementation isn't available/reliable enough — check what's actually available and pick the simpler working option rather than fighting a broken polyfill) that: renders a known input signal through the full worklet pipeline with a known EQ setting, and asserts the rendered output's frequency content matches the expected filtered result (e.g., via a simple FFT magnitude check at a couple of specific frequencies) within a defined tolerance.
- This is the automated stand-in for the "manually verified by ear" step from Task 2.2 — once this passes, Task 2.2's manual-only verification is superseded and this becomes the real regression gate going forward.
- **Acceptance Check:** this test passes and is added to the standard CI test command. Commit as `[2.5] Automated end-to-end OfflineAudioContext correctness test`. **End of Phase 2.**

---

# PHASE 3 — Visualization Engine

**Phase goal:** a live, correct, smooth-updating picture of what the EQ is doing — analyzer + response curve — still with no user interaction (that's Phase 4) and still inside the bare demo page, not the final component shell (that's also Phase 4).

**[AGENT SIMPLIFICATION — read before starting this phase]**: the original engineering spec calls for a fully custom FFT pipeline on a dedicated analysis thread. For this build order, **use the browser's built-in `AnalyserNode` instead**, tapped twice (once before the EQ worklet node, once after) to get Pre-EQ and Post-EQ data. `AnalyserNode` already does windowed FFT and has a built-in `smoothingTimeConstant` for the attack/release-style smoothing the original spec calls for — this gets a correct, good-sounding analyzer built in a fraction of the code, with zero custom FFT math to get subtly wrong. If a future profiling pass shows this is insufficient (e.g., we need window/overlap control `AnalyserNode` doesn't expose), that becomes its own later task to replace just the analysis source, without touching the rendering code built in this phase.

### Task 3.1 — Pre/Post AnalyserNode taps

- In `eq-engine`, extend the public API (a class wrapping the whole Web Audio graph — create this now if it doesn't exist yet, e.g. `SonodsEqNode`) to internally create two `AnalyserNode`s: connect the input to `preAnalyser` and to the worklet node; connect the worklet node's output to `postAnalyser` and to the actual audio destination path. Expose `getPreAnalyserData(): Float32Array` and `getPostAnalyserData(): Float32Array` (using `getFloatFrequencyData`) on the public class.
- Set `fftSize = 4096` and `smoothingTimeConstant` to two different values for a faster-rise/slower-fall feel if needed (note: `AnalyserNode`'s single `smoothingTimeConstant` applies symmetrically; if true asymmetric attack/release smoothing is required later, that's a small custom smoothing step applied to the analyser's raw output in `eq-ui`, not a change to this task — keep this task limited to wiring the taps correctly).
- **Acceptance Check:** a Vitest test using the `OfflineAudioContext` harness from Task 2.5 confirms `getPreAnalyserData` and `getPostAnalyserData` return different, sensible data when a band is active (post should show the boost/cut, pre should not). Commit as `[3.1] Pre/Post AnalyserNode taps on SonodsEqNode`.

### Task 3.2 — Curve computation, sourced from the exact same math as the audio

- In `eq-engine`, add `getResponseCurve(numPoints: number): {freq: number, gainDb: number}[]` that calls the wasm `get_magnitude_response` export from Task 1.7/1.9 with a log-spaced frequency array (20 Hz to 20 kHz, `numPoints` typically 512) — **do not reimplement the magnitude math in TypeScript**; the whole point of building `magnitude_response_db` inside the Rust engine in Task 1.7 was so the visual curve and the actual audio can never disagree.
- Cache the result and only recompute when a parameter or structural change has actually occurred (track a simple dirty flag set whenever `set_band_param`/structural commands are called, cleared after `getResponseCurve` runs) — this satisfies the "recompute only on change" performance requirement directly.
- **Acceptance Check:** a test confirms calling `getResponseCurve` twice with no changes between calls returns a cached/identical result without re-invoking the wasm call (spy/mock the wasm export and assert call count), and confirms a changed parameter does trigger recomputation. Commit as `[3.2] Response curve computation via wasm, with change-based caching`.

### Task 3.3 — Canvas 2D renderer skeleton (this is where `eq-ui` starts)

- `cd packages/eq-ui`, scaffold similarly to `eq-engine`. Create `src/renderer.ts`: a class `CurveRenderer` taking a `CanvasRenderingContext2D` and a points array (from Task 3.2's shape), drawing a smooth path — use `ctx.bezierCurveTo` or `quadraticCurveTo` between the log-spaced points rather than `lineTo`, matching the "smooth vector path, not jagged polyline" requirement.
- Apply the glow using Canvas 2D's built-in `ctx.shadowBlur` + `ctx.shadowColor` set to the accent green before stroking the path — this achieves the soft outer glow from the design with zero custom shader code, which is why Canvas 2D is an acceptable starting choice per the phase-level simplification note. Respect `devicePixelRatio`: size the canvas backing store as `cssWidth * devicePixelRatio` and scale the drawing context accordingly — do not skip this, it directly determines whether the result looks crisp or blurry on real displays.
- Drive it with a `requestAnimationFrame` loop that re-reads the current curve points every frame (cheap, since Task 3.2 already caches) and only re-strokes if the points reference has changed since the last frame.
- **Acceptance Check:** the demo app in `apps/demo` visibly shows a smooth glowing curve reacting when a band's parameters are changed via a temporary debug `<input type="range">` (not the final UI — just enough to visually confirm the pipeline). Commit as `[3.3] Canvas2D curve renderer with glow and DPR-aware sizing`.

### Task 3.4 — Analyzer trace rendering

- Add `AnalyserRenderer` in the same package, drawing the Pre/Post `AnalyserNode` data (from Task 3.1) as filled, translucent, log-frequency-mapped area shapes behind the curve — reuse the same log-frequency-to-x-position mapping function as the curve renderer (extract it into a small shared `frequencyToX(freq, canvasWidth): number` utility now, do not duplicate the log-scale math in two files).
- **Acceptance Check:** demo app visually shows the translucent analyzer trace(s) responding to actual audio playing through the graph. Commit as `[3.4] Analyzer trace rendering with shared frequency-to-x mapping`.

### Task 3.5 — Performance instrumentation

- Add a debug-only frame-timing overlay (toggled by a query param or dev flag, never shown in a production build) printing current FPS and time spent in curve-fetch vs. draw call, using `performance.now()` deltas around each stage of the `requestAnimationFrame` callback.
- Write an automated frame-timing test (can run via Playwright once introduced in Phase 4, or a simpler script now measuring raw callback duration over N frames in a headless browser context) asserting p99 frame time stays under 16.6 ms during a scripted sequence of rapid parameter changes.
- **Acceptance Check:** the instrumentation is visible in dev mode and the automated timing check passes on the reference dev machine. Commit as `[3.5] Frame-timing instrumentation + automated performance regression check`. **End of Phase 3.**

---

# PHASE 4 — Interaction Model & Visual Design (matching the reference sketch)

**Phase goal:** the actual product surface — the real Web Component, the exact gesture set, the exact visual language from the reference sketch image (shared separately with you — study it directly, do not rely on the prose description alone for the vibe/spacing/proportions).

**Design correction, carried over from the engineering spec — do not implement a grid.** The faint grid visible in the reference sketch was the default canvas background of the drawing tool, not an intentional design element. The EQ background is a clean, ungridded surface. If you were about to add grid lines anywhere in this phase, stop — that's not in scope.

### Task 4.1 — `<sonods-eq>` custom element shell

- In `eq-ui`, create `src/SonodsEqElement.ts` extending `HTMLElement`, using Shadow DOM (`attachShadow({mode: 'open'})`) so this component's styles never leak into and are never polluted by whatever host page/app it's dropped into — this directly serves the "reusable in any future web app" requirement.
- Inside the shadow root: a rounded-rect container (CSS `border-radius`, soft box-shadow for the "premium" window-chrome feel per the sketch), a `<canvas>` filling most of it for the curve/analyzer (Phases 2-3's renderers mount here), and placeholder DOM elements for the traffic-light status dots (top-right) and the bottom mode-pill row (structure only in this task — real behavior comes in Task 4.5).
- Register with `customElements.define('sonods-eq', SonodsEqElement)`.
- **Acceptance Check:** the demo app can drop in a bare `<sonods-eq></sonods-eq>` tag and see the correctly proportioned, correctly rounded, glow-capable canvas rendering — visually compare side-by-side against the reference sketch image for proportions before checking this off, not just "it renders something." Commit as `[4.1] sonods-eq custom element shell with Shadow DOM chrome`.

### Task 4.2 — Band handle hit-testing and drag

- Add a `BandHandle` concept to the renderer: for each active band, compute its screen position from `(frequencyToX(band.freq), gainToY(band.gain))` (add the `gainToY` mapping utility alongside `frequencyToX` from Task 3.4), draw it as a filled circle with a lighter ring (reuse one shared circle-drawing function — this same visual is reused for the bottom mode pills in Task 4.5, per the design system's requirement that these share one component definition).
- Implement pointer-event-based hit testing (`pointerdown`/`pointermove`/`pointerup`, not legacy mouse events, for correct behavior on trackpads/touch) that detects when a pointer-down lands within a handle's radius, then on `pointermove` while dragging, converts the new pointer position back to frequency/gain via the inverse of `frequencyToX`/`gainToY`, and calls the `eq-engine` API to update that band's parameters live.
- **Acceptance Check:** in the demo app, a user (you, manually, plus document it) can click-drag an on-curve handle and see + hear the change happen live with no perceptible lag. Commit as `[4.2] Band handle hit-testing and drag interaction`.

### Task 4.3 — Remaining gestures: create, reset, Q via scroll

- Implement: click on empty curve space creates a new Bell band at that frequency/gain (call the `eq-engine` "add band" API from Phase 2.4); double-click an existing handle resets it to neutral defaults (0 dB gain, default Q) rather than deleting it; scroll wheel while hovering a selected handle adjusts Q (clamp to a sensible range, update the numeric readout live).
- Implement the Shift-drag axis constraint (pick one convention — e.g., Shift locks to vertical/gain-only movement — and write it down in a short code comment so it's consistent everywhere, including any future help/tooltip copy).
- **Acceptance Check:** manually verified each gesture from the original spec's gesture table works as specified; write at least a basic Playwright test simulating pointer events for the create and drag gestures (introduce Playwright to the repo in this task if not already present). Commit as `[4.3] Band creation, reset, Q-scroll, and shift-constrained drag`.

### Task 4.4 — Keyboard accessibility + numeric text entry

- Make band handles focusable (`tabindex`), with arrow keys nudging the selected band's frequency/gain by a fine step and Shift+arrow by a coarse step; Tab cycles selection between bands.
- Implement double-click-on-readout → inline editable numeric input (a small `<input>` swapped in over the readout position, matching the monospace/tabular-figure font from the design system) with Enter to commit and Escape to cancel.
- **Acceptance Check:** keyboard-only operation of the whole component works (verify by literally not touching the mouse during a manual test pass); a Playwright test covers at least the numeric text-entry path. Commit as `[4.4] Keyboard accessibility and precise numeric text entry`.

### Task 4.5 — Visual design system finalization

- Extract all colors, radii, blur amounts, and font choices into a single CSS custom-properties block (design tokens) at the top of the component's Shadow DOM styles, so retheming later never requires touching component logic.
- Implement the bottom mode-pill row using the exact same circle-component definition as the on-curve band handles (per the design system requirement) — refactor now if Task 4.2's circle-drawing code isn't already factored out into a reusable function/class.
- Wire the traffic-light dots to real status (green = normal, amber = a defined CPU/perf warning threshold from Task 3.5's instrumentation, red = an error/overload state) rather than leaving them purely decorative.
- **Acceptance Check:** side-by-side comparison against the reference sketch image for color, proportion, and "vibe" — get a second pass of human sign-off here specifically, since this is the one Acceptance Check in the whole document that is inherently subjective and shouldn't be self-graded by the agent alone. Commit as `[4.5] Design system tokens, shared handle/pill component, functional status dots`.

### Task 4.6 — Usability smoke test suite

- Expand the Playwright suite to cover the full gesture set from the original spec's interaction table in one scripted pass, plus a basic visual regression snapshot (Playwright's built-in screenshot comparison) so future changes can't silently break the visual design without a diff showing up in CI.
- **Acceptance Check:** full Playwright suite green, visual snapshot baseline committed. Commit as `[4.6] Full gesture-set Playwright suite with visual regression baseline`. **End of Phase 4 — this is the first point where the module is a genuinely usable, complete-feeling EQ, even though Phases 5/6 add real depth.**

---

# PHASE 5 — Advanced Processing (Linear Phase, Natural Phase, Dynamic EQ, Mid/Side)

**Phase goal:** the "one layer deeper" professional features, hidden by default (progressive disclosure), added without touching or regressing anything Phase 1–4 already proved correct.

### Task 5.1 — Linear phase FIR mode (Rust)

- Add a new module `src/linear_phase.rs` in `dsp-core`. Implement FIR filter design via the windowed-sinc method: for a target magnitude response (reuse `magnitude_response_db` from Task 1.7 as the target), construct a linear-phase FIR kernel via inverse FFT of the desired frequency response plus a window function (Blackman-Harris recommended for low sidelobes) — this is genuinely nontrivial DSP; budget real time for it and lean on the existing analytic magnitude tests to validate the result numerically before any listening test.
- Report added latency correctly: FIR kernel length determines the exact added latency in samples; expose this via a new wasm export `get_latency_samples(ptr) -> u32`, and on the `eq-engine` side, call the Web Audio API's mechanism for reporting plugin latency to the host context accurately whenever the FIR length changes (e.g., mode switch or quality-preset change).
- Provide at least two quality/latency presets ("Medium", "High") as different FIR lengths, not a single fixed length.
- **Acceptance Check:** a Rust test confirms the FIR-mode magnitude response matches the Zero-Latency-mode target response within tolerance (same tonal result, different phase behavior — the spec's explicit requirement); an `eq-engine` test confirms the reported latency value is correct and updates when the quality preset changes. Commit as `[5.1] Linear phase FIR mode with correct latency reporting`.

### Task 5.2 — Natural Phase mode (flagged R&D — expect iteration)

- Implement a first version as a mixed-phase design: the existing minimum-phase IIR bell/shelf/cut cascade, plus a short all-pass correction stage that reduces phase distortion in the most audible range without the full FIR latency cost. Treat the first implementation as a draft — write the objective phase-response measurement test first (compare phase response of Zero Latency vs. this new mode vs. Linear Phase, confirm this mode sits meaningfully between the two), then iterate the actual DSP against that test rather than shipping the first thing that compiles.
- **Acceptance Check:** the objective phase-measurement test passes and shows the expected in-between behavior; flag in the commit message that a human listening-test pass (per the original engineering spec's §4.2/§6.3) is still required before this mode is considered final — that check is inherently perceptual and cannot be an agent-only Acceptance Check. Commit as `[5.2] Natural Phase hybrid mode (draft — pending human listening validation)`.

### Task 5.3 — Dynamic EQ

- Add an envelope follower to `Band` in Rust: monitor the energy passing through that band's own frequency region (a simple approach: tap the signal after that band's filter, run it through a peak/RMS detector with attack/release time constants), and modulate the band's effective gain between a resting value and a target value based on threshold/ratio parameters.
- Implement attack/release as **program-dependent by default**: derive the actual time constants from the detected transient content and the band's frequency range (faster defaults for high-frequency bands, slower for low-frequency ones is a reasonable starting heuristic — document whatever heuristic is chosen clearly in a code comment, since this is exactly the kind of parameter that will get tuned by ear later) rather than one fixed global value, while still exposing manual override parameters for advanced users.
- Reuse the exact `SmoothedParam` mechanism from Task 1.6 for the resulting real-time gain modulation — this is not exempt from the click/zipper rules.
- In `eq-ui`, hide dynamic-mode controls (threshold, range, attack/release) until the user explicitly enables dynamic mode on a band (a toggle in the existing per-band context menu from Task 4.3) — progressive disclosure, do not show these by default.
- **Acceptance Check:** an automated test feeds a signal with a clear transient into a dynamic band and confirms the gain modulates in the expected direction and settles smoothly (no oscillation/pumping in the raw automated test); flag for a human listening pass on real musical material (drums, vocal) per the original spec, since "sounds musical vs. pumpy" is ultimately a perceptual judgment. Commit as `[5.3] Dynamic EQ with program-dependent timing`.

### Task 5.4 — Mid/Side and Left/Right per band

- Add a processing-mode enum (`Stereo`, `MidSide`, `LeftRight`) per band. Implement mid/side encode (`m = (l+r)*0.5`, `s = (l-r)*0.5`) and decode (`l = m+s`, `r = m-s`) with the correct compensation so toggling modes doesn't cause a perceived loudness jump — verify this numerically (process a test stereo signal through Stereo mode and through MidSide mode with equivalent settings, assert output RMS matches within a small tolerance).
- Performance requirement: only bands actually set to `MidSide` or `LeftRight` should carry the encode/decode cost — keep `Stereo` (the default, common case) on the cheaper existing path; do not restructure the whole engine's per-sample loop in a way that taxes every band for a feature only some bands use.
- **Acceptance Check:** the loudness-compensation test and the "stereo-mode bands don't pay the M/S cost" performance check (a quick benchmark comparing CPU time with 10 stereo bands vs. 10 mid/side bands, confirming stereo bands alone are meaningfully cheaper) both pass. Commit as `[5.4] Mid/Side and L/R per-band processing modes`.

### Task 5.5 — Regression pass against the Phase 1 quality bar

- Re-run every test from Phases 1–4 (null test, THD+N, CPU benchmark, frame-timing) with all Phase 5 features available (even if not all engaged in a given test run) to confirm nothing regressed by their mere presence in the codebase.
- **Acceptance Check:** full regression suite green. Commit as `[5.5] Full regression pass after Phase 5 features`. **End of Phase 5.**

---

# PHASE 6 — The USP Layer: Cross-Track Awareness & Explainability

**Phase goal:** the feature that makes this different from every standalone EQ plugin — but note this phase genuinely depends on the surrounding SonoDS app exposing session-level data (other tracks), so some tasks here define an interface contract more than a finished feature, until that platform-side work exists.

### Task 6.1 — Session registry (cross-instance communication)

- Since `eq-ui`'s custom element explicitly supports multiple simultaneous instances (Phase 3.4's design requirement), implement a lightweight pub/sub registry: a module-level `EventTarget` (or `BroadcastChannel` if instances might ever live in different browser tabs/iframes, which is plausible for a future SonoDS surface — implement with `BroadcastChannel` now since it's a strict superset of the same-page case and costs little extra) where each `<sonods-eq>` instance publishes its own smoothed per-band energy snapshot (from its Post analyser, downsampled to a low update rate — a few times per second is enough, do not publish at animation-frame rate) and subscribes to snapshots from other instances.
- **This task explicitly does not require the "real" platform-level session API to exist yet** — build and test it against a mocked set of multiple `<sonods-eq>` instances in the demo app talking to each other, and document in the commit that the real cross-app wiring is a platform-team integration task, not something this component can finish alone.
- **Acceptance Check:** a test with 2+ mocked instances confirms each can see the others' published energy snapshots. Commit as `[6.1] Cross-instance session registry via BroadcastChannel`.

### Task 6.2 — Collision detection + curve overlay

- Given the current instance's own curve and another instance's published snapshot, compute frequency regions where both carry significant energy (a simple threshold-based overlap check to start — this can be made smarter later, but ship the simple correct version first).
- Render this as a soft highlighted region directly on the curve (reuse the existing renderer's frequency-to-x mapping) rather than a separate panel.
- **Acceptance Check:** a test with two mocked instances configured to have overlapping energy at a known frequency confirms the highlighted region appears at the expected x-position. Commit as `[6.2] Cross-track collision detection and on-curve overlay`.

### Task 6.3 — Reference-matching curve generation

- Given a reference audio buffer, compute its spectral balance (reuse the analyser/FFT approach already established) and generate a target EQ curve that would move the current track toward it, subject to a max-boost/cut constraint to avoid extreme over-correction.
- Apply the resulting curve as a smooth animated transition (reuse `SmoothedParam`, but at a longer, deliberately visible time constant — 300-500 ms — so the change is watchable, not an instant jump) rather than snapping bands into place instantly.
- **Acceptance Check:** a test confirms the generated curve genuinely reduces the spectral distance between the processed track and the reference (measure before/after spectral difference, assert it decreased) and that the applied change ramps over the expected duration rather than jumping. Commit as `[6.3] Reference-matching curve generation with animated application`.

### Task 6.4 — Explainability annotations

- Whenever an AI-suggested change is applied (from 6.2 or 6.3), display a short plain-language annotation near the affected part of the curve (a small templated string system is fine — e.g. `"Cut here to make room for {otherTrackLabel} around {freq}Hz"` for collision corrections), dismissible, not persistent clutter.
- **Acceptance Check:** a test confirms an annotation is created with the correct frequency/label substituted when a collision correction or reference match is applied, and that it can be dismissed. Commit as `[6.4] Explainability annotations for AI-suggested changes`. **End of Phase 6.**

---

# PHASE 7 — Packaging & Ship Readiness

**Phase goal:** turn the working, tested module into something any future SonoDS surface (or other web app) can actually `npm install` and use, with the performance/reliability bar from the original spec proven, not assumed.

### Task 7.1 — Finalize the public API

- Consolidate the real public surface of the whole module (likely re-exported from `eq-ui` since that's what a host app actually mounts) to exactly: a `mount(container: HTMLElement): SonodsEqInstance` function, `instance.connect(audioNode: AudioNode)` / `instance.getOutputNode(): AudioNode` for wiring into a host app's Web Audio graph, `instance.getState()` / `instance.setState(state)` for preset save/load, and `instance.on(event, callback)` for state-change notifications a host app's own AI logic can react to.
- Write API documentation (a `README.md` in `eq-ui`) covering exactly this surface — nothing more, nothing internal leaking through.
- **Acceptance Check:** a fresh, minimal example app (add it under `apps/` as `apps/example-consumer`, separate from the dev-only `apps/demo`) built using *only* the documented public API (no reaching into internals) successfully mounts and runs the EQ — this is the real proof of "reusable package," not just a unit test. Commit as `[7.1] Finalized public API + documented example consumer app`.

### Task 7.2 — npm package build configuration

- Configure `eq-ui` (and `eq-engine` if published separately) with a proper library build (e.g. `vite build --mode lib` or `tsup`) producing ESM output, type declarations (`.d.ts`), and correctly inlining or co-locating the `.wasm` asset so consumers don't need to know it exists as a separate build step.
- **Acceptance Check:** `pnpm pack` produces an installable tarball; installing it into a throwaway separate project and importing it works exactly as the README describes. Commit as `[7.2] Library build configuration and packaging verification`.

### Task 7.3 — Benchmark suite

- Build the benchmark matrix from the original spec (band count × phase mode × dynamic on/off × M/S on/off × buffer size) as an automated script producing a results table (CPU%, measured latency) — run it against whatever hardware is actually available and clearly label it as such rather than presenting it as the "minimum spec" number without that context.
- **Acceptance Check:** the benchmark script runs end-to-end and produces a committed results file. Commit as `[7.3] Automated benchmark suite`.

### Task 7.4 — Fuzz/automation stress test

- Build an automated fuzzer that randomly drives the public API (rapid parameter changes, band add/remove, mode switching) for an extended unattended run, watching for thrown errors, audio discontinuities (silence/click detection on rendered output), or memory growth over time (a WASM memory-usage check across a long run, since a subtle leak in the Rust core would show up here before anywhere else).
- **Acceptance Check:** an initial run of at least a few hours (scale up toward the original spec's 500-hour target over subsequent CI runs, not necessarily all in this one task) completes clean. Commit as `[7.4] Automated fuzz/stress test harness`. **End of Phase 7 — the module is now genuinely ready to be depended on by a real SonoDS surface, and the DSP core is proven portable enough that a future native VST build (a separate future effort, per the engineering spec's Appendix B) can compile the same Rust `dsp-core` crate directly rather than starting over.**

---

## APPENDIX — What This Document Deliberately Left for a Human

A few things are called out above as needing a human, not an agent, decision or judgment — collected here so nothing gets missed:

- Task 4.5's visual/vibe sign-off against the reference sketch — subjective, needs a human eye.
- Task 5.2 and 5.3's "does this sound musical, not pumpy/artificial" checks — perceptual, needs a listening pass by an actual mix engineer, not just passing an automated numeric test.
- The real cross-app session API referenced in Task 6.1 — this component can mock and test against its own assumption of that API, but someone on the platform/app side owns actually building it.
- Anything marked `NEEDS HUMAN DECISION:` that may come up during the build that isn't covered by the **Global Fixed Decisions** table.
