import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../../context/ChatContext';

export default function LunaChatPanel({ onClose }) {
  const { messages, sendMessage, isLoading, clearChat } = useChat();
  const [inputVal, setInputVal] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Auto-focus input after panel opens
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSend = () => {
    if (!inputVal.trim() || isLoading) return;
    sendMessage(inputVal);
    setInputVal('');
  };

  const handleSuggestion = (text) => {
    sendMessage(text);
  };

  return (
    <div className="luna-panel" onClick={(e) => e.stopPropagation()}>

      {/* ── HEADER ── */}
      <div className="luna-panel-header">
        <div className="luna-panel-profile">
          <div className="luna-panel-avi-wrap">
            <img src="/luna-avatar.png" alt="Luna" />
            <span className="luna-panel-dot" />
          </div>
          <div className="luna-panel-id">
            <span className="luna-panel-name">LUNA AI</span>
            <span className="luna-panel-status">
              {isLoading ? '✨ thinking...' : '● Online'}
            </span>
          </div>
        </div>
        <div className="luna-panel-hdr-actions">
          <button className="luna-hdr-btn" onClick={clearChat} title="Clear chat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <button className="luna-hdr-btn luna-hdr-close" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── MESSAGE AREA ── */}
      <div className="luna-panel-body" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="luna-welcome">
            <img src="/luna-avatar.png" alt="Luna" className="luna-welcome-avi" />
            <h3 className="luna-welcome-title">hey! i'm luna 🎧</h3>
            <p className="luna-welcome-sub">
              your AI mixing assistant. ask me anything about production, mixing tips, or just say hi!
            </p>
            <div className="luna-chips">
              <button onClick={() => handleSuggestion('How do I make my vocals sit better in the mix?')}>
                🎤 Vocal mixing
              </button>
              <button onClick={() => handleSuggestion('My bass sounds muddy, help!')}>
                🎸 Fix muddy bass
              </button>
              <button onClick={() => handleSuggestion('What is sidechain compression?')}>
                🔗 Sidechain
              </button>
              <button onClick={() => handleSuggestion('Give me tips for a louder master')}>
                🔊 Mastering tips
              </button>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`luna-row ${msg.role}${msg.isSystem ? ' sys' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="luna-row-avi">
                    <img src="/luna-avatar.png" alt="Luna" />
                  </div>
                )}
                <div className={`luna-bubble ${msg.role}`}>
                  {msg.content.split('\n').map((line, j) => (
                    <span key={j}>
                      {line.split('**').map((part, k) =>
                        k % 2 === 1 ? <strong key={k}>{part}</strong> : part
                      )}
                      {j < msg.content.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="luna-row assistant">
                <div className="luna-row-avi">
                  <img src="/luna-avatar.png" alt="Luna" />
                </div>
                <div className="luna-bubble assistant luna-is-typing">
                  <span className="ld" /><span className="ld" /><span className="ld" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── INPUT ── */}
      <div className="luna-panel-footer">
        <div className="luna-input-row">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask Luna something..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
          <button
            className={`luna-send ${inputVal.trim() && !isLoading ? 'ready' : ''}`}
            onClick={handleSend}
            disabled={!inputVal.trim() || isLoading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
            </svg>
          </button>
        </div>
        <span className="luna-fine-print">Luna uses AI · responses may vary</span>
      </div>
    </div>
  );
}
