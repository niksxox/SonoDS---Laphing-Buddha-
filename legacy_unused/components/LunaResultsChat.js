import React, { useState, useEffect, useRef } from "react";
import { useChat } from "../context/ChatContext";
import "../App.css";

export default function LunaResultsChat({ aiResults, currentMix, safetyWarnings }) {
  const { messages, sendMessage, addSystemMessage, clearMessages, isLoading } = useChat();
  const [inputVal, setInputVal] = useState("");
  const scrollRef = useRef(null);
  const analysisIdRef = useRef(null);

  // --- 1. GENERATE REPORT LOGIC ---
  const generateEducationalReport = (results) => {
    let insights = [];
    if (results.vocals_gain < -2) insights.push(`**Vocals:** Tucked in (${results.vocals_gain}dB) to sit inside the mix.`);
    else insights.push(`**Vocals:** Preserved natural dynamics at ${results.vocals_gain}dB.`);
    
    if (results.bass_gain < -3) insights.push(`**Bass:** Reduced low-end (${results.bass_gain}dB) to let the kick punch.`);
    else insights.push(`**Bass:** Solid foundation at ${results.bass_gain}dB.`);
    
    return insights.join("\n");
  };

  // --- 2. INIT SESSION ---
  useEffect(() => {
    if (!aiResults) return;
    if (analysisIdRef.current !== aiResults) {
      if (clearMessages) clearMessages(); 
      const detailedInsights = generateEducationalReport(aiResults);
      setTimeout(() => addSystemMessage(`**Mix Analysis Complete** ✨\n${detailedInsights}`), 100);
      analysisIdRef.current = aiResults;
    }
  }, [aiResults, addSystemMessage, clearMessages]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = () => {
    if (!inputVal.trim()) return;
    sendMessage(inputVal);
    setInputVal("");
  };

  return (
    <div className="notion-card">
      {/* HEADER */}
      <div className="notion-header">
        <div className="notion-icon">✨</div>
        <span className="notion-title">Luna AI Assistant</span>
        <div className="notion-badge">Online</div>
      </div>

      {/* BODY */}
      <div className="notion-body" ref={scrollRef}>
        {messages.map((msg, idx) => (
          <div key={idx} className={`notion-row ${msg.role}`}>
            
            {/* AI AVATAR */}
            {msg.role === 'assistant' && (
                <div className="notion-avatar">
                    <img src="/luna-avatar.png" alt="AI" />
                </div>
            )}

            {/* MESSAGE BUBBLE */}
            <div className="notion-bubble">
                {msg.content.split('\n').map((line, i) => (
                    <div key={i} style={{marginBottom: '4px'}}>
                        {line.split('**').map((part, j) => 
                            j % 2 === 1 ? <b key={j}>{part}</b> : part
                        )}
                    </div>
                ))}
            </div>
          </div>
        ))}

        {isLoading && (
            <div className="notion-row assistant">
                <div className="notion-avatar"><img src="/luna-avatar.png" alt="AI" /></div>
                <div className="notion-bubble" style={{color: '#999', fontStyle: 'italic'}}>Thinking...</div>
            </div>
        )}
      </div>

      {/* INPUT */}
      <div className="notion-footer">
        <div className="notion-input-box">
            <input
                type="text"
                placeholder="Ask Luna about the mix..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button className="notion-send" onClick={handleSend}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
        </div>
      </div>
    </div>
  );
}