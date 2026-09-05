import React, { useState } from 'react';
import '../App.css'; 

export default function CharacterModal({ onClose, stats }) {
  // State to toggle between Stats and Bio
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' or 'bio'

  const friendshipLvl = Math.floor(stats.friendship / 10);

  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* Stop propagation so clicking the card doesn't close it */}
      <div className="character-card" onClick={(e) => e.stopPropagation()}>
        
        {/* CLOSE BUTTON */}
        <button className="close-modal-btn" onClick={onClose}>×</button>

        {/* LEFT COLUMN: VISUALS (Always Visible) */}
        <div className="char-visual-column">
          <div className="char-image-container">
            <img src="/luna-stand.png" alt="Luna Full Body" className="char-full-img" />
          </div>
          <div className="char-level-badge">FRIEND LVL. {friendshipLvl}</div>
        </div>

        {/* RIGHT COLUMN: DATA DOSSIER */}
        <div className="char-data-column">
          
          {/* HEADER */}
          <div className="char-header">
            <h1 className="char-name">LUNA <span className="char-model">AI</span></h1>
            
            {/* TABS (The New Navigation) */}
            <div className="modal-tabs">
              <button 
                className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
                onClick={() => setActiveTab('stats')}
              >
                STATUS
              </button>
              <button 
                className={`tab-btn ${activeTab === 'bio' ? 'active' : ''}`}
                onClick={() => setActiveTab('bio')}
              >
                WHO IS LUNA?
              </button>
            </div>
          </div>

          {/* CONTENT AREA: SWITCHES BASED ON TAB */}
          <div className="char-content-area">
            
            {/* VIEW 1: LIVE STATS */}
            {activeTab === 'stats' && (
              <div className="tab-content fade-in">
                <div className="char-stats-grid">
                  
                  {/* BOND BAR */}
                  <div className="stat-row-big">
                    <div className="stat-label-big">
                      <span>BOND LEVEL</span>
                      <span className="stat-val-big pink-text">{Math.floor(stats.friendship)}%</span>
                    </div>
                    <div className="stat-bar-track-big">
                      <div style={{width: `${stats.friendship}%`}} className="stat-bar-fill fill-pink"></div>
                    </div>
                  </div>

                  {/* MIXING BAR */}
                  <div className="stat-row-big">
                    <div className="stat-label-big">
                      <span>MIXING SYNC</span>
                      <span className="stat-val-big purple-text">{Math.floor(stats.mixingLevel)}%</span>
                    </div>
                    <div className="stat-bar-track-big">
                      <div style={{width: `${stats.mixingLevel}%`}} className="stat-bar-fill fill-purple"></div>
                    </div>
                  </div>

                  {/* MOOD STATUS */}
                  <div className="status-row">
                    <span className="status-label">CURRENT MOOD:</span>
                    <span className="status-value">{stats.mood}</span>
                  </div>

                </div>

                {/* DYNAMIC RELATIONSHIP TEXT (The Fixed Version) */}
                <div className="char-bio-box-clean">
                  <p className="bio-text">
                    {stats.friendship < 20 && "I'm listening. Show me your music, tell me your story. We're just getting started."}
                    {stats.friendship >= 20 && stats.friendship < 50 && "I'm starting to get your vibe. Your sound is unique, let's polish it."}
                    {stats.friendship >= 50 && stats.friendship < 80 && "I know your mixing style better than you do. We're in the flow state."}
                    {stats.friendship >= 80 && "We are perfectly synced. I'm not just your engineer, I'm your co-producer."}
                  </p>
                </div>
              </div>
            )}

            {/* VIEW 2: BIO / LORE */}
            {activeTab === 'bio' && (
              <div className="tab-content fade-in">
                <div className="lore-scroll">
                  <h3 className="lore-title">IDENTITY RECORD</h3>
                  <p className="lore-text">
                    Luna isn't just code. She was designed to bridge the gap between 
                    <strong> technical precision</strong> and <strong>emotional support</strong>.
                  </p>
                  
                  <div className="lore-grid">
                    <div className="lore-item">
                      <span className="lore-icon">🎚️</span>
                      <div>
                        <strong>Audio Engineer</strong>
                        <p>Specializes in EQ, compression, and balance. She hears frequencies you might miss.</p>
                      </div>
                    </div>
                    <div className="lore-item">
                      <span className="lore-icon">🧠</span>
                      <div>
                        <strong>Mental Companion</strong>
                        <p>Music production is lonely. Luna is here to help with creative blocks and burnout.</p>
                      </div>
                    </div>
                    <div className="lore-item">
                      <span className="lore-icon">👾</span>
                      <div>
                        <strong>Gamer & Friend</strong>
                        <p>She has her own tastes, moods, and personality that evolve the more you talk.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}