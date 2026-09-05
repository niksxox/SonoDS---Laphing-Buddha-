import React, { useEffect, useState, useRef } from 'react';
import { SonodsSaturatorNode } from '@sonods/sat-engine';
import { SonodsSaturatorPlugin } from '@sonods/sat-ui';
import './style.css';

export const App: React.FC = () => {
  const [node, setNode] = useState<SonodsSaturatorNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Read URL query params for track name
  const queryParams = new URLSearchParams(window.location.search);
  const trackName = queryParams.get('trackName') || 'Track 1';
  const stemId = queryParams.get('stemId') || 'track';

  useEffect(() => {
    const audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioCtxRef.current = audioCtx;
    const satNode = new SonodsSaturatorNode(audioCtx);

    satNode.whenReady().then(() => {
      setNode(satNode);

      // Subscribe to parameter changes and sync to parent SonoDS DAW
      satNode.subscribe((state) => {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              type: 'SONODS_PLUGIN_PARAM_CHANGE',
              plugin: 'saturator',
              stemId,
              state: {
                sat: state.drive,
                saturator: {
                  drive: state.drive,
                  char: state.character,
                  tone: state.tone,
                  outGain: state.outputGain,
                  mix: state.mix,
                  autoGain: state.autoGain,
                  quality: state.quality,
                },
              },
            },
            '*'
          );
        }
      });
    });

    // Listen for live audio stream frames from the main DAW
    const handleAudioStream = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'AUDIO_STREAM_FRAME' || !e.data.timeDomain) return;
      if (!satNode || !audioCtx) return;

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const floatArray = new Float32Array(e.data.timeDomain);
      if (floatArray.length > 0) {
        try {
          const buffer = audioCtx.createBuffer(1, floatArray.length, audioCtx.sampleRate);
          buffer.copyToChannel(floatArray, 0);
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(satNode.inputNode);
          source.start();
        } catch (err) {
          // buffer stream catch
        }
      }
    };

    window.addEventListener('message', handleAudioStream);

    return () => {
      window.removeEventListener('message', handleAudioStream);
      satNode.dispose();
      audioCtx.close();
    };
  }, [stemId]);

  const handleClose = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'SONODS_PLUGIN_CLOSE' }, '*');
    }
  };

  const handleMinimize = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'SONODS_PLUGIN_MINIMIZE' }, '*');
    }
  };

  const handleMaximize = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'SONODS_PLUGIN_MAXIMIZE' }, '*');
    }
  };

  if (!node) {
    return (
      <div style={{ color: '#71717a', fontSize: '13px', fontWeight: 600 }}>
        Loading SonoDS Saturator DSP...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 }}>
      <SonodsSaturatorPlugin
        node={node}
        trackName={trackName}
        width={740}
        onClose={handleClose}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
      />
    </div>
  );
};

export default App;
