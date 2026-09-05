import { SonodsImagerNode, loadWasmModule } from '@sonods/imager-engine';

let audioContext: AudioContext | null = null;
let imagerNode: SonodsImagerNode | null = null;
let synthOsc1: OscillatorNode | null = null;
let synthOsc2: OscillatorNode | null = null;
let isPlaying = false;

const appDiv = document.querySelector<HTMLDivElement>('#app') || document.body;
appDiv.innerHTML = `
  <div style="font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; max-width: 600px; margin: 2rem auto; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    <h2 style="color: #38bdf8; margin-top: 0;">SonoDS Stereo Imager — Demo</h2>
    <div style="margin-bottom: 1.5rem;">
      <button id="toggleAudio" style="background: #38bdf8; color: #0f172a; border: none; padding: 0.75rem 1.5rem; font-weight: bold; border-radius: 6px; cursor: pointer;">Start Audio Synth</button>
    </div>
    <div style="background: #1e293b; padding: 1.25rem; border-radius: 8px; margin-bottom: 1rem;">
      <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Stereo Width Control: <span id="widthVal">1.0</span></label>
      <input type="range" id="widthSlider" min="0" max="2" step="0.05" value="1.0" style="width: 100%; accent-color: #38bdf8;" />
    </div>
    <div style="background: #1e293b; padding: 1rem; border-radius: 8px;">
      <div style="font-size: 0.9rem; color: #94a3b8;">Telemetry Correlation Readout: <strong id="corrVal" style="color: #4ade80;">+1.00</strong></div>
    </div>
  </div>
`;

async function initAudio() {
  if (audioContext) return;
  audioContext = new AudioContext();

  const wasmRes = await fetch('/pkg/dsp_core_bg.wasm');
  const wasmBytes = await wasmRes.arrayBuffer();

  imagerNode = await SonodsImagerNode.create(audioContext, wasmBytes);

  // Create stereo test synth: L = 220Hz, R = 224Hz (subtle stereo beating)
  const merger = audioContext.createChannelMerger(2);

  synthOsc1 = audioContext.createOscillator();
  synthOsc1.frequency.value = 220;
  synthOsc1.connect(merger, 0, 0);

  synthOsc2 = audioContext.createOscillator();
  synthOsc2.frequency.value = 224;
  synthOsc2.connect(merger, 0, 1);

  merger.connect(imagerNode);
  imagerNode.connect(audioContext.destination);

  imagerNode.onTelemetry((telemetry) => {
    const corrEl = document.querySelector('#corrVal');
    if (corrEl) {
      corrEl.textContent = (telemetry.overallCorrelation >= 0 ? '+' : '') + telemetry.overallCorrelation.toFixed(2);
    }
  });

  synthOsc1.start();
  synthOsc2.start();
  isPlaying = true;
}

const toggleBtn = document.querySelector('#toggleAudio')!;
toggleBtn.addEventListener('click', async () => {
  if (!audioContext) {
    await initAudio();
    toggleBtn.textContent = 'Pause Audio Synth';
  } else if (audioContext.state === 'running') {
    await audioContext.suspend();
    toggleBtn.textContent = 'Resume Audio Synth';
  } else {
    await audioContext.resume();
    toggleBtn.textContent = 'Pause Audio Synth';
  }
});

const widthSlider = document.querySelector<HTMLInputElement>('#widthSlider')!;
widthSlider.addEventListener('input', () => {
  const val = parseFloat(widthSlider.value);
  document.querySelector('#widthVal')!.textContent = val.toFixed(2);
  if (imagerNode) {
    imagerNode.setBandWidth(0, val);
    imagerNode.setBandWidth(1, val);
    imagerNode.setBandWidth(2, val);
    imagerNode.setBandWidth(3, val);
  }
});
