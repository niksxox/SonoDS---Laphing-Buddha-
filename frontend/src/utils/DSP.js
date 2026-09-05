// frontend/src/utils/DSP.js

export const DSP = {
  // --- SATURATION (Harmonic Generation) ---
  // Creates a transfer function for the WaveShaperNode
  makeDistortionCurve: (amount, type = 'tape') => {
    const drive = typeof amount === 'number' ? Math.max(0, amount) : 0;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);

    if (drive <= 0.0001) {
      for (let i = 0; i < n_samples; ++i) {
        curve[i] = (i * 2) / n_samples - 1;
      }
      return curve;
    }

    // Normalized drive parameter factor
    const k = drive <= 1.0 ? drive * 30 : (drive / 100) * 30;

    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1; // input in [-1, 1]

      if (type === 'tube' || type === 'valve') {
        // Asymmetric tube saturation (rich 2nd + 3rd order harmonics)
        const drivenX = x * (1 + k * 0.9);
        if (drivenX >= 0) {
          curve[i] = (1 - Math.exp(-drivenX)) / (1 - Math.exp(-(1 + k * 0.9)));
        } else {
          curve[i] = -(1 - Math.exp(drivenX * 0.7)) / (1 - Math.exp(-(1 + k * 0.9) * 0.7));
        }
      } else if (type === 'fuzz' || type === 'hard' || type === 'modern') {
        // Harder saturation with sharp onset
        const drivenX = x * (1 + k * 1.5);
        curve[i] = Math.max(-1, Math.min(1, Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, drivenX)))));
      } else {
        // Default tape / warm saturation (hyperbolic tangent soft-clip)
        const drivenX = x * (1 + k);
        curve[i] = Math.tanh(drivenX) / Math.max(0.001, Math.tanh(1 + k));
      }
    }
    return curve;
  },

  // --- REVERB (Impulse Response Generator) ---
  // Simulates a clean room impulse response without external audio files
  createImpulse: (duration, decay, ctx) => {
    const length = Math.floor(ctx.sampleRate * duration);
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
