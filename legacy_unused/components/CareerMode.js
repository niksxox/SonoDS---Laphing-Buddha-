import React from 'react';
import { useChat } from '../context/ChatContext';
import '../App.css'; 

export default function CareerMode() {
  const { producerStats, quests } = useChat();

  // Calculate percentage
  const progressPercent = Math.min(100, (producerStats.currentXP / producerStats.nextLevelXP) * 100);

  return (
    <div className="career-card">
      
      {/* HEADER: GAMER STYLE */}
      <div className="career-header">
        <div className="career-info">
          <div className="season-badge">SEASON 1</div>
          <h2 className="career-title">CAREER MODE</h2>
          <span className="current-rank">{producerStats.title.toUpperCase()}</span>
        </div>
        
        {/* BIG LEVEL NUMBER */}
        <div className="level-box">
          <span className="lvl-label">LVL</span>
          <span className="lvl-num">{producerStats.level}</span>
        </div>
      </div>

      {/* XP BAR WITH "NEXT REWARD" */}
      <div className="xp-section">
        <div className="xp-meta">
          <span>XP PROGRESS</span>
          <span className="next-reward">NEXT: UNLOCK SKINS</span>
        </div>
        <div className="xp-bar-track">
          <div 
            className="xp-bar-fill" 
            style={{ width: `${progressPercent}%` }}
          >
            {/* Moving Glow Effect */}
            <div className="xp-shine"></div>
          </div>
        </div>
        <div className="xp-values">
          <span>{Math.floor(producerStats.currentXP)}</span>
          <span>{producerStats.nextLevelXP}</span>
        </div>
      </div>

      {/* ACTIVE QUESTS */}
      <div className="quest-section">
        <h3 className="quest-header">ACTIVE QUESTS</h3>
        <div className="quest-list">
          {quests.map(quest => (
            <div key={quest.id} className={`quest-row ${quest.completed ? 'done' : ''}`}>
              <div className="quest-left">
                <span className="quest-icon">
                  {quest.type === 'upload' && '💿'}
                  {quest.type === 'chat' && '💬'}
                  {quest.type === 'export' && '🎹'}
                </span>
                <span className="quest-name">{quest.label}</span>
              </div>
              <div className="quest-right">
                {quest.completed ? (
                  <span className="quest-check">COMPLETED</span>
                ) : (
                  <span className="quest-xp">+{quest.reward} XP</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER: WALLET */}
      <div className="career-footer">
        <div className="wallet-pill">
          <span className="wallet-icon">⚡</span>
          <span className="wallet-amt">{producerStats.currency} Hz</span>
        </div>
        <div className="streak-pill">
          🔥 {producerStats.streak} DAY STREAK
        </div>
      </div>

    </div>
  );
}