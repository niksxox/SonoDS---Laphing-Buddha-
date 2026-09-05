import React, { createContext, useState, useContext } from 'react';

const ProjectContext = createContext();

export const useProject = () => useContext(ProjectContext);

export const ProjectProvider = ({ children }) => {
  // 1. Session Data (Persists across pages)
  const [files, setFiles] = useState({ vocals: null, bass: null, drums: null, other: null });
  const [aiResults, setAiResults] = useState(null);
  
  // 2. Mix State (Volume Faders)
  const [mixSettings, setMixSettings] = useState({ vocals: 0, bass: 0, drums: 0, other: 0 });

  // 3. Effect Chain State (For the new Mixing Page)
  // Each stem gets its own settings object
  const [fxSettings, setFxSettings] = useState({
    vocals: { eq: { low: 0, mid: 0, high: 0 }, comp: { thresh: -20, ratio: 2 }, sat: 0, width: 0, reverb: 0 },
    bass:   { eq: { low: 0, mid: 0, high: 0 }, comp: { thresh: -20, ratio: 4 }, sat: 0, width: 0, reverb: 0 },
    drums:  { eq: { low: 0, mid: 0, high: 0 }, comp: { thresh: -20, ratio: 3 }, sat: 0, width: 0, reverb: 0 },
    other:  { eq: { low: 0, mid: 0, high: 0 }, comp: { thresh: -20, ratio: 2 }, sat: 0, width: 0, reverb: 0 },
  });

  // 4. Reset Function (New Session)
  const resetSession = () => {
    setFiles({ vocals: null, bass: null, drums: null, other: null });
    setAiResults(null);
    setMixSettings({ vocals: 0, bass: 0, drums: 0, other: 0 });
    // Reset FX...
  };

  const isSessionActive = () => aiResults !== null;

  return (
    <ProjectContext.Provider value={{
      files, setFiles,
      aiResults, setAiResults,
      mixSettings, setMixSettings,
      fxSettings, setFxSettings,
      resetSession,
      isSessionActive
    }}>
      {children}
    </ProjectContext.Provider>
  );
};