import React, { useState, useCallback, useRef } from 'react';

// Bus color palette for classification display
const BUS_COLORS_AUTO = {
  Vocals: '#a78bfa',
  Drums: '#f87171',
  Bass: '#34d399',
  Instruments: '#60a5fa',
  FX: '#fbbf24',
  Unclassified: '#94a3b8',
};

const BUS_COLORS_LEARN = {
  Vocals: '#334155',
  Drums: '#334155',
  Bass: '#475569',
  Instruments: '#1E293B',
  FX: '#475569',
  Unclassified: '#1E293B',
};

const StemInjectionScreen = ({ onProceed, mode }) => {
  const [phase, setPhase] = useState('idle'); // idle | uploading | classifying | done | error
  const [classified, setClassified] = useState([]);
  const [analyzing, setAnalyzing] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [totalFiles, setTotalFiles] = useState(0);
  const [mixResult, setMixResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFiles = useCallback((files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setTotalFiles(fileArray.length);
    setPhase('uploading');
    setUploadProgress(0);
    setClassified([]);
    setAnalyzing(null);
    setErrorMessage('');

    // Build multipart/form-data
    const formData = new FormData();
    fileArray.forEach((file) => {
      formData.append(file.name, file, file.name);
    });

    // Use XMLHttpRequest for upload progress tracking
    const xhr = new XMLHttpRequest();
    const apiHost = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    xhr.open('POST', `http://${apiHost}:5000/mix-v2`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(pct);
      }
    });

    xhr.upload.addEventListener('load', () => {
      // Upload complete, backend is now processing
      setUploadProgress(100);
      setPhase('classifying');
      // Animate classification display for user feedback
      runClassificationAnimation(fileArray);
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        try {
          const result = JSON.parse(xhr.responseText);
          if (result.status === 'success') {
            setMixResult(result);
            // Replace animation data with real classified data
            const realClassified = (result.tracks || []).map((track) => ({
              id: track.id || track.filename,
              filename: track.filename,
              displayName: track.role_display || track.role || track.filename,
              bus: track.bus || 'Unclassified',
              role: track.role,
              confidence: track.confidence,
            }));
            setClassified(realClassified);
            setAnalyzing(null);
            setPhase('done');
          } else {
            setErrorMessage(result.error || 'Unknown error from server');
            setPhase('error');
          }
        } catch (parseErr) {
          setErrorMessage('Failed to parse server response');
          setPhase('error');
        }
      } else {
        try {
          const errBody = JSON.parse(xhr.responseText);
          setErrorMessage(errBody.error || `Server returned ${xhr.status}`);
        } catch {
          setErrorMessage(`Server returned ${xhr.status}`);
        }
        setPhase('error');
      }
    });

    xhr.addEventListener('error', () => {
      setErrorMessage('Network error — is the Flask server running on port 5000?');
      setPhase('error');
    });

    xhr.addEventListener('timeout', () => {
      setErrorMessage('Request timed out. Try smaller files or fewer stems.');
      setPhase('error');
    });

    xhr.timeout = 120000; // 2 minute timeout
    xhr.send(formData);
  }, []);

  // Animate file names appearing during server processing
  const runClassificationAnimation = (fileArray) => {
    fileArray.forEach((file, index) => {
      const delay = 200 + (index * 350);
      setTimeout(() => {
        setAnalyzing(file.name);
      }, delay);

      setTimeout(() => {
        setAnalyzing(null);
        setClassified(prev => {
          // Don't add if the real result already arrived and replaced us
          if (prev.length >= fileArray.length) return prev;
          return [...prev, {
            id: file.name,
            filename: file.name,
            displayName: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
            bus: 'Analyzing...',
          }];
        });
      }, delay + 280);
    });
  };

  const handleProceed = useCallback(() => {
    onProceed(mixResult);
  }, [onProceed, mixResult]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleFileInput = (e) => {
    handleFiles(e.target.files);
  };

  // Calculate progress
  const progress = totalFiles > 0
    ? (classified.length / totalFiles) * 100
    : 0;

  // Group classified stems by bus
  const busGroups = {};
  classified.forEach(stem => {
    const bus = stem.bus || 'Unclassified';
    if (!busGroups[bus]) busGroups[bus] = [];
    busGroups[bus].push(stem);
  });

  const busColors = mode === 'learn' ? BUS_COLORS_LEARN : BUS_COLORS_AUTO;

  const queued = totalFiles - classified.length - (analyzing ? 1 : 0);

  return (
    <div style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      color: 'var(--text-main)',
      position: 'relative',
      zIndex: 1,
      padding: '0 20px',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '12px',
        borderBottom: '0.5px solid var(--separator-color)',
        marginBottom: '16px',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{
            margin: 0,
            fontSize: '14px',
            letterSpacing: '3px',
            color: 'var(--text-dim)',
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
          }}>
            STEM INJECTION
          </h2>
        </div>
        <div style={{
          fontSize: '10px',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '1px',
           color: phase === 'done' ? (mode === 'learn' ? 'var(--accent)' : '#22c55e') : phase === 'error' ? '#ef4444' : 'var(--text-dim)',
        }}>
          {phase === 'idle' && 'READY // AWAITING INPUT'}
          {phase === 'uploading' && `UPLOADING... ${uploadProgress}%`}
          {phase === 'classifying' && `ANALYZING... ${classified.length}/${totalFiles}`}
          {phase === 'done' && `✓ ${classified.length} STEMS CLASSIFIED`}
          {phase === 'error' && '✗ ERROR'}
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
        
        {/* Drop zone — only when idle or error */}
        {(phase === 'idle' || phase === 'error') && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
              border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--separator-color)'}`,
              borderRadius: '16px',
              padding: '48px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              background: isDragOver ? 'var(--card-hover-bg)' : 'var(--card-bg)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              flex: 1,
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              id="stem-file-input"
              type="file"
              multiple
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: mode === 'learn' ? 'rgba(137, 143, 101, 0.15)' : 'rgba(167,139,250,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              color: 'var(--accent)',
            }}>
              ↑
            </div>
            <p style={{
              fontSize: '13px',
              color: 'var(--text-dim)',
              letterSpacing: '2px',
              fontWeight: 600,
              margin: 0,
              fontFamily: "'Inter', sans-serif",
            }}>
              DROP STEMS HERE
            </p>
            <p style={{
              fontSize: '10px',
              color: 'var(--text-dim)',
              opacity: 0.7,
              letterSpacing: '1px',
              margin: 0,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              WAV / MP3 / FLAC — Unlimited stems
            </p>
            {phase === 'error' && (
              <div style={{
                marginTop: '8px',
                padding: '10px 16px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.5px',
                maxWidth: '400px',
                textAlign: 'center',
              }}>
                {errorMessage}
              </div>
            )}
          </div>
        )}

        {/* Uploading phase */}
        {phase === 'uploading' && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: `3px solid ${mode === 'learn' ? 'rgba(137, 143, 101, 0.3)' : 'rgba(167,139,250,0.2)'}`,
              borderTop: `3px solid ${mode === 'learn' ? 'var(--accent)' : '#a78bfa'}`,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{
              fontSize: '12px',
              letterSpacing: '3px',
              color: 'var(--text-dim)',
              fontFamily: "'Inter', sans-serif",
            }}>
              UPLOADING {totalFiles} STEM{totalFiles !== 1 ? 'S' : ''}...
            </p>
            {/* Upload progress bar */}
            <div style={{
              width: '200px',
              height: '4px',
              background: 'var(--card-border)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${uploadProgress}%`,
                background: mode === 'learn' ? 'var(--text-dim)' : 'linear-gradient(90deg, #a78bfa, #c084fc)',
                borderRadius: '2px',
                transition: 'width 0.3s ease-out',
              }} />
            </div>
          </div>
        )}

        {/* Classifying / Done phases */}
        {(phase === 'classifying' || phase === 'done') && (
          <>
            {/* Progress bar */}
            <div style={{
              height: '4px',
              background: 'var(--card-border)',
              borderRadius: '2px',
              overflow: 'hidden',
              flexShrink: 0,
            }}>
              <div style={{
                height: '100%',
                width: `${phase === 'done' ? 100 : progress}%`,
                background: phase === 'done' 
                  ? (mode === 'learn' ? 'var(--luna-gradient)' : 'linear-gradient(90deg, #4ade80, #34d399)') 
                  : (mode === 'learn' ? 'var(--text-dim)' : 'linear-gradient(90deg, #a78bfa, #c084fc)'),
                borderRadius: '2px',
                transition: 'width 0.4s ease-out',
              }} />
            </div>

            {/* Counter */}
            <div style={{
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '1px',
              color: 'var(--text-dim)',
              display: 'flex',
              gap: '16px',
              flexShrink: 0,
            }}>
              <span style={{ color: mode === 'learn' ? 'var(--accent)' : '#4ade80' }}>{classified.length} classified</span>
            {analyzing && <span style={{ color: mode === 'learn' ? 'var(--danger-color)' : '#fbbf24' }}>1 analyzing</span>}
              {queued > 0 && <span>{queued} queued</span>}
            </div>

            {/* Bus groups */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              flex: 1,
              alignContent: 'flex-start',
              overflow: 'auto',
            }}>
              {Object.entries(busGroups).map(([bus, stems]) => (
                <div key={bus} style={{
                  background: 'var(--card-bg)',
                  border: '0.5px solid var(--card-border)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  minWidth: '120px',
                  animation: 'fadeSlideIn 0.4s ease-out',
                }}>
                  <div style={{
                    fontSize: '8px',
                    letterSpacing: '2px',
                    color: busColors[bus] || busColors['Unclassified'] || '#a78bfa',
                    fontWeight: 700,
                    marginBottom: '8px',
                    fontFamily: "'Inter', sans-serif",
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <div style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: busColors[bus] || busColors['Unclassified'] || '#a78bfa',
                    }} />
                    {bus.toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {stems.map(stem => (
                      <div key={stem.id} style={{
                        fontSize: '10px',
                        color: mode === 'learn' ? '#1E293B' : 'var(--text-dim)',
                        fontWeight: mode === 'learn' ? 600 : 400,
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: '4px 8px',
                        background: mode === 'learn' ? 'rgba(255,255,255,0.4)' : 'var(--card-hover-bg)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}>
                        <span style={{ color: mode === 'learn' ? '#334155' : '#4ade80', fontSize: '8px' }}>✓</span>
                        {stem.displayName}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Currently analyzing stem */}
              {analyzing && (
                <div style={{
                  background: mode === 'learn' ? 'rgba(188, 212, 230, 0.08)' : 'rgba(251,191,36,0.06)',
                  border: `0.5px solid ${mode === 'learn' ? 'rgba(188, 212, 230, 0.3)' : 'rgba(251,191,36,0.2)'}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  minWidth: '120px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: mode === 'learn' ? 'var(--accent)' : '#fbbf24',
                    animation: 'pulse 1s infinite',
                  }} />
                  <span style={{
                    fontSize: '10px',
                    color: mode === 'learn' ? 'var(--accent)' : '#fbbf24',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    Analyzing...
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Proceed button — only when done */}
      {phase === 'done' && (
        <div style={{
          flexShrink: 0,
          padding: '16px 0',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <button
            onClick={handleProceed}
            style={{
              padding: '14px 48px',
              background: mode === 'learn' ? 'rgba(255, 255, 255, 0.75)' : 'linear-gradient(135deg, #4ade80, #34d399)',
              border: mode === 'learn' ? '1px solid rgba(255, 255, 255, 0.9)' : 'none',
              borderRadius: '10px',
              color: mode === 'learn' ? '#0F172A' : '#0f172a',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '3px',
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
              backdropFilter: mode === 'learn' ? 'blur(12px)' : 'none',
              boxShadow: mode === 'learn' ? '0 4px 16px rgba(0,0,0,0.1)' : '0 8px 24px rgba(74,222,128,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.background = mode === 'learn' ? 'rgba(255, 255, 255, 0.95)' : 'linear-gradient(135deg, #4ade80, #34d399)';
              e.target.style.boxShadow = mode === 'learn' ? '0 8px 24px rgba(0,0,0,0.15)' : '0 12px 32px rgba(74,222,128,0.4)';
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.background = mode === 'learn' ? 'rgba(255, 255, 255, 0.75)' : 'linear-gradient(135deg, #4ade80, #34d399)';
              e.target.style.boxShadow = mode === 'learn' ? '0 4px 16px rgba(0,0,0,0.1)' : '0 8px 24px rgba(74,222,128,0.3)';
            }}
          >
            PROCEED TO MIX →
          </button>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}
      </style>
    </div>
  );
};

export default StemInjectionScreen;
