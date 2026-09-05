import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import CharacterModal from '../components/CharacterModal'; // Import the new RPG Modal
import '../App.css'; 

export default function ChatInterface() {
  // 1. GET ALL TOOLS (Including the new rpgStats)
  const { 
    messages, 
    sendMessage, 
    isLoading, 
    clearChat, 
    sessions, 
    activeSessionId, 
    switchSession, 
    createNewSession,
    deleteSession,
    rpgStats // <--- NEW: Get the stats for the modal
  } = useChat();

  const [inputVal, setInputVal] = useState("");
  const [showCharModal, setShowCharModal] = useState(false); // <--- NEW: State for Modal
  const scrollRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!inputVal.trim()) return;
    sendMessage(inputVal);
    setInputVal("");
  };

  const handleExport = () => {
    if (messages.length === 0) return;
    const chatHistory = messages.map(msg => `[${msg.role.toUpperCase()}]: ${msg.content}`).join('\n\n');
    const blob = new Blob([chatHistory], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sono_session_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="vst-screen-content chat-page-layout">
      
      {/* --- SIDEBAR --- */}
      <div className="chat-sidebar">
        
        {/* Background Image (The "Cool ASF" one) */}
        <img src="/luna-avatar.png" className="sidebar-luna-bg" alt="" />

        <div className="sidebar-header">
          <span className="sidebar-title">SESSIONS</span>
          {/* Create New Session Button */}
          <button className="new-chat-btn" onClick={createNewSession}>+</button>
        </div>
        
        {/* SESSION LIST */}
        <div className="session-list">
          {sessions.map((session) => (
            <div 
              key={session.id} 
              className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
              onClick={() => switchSession(session.id)}
            >
              <div className="session-info">
                <span className="session-name">{session.name}</span>
                <span className="session-time">{session.date}</span>
              </div>
              
              {/* DELETE BUTTON */}
              <button 
                className="delete-session-btn"
                onClick={(e) => deleteSession(e, session.id)}
                title="Delete Chat"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        
        {/* PROFILE CARD (Clickable to open RPG Modal) */}
        <div 
          className="sidebar-profile" 
          onClick={() => setShowCharModal(true)} // <--- CLICK TRIGGER
          style={{ cursor: 'pointer' }}
        >
          <div className="luna-avatar-small">
            <img src="/luna-avatar.png" alt="Luna" />
            <div className="status-dot-online"></div>
          </div>
          <div className="profile-text">
            <span className="p-name">LUNA AI</span>
            <span className="p-role">Audio Engineer</span>
          </div>
        </div>
      </div>

      {/* --- MAIN CHAT AREA --- */}
      <div className="chat-main-stage">
        
        <div className="chat-stage-header">
          <div className="stage-info">
            <h2>PLATINUM BOT <span className="highlight-tag">BETA</span></h2>
            <p>AI-Powered Audio Engineering Assistant</p>
          </div>
          <div className="stage-actions">
            <button className="stage-btn" onClick={handleExport}>Export</button>
            <button className="stage-btn" onClick={clearChat}>Clear</button>
          </div>
        </div>

        {/* MESSAGES FEED */}
        <div className="chat-feed" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">✨</div>
              <h3>How can I help with your mix today?</h3>
              <p>Try asking about compression, EQ, or upload a stem.</p>
            </div>
          )}
          
          {messages.map((msg, index) => (
            <div key={index} className={`chat-row ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="msg-avatar">
                  <img src="/luna-avatar.png" alt="AI" />
                </div>
              )}
              <div className="msg-content-bubble">
                {msg.content.includes("REPORT") ? <pre>{msg.content}</pre> : msg.content}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="chat-row assistant">
              <div className="msg-avatar"><img src="/luna-avatar.png" alt="AI" /></div>
              <div className="typing-indicator">
                <span>.</span><span>.</span><span>.</span>
              </div>
            </div>
          )}
        </div>

        {/* INPUT AREA */}
        <div className="chat-input-wrapper">
          <div className="glass-input-bar">
            <input 
              type="text" 
              placeholder="Ask Luna about your mix..." 
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              autoFocus
            />
            <button className="send-fab" onClick={handleSend}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

      </div>

      {/* --- RENDER THE RPG MODAL (If Open) --- */}
      {showCharModal && (
        <CharacterModal 
            onClose={() => setShowCharModal(false)} 
            stats={rpgStats} 
        />
      )}

    </div>
  );
}