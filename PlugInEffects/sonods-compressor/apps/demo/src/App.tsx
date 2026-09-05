import React, { useEffect, useState, useRef } from 'react';
import { SonodsCompressorNode } from '@sonods/comp-engine';
import { SonodsCompressorPlugin } from '@sonods/comp-ui';
import './style.css';

export const App: React.FC = () => {
  const [node, setNode] = useState<SonodsCompressorNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Read URL query params for track name
  const queryParams = new URLSearchParams(window.location.search);
  const trackName = queryParams.get('trackName') || 'Track 1';
  const stemId = queryParams.get('stemId') || 'track';

  useEffect(() => {
    const audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioCtxRef.current = audioCtx;
    const compNode = new SonodsCompressorNode(audioCtx);

    compNode.whenReady().then(() => {
      setNode(compNode);

      // Subscribe to parameter changes and sync to parent SonoDS DAW
      compNode.subscribe((state) => {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              type: 'SONODS_PLUGIN_PARAM_CHANGE',
              plugin: 'compressor',
              stemId,
              state: {
                comp: {
                  thresh: state.threshold,
                  ratio: state.ratio,
                  attack: state.attack * 1000,
                  release: state.release * 1000,
                  knee: state.knee,
                  makeup: state.outputGain,
                  mix: state.mix * 100,
                },
                compressor: state,
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
      if (!compNode || !audioCtx) return;

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
          source.connect(compNode.inputNode);
          source.start();
        } catch (err) {
          // buffer stream catch
        }
      }
    };

    window.addEventListener('message', handleAudioStream);

    return () => {
      window.removeEventListener('message', handleAudioStream);
      compNode.dispose();
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
        Loading SonoDS Compressor DSP...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 }}>
      <SonodsCompressorPlugin
        node={node}
        trackName={trackName}
        width={760}
        onClose={handleClose}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
      />
    </div>
  );
};

export default App;
