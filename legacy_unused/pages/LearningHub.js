import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../context/ChatContext'; 
import '../VstStyles.css'; 

export default function LearningHub() { 
  const navigate = useNavigate();
  const { producerStats } = useChat(); 

  const modules = [
    { id: 'upload', title: 'UPLOAD', gridArea: '1 / 1 / 2 / 2' },
    
    // MIXING (Links to /mixing)
    { id: 'mixing', title: 'MIXING TOOLS', gridArea: '2 / 1 / 3 / 2', isMixing: true }, 
    
    { id: 'chat', title: 'PLATINUM BOT', gridArea: '1 / 2 / 3 / 3', isBot: true },
    
    // MASTERING (Links to /master) - Updated with flag
    { id: 'master', title: 'MASTER', gridArea: '1 / 3 / 2 / 4', isMaster: true },
    
    { id: 'career', title: 'CAREER MODE', gridArea: '2 / 3 / 3 / 4', isCareer: true }, 
  ];

  return (
    <div className="vst-screen-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 40px', marginBottom: '20px', borderBottom: '1px solid rgba(167, 139, 250, 0.1)', paddingBottom: '15px' }}>
        <h2 style={{ fontSize: '1.2rem', letterSpacing: '2px', margin: 0, color: '#888' }}>
          LEARNING MODE // <span className="brand-highlight">DASHBOARD</span>
        </h2>
        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>
          SYSTEM: <span style={{ color: '#4ade80' }}>ONLINE</span>
        </div>
      </div>
      
      {/* THE BENTO GRID */}
      <div className="hub-grid-container">
        {modules.map((mod) => (
          <div 
            key={mod.id}
            className={`hub-module ${mod.isBot ? 'bot-module' : ''}`}
            style={{ gridArea: mod.gridArea, cursor: 'pointer' }}
            
            /* NAVIGATION LOGIC: Works for /upload, /mixing, /master, /career, /chat */
            onClick={() => navigate(mod.id === 'chat' ? '/chat' : `/${mod.id}`)}
          >
            {/* 1. CAREER CARD PREVIEW */}
            {mod.isCareer ? (
              <>
                 <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="module-title">{mod.title}</span>
                  <span className="module-status" style={{color: '#f59e0b'}}>LVL {producerStats.level}</span>
                </div>
                
                <div className="module-body" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                   <div style={{ fontSize: '2rem' }}>🏆</div>
                   <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#334155', textAlign: 'center' }}>
                     {producerStats.title.toUpperCase()}
                   </span>
                   <div style={{ width: '60%', height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '5px' }}>
                      <div style={{ width: `${(producerStats.currentXP/producerStats.nextLevelXP)*100}%`, height: '100%', background: '#22c55e', borderRadius: '2px' }}></div>
                   </div>
                </div>

                <div className="module-status">VIEW PROGRESS &gt;</div>
              </>
            ) : mod.isMixing ? (
              /* 2. MIXING TOOLS VISUAL */
              <>
                <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="module-title">{mod.title}</span>
                </div>
                <div className="module-body" style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <div style={{fontSize:'2.5rem', opacity:0.8, filter:'drop-shadow(0 0 10px rgba(167, 139, 250, 0.4))'}}>🎛️</div>
                </div>
                <div className="module-status">ACCESS &gt;</div>
              </>
            ) : mod.isMaster ? (
              /* 3. MASTERING VISUAL (New) */
              <>
                <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="module-title">{mod.title}</span>
                </div>
                <div className="module-body" style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <div style={{fontSize:'2.2rem', opacity:0.8, filter:'drop-shadow(0 0 10px rgba(251, 191, 36, 0.4))'}}>💿</div>
                </div>
                <div className="module-status">ACCESS &gt;</div>
              </>
            ) : (
              /* 4. STANDARD MODULE CARDS (Upload, Bot) */
              <>
                <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="module-title">{mod.title}</span>
                </div>

                <div className="module-body" style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {mod.isBot ? (
                    <div className="bot-visual">
                      <div className="bot-eye"></div>
                      <p>AI READY</p>
                    </div>
                  ) : (
                    // Default Visual for Upload
                    <div style={{fontSize:'1.5rem', color:'var(--text-dim)', opacity:0.5}}>↗</div>
                  )}
                </div>

                <div className="module-status">
                  {mod.isBot ? 'ACTIVE' : 'ACCESS >'}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}