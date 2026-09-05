import React from 'react';
import Knob from '../Knob';

export default function MixingTools() {
  return (
    <div className="vst-screen-content">
      <h2 className="vst-title">MIXING TOOLS // ANALOG GEAR</h2>
      <div className="tools-layout">
        <div className="tool-section">
          <h3>EQUALIZER</h3>
          <div className="knob-row">
            <Knob label="LOW" value={0} color="#3b82f6" />
            <Knob label="MID" value={0} color="#3b82f6" />
            <Knob label="HIGH" value={0} color="#3b82f6" />
          </div>
        </div>
      </div>
      <button className="analyze-btn" onClick={() => window.history.back()}>
        BACK TO HUB
      </button>
    </div>
  );
}