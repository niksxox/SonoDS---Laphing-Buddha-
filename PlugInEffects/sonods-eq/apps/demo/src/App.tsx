import React, { useEffect, useState, useRef } from 'react';
import { Shape, SonodsEqNode } from '@sonods/eq-engine';
import { SonodsEq } from '@sonods/eq-ui';
import './style.css';

export const App: React.FC = () => {
  const [node, setNode] = useState<SonodsEqNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Read URL query params for track name
  const queryParams = new URLSearchParams(window.location.search);
  const trackName = queryParams.get('trackName') || 'Track 1';
  const stemId = queryParams.get('stemId') || 'track';

  useEffect(() => {
    const audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioCtxRef.current = audioCtx;
    const eqNode = new SonodsEqNode(audioCtx);

    eqNode.whenReady().then(() => {
      // 5 standard parametric EQ bands
      eqNode.addBand(Shape.LowCut, 35, 0, 0.7);
      eqNode.addBand(Shape.LowShelf, 120, 0.0, 0.8);
      eqNode.addBand(Shape.Bell, 800, 0.0, 1.4);
      eqNode.addBand(Shape.HighShelf, 6000, 0.0, 0.9);
      eqNode.addBand(Shape.HighCut, 18000, 0, 0.7);

      setNode(eqNode);

      const broadcastState = (state: { bands?: Array<{ id: number; index: number; shape: Shape; freq: number; gain: number; q: number; enabled: boolean }> }) => {
        if (window.parent && window.parent !== window) {
          const bands = (state.bands || []).map((b) => ({
            id: b.id,
            index: b.index,
            shape: b.shape,
            freq: b.freq,
            gain: b.gain,
            q: b.q,
            enabled: b.enabled,
          }));

          const lowBand = bands.find((b) => b.shape === Shape.LowShelf || (b.shape === Shape.Bell && b.freq < 300));
          const midBand = bands.find((b) => b.shape === Shape.Bell && b.freq >= 300 && b.freq < 4000);
          const highBand = bands.find((b) => b.shape === Shape.HighShelf || (b.shape === Shape.Bell && b.freq >= 4000));
          const lowCut = bands.find((b) => b.shape === Shape.LowCut);
          const highCut = bands.find((b) => b.shape === Shape.HighCut);

          window.parent.postMessage(
            {
              type: 'SONODS_PLUGIN_PARAM_CHANGE',
              plugin: 'eq',
              stemId,
              state: {
                eq: {
                  low: lowBand ? lowBand.gain : 0,
                  mid: midBand ? midBand.gain : 0,
                  high: highBand ? highBand.gain : 0,
                },
                lowCutFreq: lowCut ? lowCut.freq : 20,
                highCutFreq: highCut ? highCut.freq : 20000,
                bands,
                eqFullState: state,
              },
            },
            '*'
          );
        }
      };

      // Subscribe to onStateChange
      if (typeof eqNode.onStateChange === 'function') {
        eqNode.onStateChange(broadcastState);
      }
      if (typeof (eqNode as any).subscribe === 'function') {
        (eqNode as any).subscribe(broadcastState);
      }

      // Initial broadcast of defaults
      broadcastState(eqNode.getState());
    });

    // Listen for live audio stream frames from the main DAW
    const handleAudioStream = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'AUDIO_STREAM_FRAME' || !e.data.timeDomain) return;
      if (!eqNode || !audioCtx) return;

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
          source.connect(eqNode.inputNode);
          source.start();
        } catch (err) {
          // buffer stream catch
        }
      }
    };

    window.addEventListener('message', handleAudioStream);

    return () => {
      window.removeEventListener('message', handleAudioStream);
      eqNode.destroy();
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
        Loading SonoDS EQ DSP Core...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 }}>
      <SonodsEq
        node={node}
        trackName={trackName}
        showDevOverlay={false}
        onClose={handleClose}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
      />
    </div>
  );
};

export default App;
