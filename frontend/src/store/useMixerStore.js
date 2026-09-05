import { create } from 'zustand';

const defaultFxForStem = (stem) => {
  const eqBands = stem?.eq?.bands || [];
  const lowGain = eqBands[0]?.gain_db || 0;
  const midGain = eqBands[1]?.gain_db || 0;
  const highGain = eqBands[2]?.gain_db || 0;

  const comp = stem?.compressor || {};
  const sends = stem?.sends || {};

  return {
    eq: { low: lowGain, mid: midGain, high: highGain },
    comp: {
      thresh: comp.threshold_db ?? -16,
      ratio: comp.ratio ?? 3,
      makeup: comp.makeup_gain_db ?? 0,
    },
    sat: stem?.saturation ?? 0,
    sends: {
      reverb: sends.reverb ?? 0.1,
      delay: sends.delay ?? 0.05,
    },
  };
};

// Default empty FX rack: 8 insert slots per track (FL Studio style)
const createEmptySlots = () =>
  Array.from({ length: 8 }, (_, i) => ({
    slotIndex: i,
    pluginType: null,   // null | 'eq' | 'compressor' | 'saturator'
    enabled: true,
    params: {},
  }));

const useMixerStore = create((set, get) => ({
  selectedStemId: null,
  mutedStems: new Set(),
  soloedStemId: null,
  isPlaying: false,
  currentGains: {},  // stemId → current dB value
  bypass: false,

  // FX settings per stem: stemId → { eq: {low, mid, high}, comp: {thresh, ratio, makeup}, sat: number, sends: {reverb, delay} }
  fxSettings: {},

  // ─── FX Rack Slot State ───
  // Per-stem insert FX rack: stemId → [ { slotIndex, pluginType, enabled, params } ]
  fxSlots: {},

  // Currently open plugin window: { stemId, slotIndex, pluginType } or null
  openPluginWindow: null,

  // Dynamic stem configuration from /mix-v2 API response.
  activeStemConfig: null,
  mixResponse: null,  // Full raw API response from /mix-v2

  setActiveStemConfig: (config) => {
    // Initialize fxSettings and fxSlots for all stems from API config
    const initialFx = {};
    const initialSlots = {};
    if (Array.isArray(config)) {
      config.forEach((stem) => {
        initialFx[stem.id] = defaultFxForStem(stem);
        initialSlots[stem.id] = createEmptySlots();
      });
    }
    set({ activeStemConfig: config, fxSettings: initialFx, fxSlots: initialSlots });
  },

  setMixResponse: (response) => set({ mixResponse: response }),

  // ─── FX Rack Slot Actions ───
  setSlotPlugin: (stemId, slotIndex, pluginType) => {
    const { fxSlots } = get();
    const slots = [...(fxSlots[stemId] || createEmptySlots())];
    slots[slotIndex] = { ...slots[slotIndex], pluginType, enabled: true, params: {} };
    set({ fxSlots: { ...fxSlots, [stemId]: slots } });
  },

  toggleSlotBypass: (stemId, slotIndex) => {
    const { fxSlots } = get();
    const slots = [...(fxSlots[stemId] || createEmptySlots())];
    slots[slotIndex] = { ...slots[slotIndex], enabled: !slots[slotIndex].enabled };
    set({ fxSlots: { ...fxSlots, [stemId]: slots } });
  },

  clearSlot: (stemId, slotIndex) => {
    const { fxSlots, openPluginWindow } = get();
    const slots = [...(fxSlots[stemId] || createEmptySlots())];
    slots[slotIndex] = { slotIndex, pluginType: null, enabled: true, params: {} };
    const updates = { fxSlots: { ...fxSlots, [stemId]: slots } };
    // Close plugin window if this slot was open
    if (openPluginWindow && openPluginWindow.stemId === stemId && openPluginWindow.slotIndex === slotIndex) {
      updates.openPluginWindow = null;
    }
    set(updates);
  },

  openPlugin: (stemId, slotIndex, pluginType) => {
    set({ openPluginWindow: { stemId, slotIndex, pluginType } });
  },

  closePlugin: () => {
    set({ openPluginWindow: null });
  },

  // Ensure fxSlots are initialized for a stem (called during audio engine init)
  ensureSlotsForStem: (stemId) => {
    const { fxSlots } = get();
    if (!fxSlots[stemId]) {
      set({ fxSlots: { ...fxSlots, [stemId]: createEmptySlots() } });
    }
  },

  setFxParam: (stemId, module, value) => {
    const { fxSettings } = get();
    const currentStemFx = fxSettings[stemId] || defaultFxForStem();
    set({
      fxSettings: {
        ...fxSettings,
        [stemId]: {
          ...currentStemFx,
          [module]: value,
        },
      },
    });
  },

  // Reset mixer state for a new session
  resetMixer: () => set({
    selectedStemId: null,
    mutedStems: new Set(),
    soloedStemId: null,
    isPlaying: false,
    currentGains: {},
    fxSettings: {},
    fxSlots: {},
    openPluginWindow: null,
    bypass: false,
  }),

  selectStem: (stemId) => set({ selectedStemId: stemId }),

  // Update specific FX module parameter and trigger real-time Web Audio API update
  updateFx: (stemId, module, param, value, audioEngine) => {
    const { fxSettings } = get();
    const currentStemFx = fxSettings[stemId] || defaultFxForStem();

    let updatedStemFx;
    if (module === 'eq') {
      updatedStemFx = {
        ...currentStemFx,
        eq: { ...currentStemFx.eq, [param]: value },
      };
    } else if (module === 'comp') {
      updatedStemFx = {
        ...currentStemFx,
        comp: { ...currentStemFx.comp, [param]: value },
      };
    } else if (module === 'sat') {
      updatedStemFx = {
        ...currentStemFx,
        sat: value,
      };
    } else if (module === 'sends') {
      updatedStemFx = {
        ...currentStemFx,
        sends: { ...currentStemFx.sends, [param]: value },
      };
    } else {
      updatedStemFx = currentStemFx;
    }

    set({
      fxSettings: {
        ...fxSettings,
        [stemId]: updatedStemFx,
      },
    });

    if (audioEngine && typeof audioEngine.updateTrackFx === 'function') {
      audioEngine.updateTrackFx(stemId, updatedStemFx);
    }
  },

  toggleMute: (stemId, audioEngine) => {
    const { mutedStems, soloedStemId } = get();
    const next = new Set(mutedStems);
    if (next.has(stemId)) {
      next.delete(stemId);
      if (!soloedStemId || soloedStemId === stemId) {
        audioEngine.setChannelGain(stemId, get().currentGains[stemId] ?? 0);
      }
    } else {
      next.add(stemId);
      audioEngine.setChannelGain(stemId, -Infinity);
    }
    set({ mutedStems: next });
  },

  toggleSolo: (stemId, audioEngine, allStems) => {
    const { soloedStemId } = get();
    if (soloedStemId === stemId) {
      set({ soloedStemId: null });
      const { mutedStems } = get();
      allStems.forEach((s) => {
        if (mutedStems.has(s.id)) {
          audioEngine.setChannelGain(s.id, -Infinity);
        } else {
          audioEngine.setChannelGain(s.id, get().currentGains[s.id] ?? s.initialDB);
        }
      });
    } else {
      set({ soloedStemId: stemId });
      allStems.forEach((s) => {
        if (s.id !== stemId) {
          audioEngine.setChannelGain(s.id, -Infinity);
        } else {
          audioEngine.setChannelGain(s.id, get().currentGains[s.id] ?? s.initialDB);
        }
      });
    }
  },

  setGain: (stemId, dB) => {
    set((state) => ({ currentGains: { ...state.currentGains, [stemId]: dB } }));
  },

  setPlaying: (val) => set({ isPlaying: val }),

  toggleBypass: (audioEngine, allStems) => {
    const { bypass } = get();
    const newBypass = !bypass;

    const newGains = {};
    allStems.forEach((stem) => {
      const targetDB = newBypass ? 0 : stem.initialDB;
      newGains[stem.id] = targetDB;
      audioEngine.setChannelGain(stem.id, targetDB);
    });

    set({ bypass: newBypass, currentGains: newGains });
  },
}));

export default useMixerStore;
