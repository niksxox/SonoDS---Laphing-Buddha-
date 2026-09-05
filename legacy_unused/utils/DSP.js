// src/utils/DSP.js

export const DSP = {
  // --- SATURATION (Harmonic Generation) ---
  // Creates a transfer function for the WaveShaperNode
  makeDistortionCurve: (amount, type = 'tape') => {
    const k = typeof amount === 'number' ? amount : 0;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;

    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      
      if (type === 'tape') {
        // Odd Harmonics (Warmth/Tape) - Soft Clipping
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      } else {
        // Even Harmonics (Tube) - Asymmetric
        curve[i] = Math.min(1, Math.max(-1, x + (0.5 * x * x))); 
      }
    }
    return curve;
  },

  // --- REVERB (Impulse Response Generator) ---
  // Simulates a clean room without needing external files
  createImpulse: (duration, decay, ctx) => {
    const length = ctx.sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      // Exponential decay
      const n = i / length;
      const vol = Math.pow(1 - n, decay);
      
      left[i] = (Math.random() * 2 - 1) * vol;
      right[i] = (Math.random() * 2 - 1) * vol;
    }
    return impulse;
  }
};