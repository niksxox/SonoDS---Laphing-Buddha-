import React from 'react';

const MuteSoloButtons = ({ stemId, isMuted, isSoloed, onMute, onSolo, mode }) => {
  const isPremium = mode === 'learn';
  const inactiveBorder = isPremium ? '#1E293B' : 'rgba(255,255,255,0.2)';
  const inactiveColor = isPremium ? '#1E293B' : 'rgba(255,255,255,0.4)';
  const inactiveBg = isPremium ? '#FFFFFF' : 'transparent';

  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      <button
        onClick={(e) => { e.stopPropagation(); onMute(stemId); }}
        style={{
          width: '24px', height: '20px',
          fontSize: '8px', fontWeight: 700, letterSpacing: '0.5px',
          background: isMuted ? '#ef4444' : inactiveBg,
          border: `1px solid ${isMuted ? '#ef4444' : inactiveBorder}`,
          color: isMuted ? '#fff' : inactiveColor,
          borderRadius: '4px', cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontFamily: "'Inter', sans-serif",
          boxShadow: isPremium && !isMuted ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
        }}
      >M</button>
      <button
        onClick={(e) => { e.stopPropagation(); onSolo(stemId); }}
        style={{
          width: '24px', height: '20px',
          fontSize: '8px', fontWeight: 700, letterSpacing: '0.5px',
          background: isSoloed ? '#fbbf24' : inactiveBg,
          border: `1px solid ${isSoloed ? '#fbbf24' : inactiveBorder}`,
          color: isSoloed ? '#1E293B' : inactiveColor,
          borderRadius: '4px', cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontFamily: "'Inter', sans-serif",
          boxShadow: isPremium && !isSoloed ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
        }}
      >S</button>
    </div>
  );
};

export default MuteSoloButtons;
