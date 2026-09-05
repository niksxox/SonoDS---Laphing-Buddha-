import React, { useState, useRef, useEffect, useCallback } from 'react';
import useMixerStore from '../../store/useMixerStore';

const PLUGIN_BASE_DIMS = {
  eq: { baseW: 760, baseH: 490, defaultScale: 0.88 },
  compressor: { baseW: 760, baseH: 500, defaultScale: 0.88 },
  saturator: { baseW: 740, baseH: 480, defaultScale: 0.88 },
  gate: { baseW: 720, baseH: 460, defaultScale: 0.88 },
};

/**
 * PluginHost — Floating, draggable, uniformly scaled window container.
 * Uses CSS transform: scale() so plugin UI never squeezes or deforms.
 * Keeps traffic lights clickable without interfering with window dragging.
 */
export const PluginHost = ({ updateTrackFx, getAnalyserData, checkIsPlaying, tracks = [] }) => {
  const openPluginWindow = useMixerStore((s) => s.openPluginWindow);
  const closePlugin = useMixerStore((s) => s.closePlugin);
  const setFxParam = useMixerStore((s) => s.setFxParam);

  const iframeRef = useRef(null);

  const pType = openPluginWindow?.pluginType || 'eq';
  const baseDims = PLUGIN_BASE_DIMS[pType] || PLUGIN_BASE_DIMS.eq;

  const [position, setPosition] = useState({ x: 260, y: 80 });
  const [scale, setScale] = useState(baseDims.defaultScale);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const prevDimsRef = useRef({ x: 260, y: 80, scale: baseDims.defaultScale });
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ startX: 0, startY: 0, startScale: baseDims.defaultScale });

  // Center and reset scale when a plugin window opens
  useEffect(() => {
    if (openPluginWindow) {
      const currentDims = PLUGIN_BASE_DIMS[openPluginWindow.pluginType] || PLUGIN_BASE_DIMS.eq;
      const initScale = currentDims.defaultScale;
      const initW = Math.round(currentDims.baseW * initScale);
      const initH = Math.round(currentDims.baseH * initScale);

      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const initX = Math.max(20, Math.round((screenW - initW) / 2));
      const initY = Math.max(40, Math.round((screenH - initH) / 2 - 20));

      setPosition({ x: initX, y: initY });
      setScale(initScale);
      setIsMinimized(false);
      setIsMaximized(false);
    }
  }, [openPluginWindow]);

  // Maximize calculation with clean screen padding (40px margins)
  const handleToggleMaximize = useCallback(() => {
    setIsMaximized((prev) => {
      if (!prev) {
        prevDimsRef.current = { ...position, scale };

        const maxAvailableW = window.innerWidth - 80;
        const maxAvailableH = window.innerHeight - 100;

        const maxScaleW = maxAvailableW / baseDims.baseW;
        const maxScaleH = maxAvailableH / baseDims.baseH;
        const newScale = Math.min(maxScaleW, maxScaleH);

        const newW = Math.round(baseDims.baseW * newScale);
        const newH = Math.round(baseDims.baseH * newScale);
        const newX = Math.round((window.innerWidth - newW) / 2);
        const newY = Math.round((window.innerHeight - newH) / 2);

        setPosition({ x: newX, y: newY });
        setScale(newScale);
        return true;
      } else {
        setPosition({ x: prevDimsRef.current.x, y: prevDimsRef.current.y });
        setScale(prevDimsRef.current.scale);
        return false;
      }
    });
  }, [position, scale, baseDims]);

  // Handle postMessage communication from embedded plugin
  const handleMessage = useCallback(
    (event) => {
      if (!event.data || typeof event.data !== 'object') return;
      const { type, state, stemId } = event.data;

      if (type === 'SONODS_PLUGIN_CLOSE') {
        closePlugin();
      } else if (type === 'SONODS_PLUGIN_MINIMIZE') {
        setIsMinimized((prev) => !prev);
      } else if (type === 'SONODS_PLUGIN_MAXIMIZE') {
        handleToggleMaximize();
      } else if (type === 'SONODS_PLUGIN_PARAM_CHANGE' && state) {
        const targetStemId = stemId || openPluginWindow?.stemId;
        if (targetStemId) {
          if (state.eq) setFxParam(targetStemId, 'eq', state.eq);
          if (state.comp) setFxParam(targetStemId, 'comp', state.comp);
          if (typeof state.sat === 'number') setFxParam(targetStemId, 'sat', state.sat);

          if (updateTrackFx) {
            updateTrackFx(targetStemId, state);
          }
        }
      }
    },
    [closePlugin, handleToggleMaximize, openPluginWindow, setFxParam, updateTrackFx]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Real-time audio streaming from active stem analyser to plugin iframe
  useEffect(() => {
    if (!openPluginWindow || !getAnalyserData) return;

    let animId;
    const targetStemId = openPluginWindow.stemId;

    const streamLoop = () => {
      const isPlaying = checkIsPlaying ? checkIsPlaying() : true;
      if (isPlaying) {
        const floatData = getAnalyserData(targetStemId);
        if (floatData && floatData.length > 0 && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            {
              type: 'AUDIO_STREAM_FRAME',
              timeDomain: Array.from(floatData.slice(0, 512)),
              stemId: targetStemId,
              isPlaying: true,
            },
            '*'
          );
        }
      }
      animId = requestAnimationFrame(streamLoop);
    };

    animId = requestAnimationFrame(streamLoop);
    return () => cancelAnimationFrame(animId);
  }, [openPluginWindow, getAnalyserData, checkIsPlaying]);

  // Window drag handling (active on middle header area)
  const handleMouseDownDrag = (e) => {
    if (isMaximized) return;
    setIsDragging(true);
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const currentW = Math.round(baseDims.baseW * scale);
    const currentH = Math.round(baseDims.baseH * scale);

    const handleMouseMove = (e) => {
      const newX = Math.max(10, Math.min(window.innerWidth - currentW - 10, e.clientX - dragOffsetRef.current.x));
      const newY = Math.max(10, Math.min(window.innerHeight - currentH - 10, e.clientY - dragOffsetRef.current.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, scale, baseDims]);

  // Uniform scale resize handling
  const handleMouseDownResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMaximized) return;

    setIsResizing(true);
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startScale: scale,
    };
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const { startX, startY, startScale } = resizeStartRef.current;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      // Calculate scale delta based on mouse distance change
      const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      const scaleSensitivity = 1 / baseDims.baseW;
      let newScale = startScale + delta * scaleSensitivity;

      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const maxAllowedScale = Math.min((screenW - 60) / baseDims.baseW, (screenH - 80) / baseDims.baseH, 1.8);
      const minAllowedScale = 0.6;

      newScale = Math.max(minAllowedScale, Math.min(maxAllowedScale, newScale));
      setScale(newScale);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, baseDims]);

  if (!openPluginWindow) return null;

  const { stemId, slotIndex, pluginType } = openPluginWindow;
  const currentTrack = tracks.find((t) => t.id === stemId);
  const trackName = currentTrack?.label || currentTrack?.title || stemId || 'Track';

  const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
  const pluginUrl = `http://${host}:3001/plugins/${pluginType}/?stemId=${encodeURIComponent(
    stemId
  )}&trackName=${encodeURIComponent(`${trackName} (Slot ${slotIndex + 1})`)}`;

  const currentW = Math.round(baseDims.baseW * scale);
  const currentH = Math.round(baseDims.baseH * scale);

  // Minimized dock pill state
  if (isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 9999,
          background: '#18181b',
          color: '#ffffff',
          borderRadius: '12px',
          border: '2px solid #27272a',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
        onMouseDown={handleMouseDownDrag}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
            {pluginType} • {trackName}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          style={{
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '4px',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          RESTORE
        </button>
        <button
          type="button"
          onClick={closePlugin}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#a1a1aa',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${currentW}px`,
        height: `${currentH}px`,
        zIndex: 9999,
        background: 'transparent',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
        borderRadius: '24px',
        overflow: 'hidden',
        transition: isResizing || isDragging ? 'none' : 'box-shadow 0.2s ease, width 0.12s ease, height 0.12s ease, left 0.12s ease, top 0.12s ease',
        animation: 'pluginAppear 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Top Header Drag Bar — specifically positioned in the CENTER so it does NOT block the traffic lights on top-right */}
      <div
        onMouseDown={handleMouseDownDrag}
        title="Drag to move plugin"
        style={{
          height: '42px',
          position: 'absolute',
          top: 0,
          left: '160px',
          right: '110px', // Leaves traffic lights area completely free for clicks
          cursor: isDragging ? 'grabbing' : 'grab',
          zIndex: 20,
          background: 'transparent',
        }}
      />

      {/* Transparent overlay while dragging/resizing so iframe doesn't intercept mouse */}
      {(isDragging || isResizing) && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 30,
            cursor: isDragging ? 'grabbing' : 'se-resize',
          }}
        />
      )}

      {/* Embedded Plugin Component with 100% Crisp Uniform Scale */}
      <iframe
        ref={iframeRef}
        src={pluginUrl}
        title={`SonoDS ${pluginType}`}
        allow="autoplay; microphone"
        style={{
          width: `${baseDims.baseW}px`,
          height: `${baseDims.baseH}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 'none',
          background: 'transparent',
          borderRadius: '24px',
          pointerEvents: isDragging || isResizing ? 'none' : 'auto',
        }}
      />

      {/* --- Corner Resize Grip (Active on Hover) --- */}
      {!isMaximized && (
        <div
          onMouseDown={handleMouseDownResize}
          title="Drag to scale plugin size"
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '28px',
            height: '28px',
            cursor: 'se-resize',
            zIndex: 25,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.35 }}>
            <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default PluginHost;
