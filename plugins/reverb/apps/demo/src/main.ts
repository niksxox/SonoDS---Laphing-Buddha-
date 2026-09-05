/**
 * SonoDS Reverb — Interactive Plugin Demo Application
 * Connects Web Audio synthesizer source -> Reverb Engine WASM -> Web Component UI.
 */

import { ReverbEngine } from '@sonods/reverb-engine';
import '@sonods/reverb-ui';

let audioContext: AudioContext | null = null;
let reverbEngine: ReverbEngine | null = null;
let activeOscillator: OscillatorNode | null = null;
let activeGain: GainNode | null = null;
let isPlaying = false;
let loopInterval: any = null;

const startAudioBtn = document.getElementById('startAudioBtn') as HTMLButtonElement;
const stopAudioBtn = document.getElementById('stopAudioBtn') as HTMLButtonElement;
const audioSourceSelect = document.getElementById('audioSourceSelect') as HTMLSelectElement;
const statusText = document.getElementById('statusText') as HTMLElement;
const pluginElem = document.getElementById('reverbPlugin') as any;

async function initAudio() {
  if (audioContext) {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    return;
  }

  audioContext = new AudioContext();
  statusText.textContent = `Audio Context: Running (${audioContext.sampleRate} Hz)`;

  // Attach engine to Web Component UI
  if (pluginElem) {
    console.log('AudioContext ready:', audioContext.sampleRate);
  }
}

function playSound() {
  if (!audioContext) return;
  stopSound();
  isPlaying = true;

  const sourceType = audioSourceSelect?.value || 'impulse';

  if (sourceType === 'impulse') {
    playPluckImpulse();
    loopInterval = setInterval(() => playPluckImpulse(), 1200);
  } else if (sourceType === 'drums') {
    playDrumPattern();
    loopInterval = setInterval(() => playDrumPattern(), 1600);
  } else if (sourceType === 'synth') {
    playAmbientSynth();
  } else if (sourceType === 'noise') {
    playNoiseBurst();
    loopInterval = setInterval(() => playNoiseBurst(), 1500);
  }
}

function stopSound() {
  isPlaying = false;
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
  if (activeOscillator) {
    try {
      activeOscillator.stop();
    } catch {}
    activeOscillator = null;
  }
  if (activeGain) {
    activeGain.disconnect();
    activeGain = null;
  }
}

function playPluckImpulse() {
  if (!audioContext) return;

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  const freqs = [220, 330, 440, 550, 660];
  const f = freqs[Math.floor(Math.random() * freqs.length)];

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f, audioContext.currentTime);

  gain.gain.setValueAtTime(0.6, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);

  osc.connect(gain);
  if (reverbEngine) {
    gain.connect(reverbEngine.inputNode);
  } else {
    gain.connect(audioContext.destination);
  }

  osc.start();
  osc.stop(audioContext.currentTime + 0.16);
}

function playDrumPattern() {
  if (!audioContext) return;

  // Kick
  const kickOsc = audioContext.createOscillator();
  const kickGain = audioContext.createGain();
  kickOsc.frequency.setValueAtTime(150, audioContext.currentTime);
  kickOsc.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.1);
  kickGain.gain.setValueAtTime(0.8, audioContext.currentTime);
  kickGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
  kickOsc.connect(kickGain);
  if (reverbEngine) kickGain.connect(reverbEngine.inputNode);
  else kickGain.connect(audioContext.destination);
  kickOsc.start();
  kickOsc.stop(audioContext.currentTime + 0.13);

  // Snare at +400ms
  setTimeout(() => {
    if (!audioContext || !isPlaying) return;
    const snareOsc = audioContext.createOscillator();
    const snareGain = audioContext.createGain();
    snareOsc.type = 'triangle';
    snareOsc.frequency.setValueAtTime(250, audioContext.currentTime);
    snareGain.gain.setValueAtTime(0.7, audioContext.currentTime);
    snareGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
    snareOsc.connect(snareGain);
    if (reverbEngine) snareGain.connect(reverbEngine.inputNode);
    else snareGain.connect(audioContext.destination);
    snareOsc.start();
    snareOsc.stop(audioContext.currentTime + 0.21);
  }, 400);
}

function playAmbientSynth() {
  if (!audioContext) return;

  const osc1 = audioContext.createOscillator();
  const osc2 = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc1.type = 'sawtooth';
  osc2.type = 'sawtooth';
  osc1.frequency.setValueAtTime(130.81, audioContext.currentTime); // C3
  osc2.frequency.setValueAtTime(196.00, audioContext.currentTime); // G3

  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.5);

  osc1.connect(gain);
  osc2.connect(gain);

  if (reverbEngine) gain.connect(reverbEngine.inputNode);
  else gain.connect(audioContext.destination);

  osc1.start();
  osc2.start();

  activeOscillator = osc1;
  activeGain = gain;
}

function playNoiseBurst() {
  if (!audioContext) return;

  const bufferSize = audioContext.sampleRate * 0.1; // 100ms noise
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = buffer;
  const gain = audioContext.createGain();

  gain.gain.setValueAtTime(0.5, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.09);

  noise.connect(gain);
  if (reverbEngine) gain.connect(reverbEngine.inputNode);
  else gain.connect(audioContext.destination);

  noise.start();
}

startAudioBtn?.addEventListener('click', async () => {
  await initAudio();
  playSound();
});

stopAudioBtn?.addEventListener('click', () => {
  stopSound();
});
