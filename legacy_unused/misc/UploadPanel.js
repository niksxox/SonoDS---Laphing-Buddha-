import React, { useState } from "react";
import axios from "axios";
// We don't need the old './styles.css' anymore if you moved everything to VstStyles.css
// or just ensure VstStyles.css is imported in App.js

export default function UploadPanel() {
  const [files, setFiles] = useState({
    vocals: null,
    bass: null,
    drums: null,
    other: null,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e, stem) => {
    setFiles({ ...files, [stem]: e.target.files[0] });
  };

  const handleSubmit = async () => {
    if (!files.vocals || !files.bass || !files.drums || !files.other) {
      alert("SYSTEM ERROR: Please mount all 4 audio stems.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    Object.entries(files).forEach(([key, file]) => {
      formData.append(key, file);
    });

    try {
      // CHANGE THIS URL TO YOUR BACKEND IF NEEDED
      const res = await axios.post("http://127.0.0.1:5000/analyze", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (err) {
      alert("PROCESSING ERROR: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vst-screen-content">
      <h2 className="vst-title">
        {loading ? "ANALYZING SPECTRAL DATA..." : "LOAD STEMS FOR ANALYSIS"}
      </h2>

      {/* THE INPUT SLOTS */}
      <div className="slot-grid">
        {["vocals", "bass", "drums", "other"].map((stem) => (
          <div key={stem} className="file-slot">
            <label>{stem} INPUT</label>
            <input 
              type="file" 
              accept="audio/*" 
              className="custom-file-input"
              onChange={(e) => handleFileChange(e, stem)} 
            />
            {/* Show loaded filename if exists */}
            {files[stem] && (
                <span style={{color: '#4ade80', fontSize: '0.7rem', marginTop: '5px'}}>
                    ✓ {files[stem].name.substring(0, 15)}...
                </span>
            )}
          </div>
        ))}
      </div>

      {/* THE BIG BUTTON */}
      <button className="analyze-btn" onClick={handleSubmit} disabled={loading}>
        {loading ? "PROCESSING..." : "INITIALIZE AI MIX"}
      </button>

      {/* THE RESULTS DISPLAY */}
      {result && (
        <div className="results-console">
          <div className="console-line">
            <span>VOCAL LEVEL</span>
            <span>{result.vocals_gain.toFixed(2)} dB</span>
          </div>
          <div className="console-line">
            <span>BASS LEVEL</span>
            <span>{result.bass_gain.toFixed(2)} dB</span>
          </div>
          <div className="console-line">
            <span>DRUM LEVEL</span>
            <span>{result.drums_gain.toFixed(2)} dB</span>
          </div>
          <div className="console-line">
            <span>OTHER LEVEL</span>
            <span>{result.other_gain.toFixed(2)} dB</span>
          </div>
        </div>
      )}
    </div>
  );
}