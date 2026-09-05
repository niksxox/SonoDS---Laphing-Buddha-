import React, { useState, useCallback, useRef, useEffect } from 'react';
import HomeScreen from './screens/HomeScreen';
import StemInjectionScreen from './screens/StemInjectionScreen';
import MixingConsoleScreen from './screens/MixingConsoleScreen';
import CompareScreen from './screens/CompareScreen';
import LunaChatPanel from './components/chat/LunaChatPanel';
import { useChat } from './context/ChatContext';
import useMixerStore from './store/useMixerStore';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [mode, setMode] = useState('auto');     // 'auto' | 'learn'
  const [history, setHistory] = useState([]);
  const [videoPaused, setVideoPaused] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef(null);

  // Luna Chat State
  const [chatOpen, setChatOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const notifTimeoutRef = useRef(null);
  const { unreadCount, clearUnread } = useChat();

  const mixerReached = screen === 'mix' || screen === 'compare';
  const theme = mode === 'learn' ? 'premium' : 'industrial';

  // Listen for Luna notification events (from mix analysis, etc.)
  useEffect(() => {
    const handleNotif = (e) => {
      setNotification(e.detail);
      if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
      notifTimeoutRef.current = setTimeout(() => setNotification(null), 5000);
    };
    window.addEventListener('luna-notification', handleNotif);
    return () => {
      window.removeEventListener('luna-notification', handleNotif);
      if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    };
  }, []);

  const handleIslandClick = useCallback(() => {
    if (notification) {
      setNotification(null);
      if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    }
    setChatOpen(prev => !prev);
    clearUnread();
  }, [notification, clearUnread]);

  const navigateTo = useCallback((newScreen) => {
    setHistory(prev => [...prev, screen]);
    setScreen(newScreen);
  }, [screen]);

  const goBack = useCallback(() => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(h => h.slice(0, -1));
      setScreen(prev);
    }
  }, [history]);

  const goHome = useCallback(() => {
    setScreen('home');
    setHistory([]);
  }, []);

  const handleStart = useCallback((selectedMode) => {
    setMode(selectedMode);
    navigateTo('inject');
  }, [navigateTo]);

  // Store the /mix-v2 result from StemInjectionScreen and navigate to mixer
  const handleInjectProceed = useCallback((mixResult) => {
    if (mixResult) {
      useMixerStore.getState().setMixResponse(mixResult);
    }
    navigateTo('mix');
  }, [navigateTo]);

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
  }, []);

  const toggleVideo = useCallback(() => {
    if (videoRef.current) {
      if (videoPaused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
      setVideoPaused(!videoPaused);
    }
  }, [videoPaused]);

  return (
    <div className="studio-room" data-theme={theme}>

      <div className="hardware-chassis">
        
        {/* Faceplate Header */}
        <div className="faceplate-header">
          <div className="brand-logo">
            SONO<span className="brand-highlight">DS</span>
          </div>

          {/* Dynamic Island */}
          <div
            className={`neural-island ${notification ? 'island-notification' : ''} ${chatOpen ? 'island-chat-active' : ''}`}
            onClick={handleIslandClick}
          >
            {notification && !chatOpen ? (
              <div className="notif-content">
                <img src="/luna-avatar.png" alt="Luna" className="notif-avatar" />
                <div className="notif-text">
                  <span className="notif-title">LUNA AI</span>
                  <span className="notif-msg">{notification}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="mascot-placeholder"></div>
                <span className="island-status">
                  {mode === 'learn' ? 'LUNA // LEARN MODE' : 'LUNA // ONLINE'}
                </span>
                {unreadCount > 0 && !chatOpen && (
                  <span className="island-unread">{unreadCount}</span>
                )}
              </>
            )}
          </div>

          <div className="header-controls">
            <div style={{
              fontSize: '9px',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '1px',
              color: 'var(--text-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: screen === 'home' ? 0.3 : 1,
              transition: 'opacity 0.3s ease',
            }}>
              <span style={{ 
                color: screen === 'inject' ? 'var(--accent)' : 'var(--text-dim)',
                opacity: screen === 'inject' ? 1 : 0.5,
              }}>INJECT</span>
              <span style={{ opacity: 0.3 }}>→</span>
              <span style={{ 
                color: screen === 'mix' ? 'var(--accent)' : 'var(--text-dim)',
                opacity: screen === 'mix' ? 1 : 0.5,
              }}>MIX</span>
              <span style={{ opacity: 0.3 }}>→</span>
              <span style={{ 
                color: screen === 'compare' ? 'var(--accent)' : 'var(--text-dim)',
                opacity: screen === 'compare' ? 1 : 0.5,
              }}>COMPARE</span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="nav-mini-btn" 
                onClick={goBack} 
                title="Go Back"
                style={{
                  opacity: history.length === 0 ? 0.3 : 1,
                  cursor: history.length === 0 ? 'default' : 'pointer',
                  pointerEvents: history.length === 0 ? 'none' : 'auto'
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button 
                className="nav-mini-btn" 
                onClick={goHome} 
                title="Home"
                style={{
                  opacity: screen === 'home' ? 0.3 : 1,
                  cursor: screen === 'home' ? 'default' : 'pointer',
                  pointerEvents: screen === 'home' ? 'none' : 'auto'
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </button>
            </div>

            <div className="power-light"></div>
          </div>
        </div>

        {/* Interface Bed */}
        <div className="interface-bed" style={{ position: 'relative', overflow: 'hidden' }}>
          {mode === 'learn' && (
            <>
              <img
                src="/loop-bkg-poster.webp"
                alt="Background poster"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  zIndex: 1,
                  pointerEvents: 'none',
                  opacity: isVideoReady ? 0 : 1,
                  transition: 'opacity 0.6s ease-in-out',
                }}
              />
              <video 
                ref={videoRef}
                poster="/loop-bkg-poster.webp"
                autoPlay 
                loop 
                muted 
                playsInline
                preload="auto"
                onCanPlay={() => setIsVideoReady(true)}
                onPlaying={() => setIsVideoReady(true)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  zIndex: 0,
                  pointerEvents: 'none'
                }}
              >
                <source src="/loop-bkg.webm" type="video/webm" />
                <source src="/loop-bkg.mp4" type="video/mp4" />
              </video>
            </>
          )}
          {screen === 'home' && (
            <HomeScreen
              onStart={handleStart}
              mode={mode}
              onModeChange={handleModeChange}
            />
          )}

          {screen === 'inject' && (
            <StemInjectionScreen mode={mode} onProceed={handleInjectProceed} />
          )}

          {mixerReached && (
            <div style={{ 
              display: screen === 'mix' ? 'contents' : 'none',
              height: '100%', 
              width: '100%',
            }}>
              <MixingConsoleScreen
                onCompare={() => navigateTo('compare')}
                mode={mode}
              />
            </div>
          )}

          {screen === 'compare' && (
            <CompareScreen mode={mode} onBack={() => {
              setHistory(h => [...h, 'compare']);
              setScreen('mix');
            }} />
          )}
        </div>

        {/* Luna Chat Overlay */}
        {chatOpen && (
          <>
            <div className="luna-chat-backdrop" onClick={() => setChatOpen(false)} />
            <LunaChatPanel onClose={() => setChatOpen(false)} />
          </>
        )}
        
      </div>

      {/* Video Pause/Play toggle — outside chassis */}
      {mode === 'learn' && (
        <button
          onClick={toggleVideo}
          title={videoPaused ? 'Resume background' : 'Pause background'}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(8px)',
            color: 'rgba(255,255,255,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            zIndex: 9999,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.25)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
          }}
        >
          {videoPaused ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          )}
        </button>
      )}
    </div>
  );
}