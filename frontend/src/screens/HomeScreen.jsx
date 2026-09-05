import React from 'react';

const HomeScreen = ({ onStart, mode, onModeChange }) => {
  const isAuto = mode === 'auto';
  const isPremium = mode === 'learn';

  const taglines = {
    auto: '"ONE-CLICK PERFECTION" // AI-driven spectral balancing.',
    learn: '"MASTER THE MIX" // Unlock educational insights and manual tools.',
  };

  return (
    <div style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '28px',
      color: 'var(--text-main)',
      position: 'relative',
      zIndex: 1,
    }}>
      {/* Hero */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: '3.2rem',
          letterSpacing: '12px',
          fontWeight: 800,
          margin: '0 0 10px 0',
          color: isPremium ? '#1E293B' : 'var(--text-main)',
          fontFamily: "'Inter', sans-serif",
          textShadow: isPremium ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
        }}>
          SONO<span className="brand-highlight">DS</span>
        </h1>
        <p style={{
          fontSize: '10px',
          letterSpacing: '4px',
          color: isPremium ? '#475569' : 'var(--text-dim)',
          fontWeight: 600,
          margin: 0,
          fontFamily: "'Inter', sans-serif",
          textTransform: 'uppercase',
        }}>
          SELECT OPERATING PROTOCOL
        </p>
      </div>

      {/* Mode Toggle — Premium pill */}
      <div style={{
        display: 'flex',
        borderRadius: '16px',
        overflow: 'hidden',
        background: isPremium ? 'rgba(255,255,255,0.5)' : 'var(--btn-bg)',
        border: isPremium ? '1px solid rgba(255,255,255,0.7)' : '1px solid var(--btn-border)',
        boxShadow: isPremium ? '0 4px 16px rgba(0,0,0,0.08)' : 'var(--btn-shadow)',
        backdropFilter: isPremium ? 'blur(12px)' : 'none',
        padding: '4px',
        gap: '0px',
      }}>
        <button
          onClick={() => onModeChange('auto')}
          style={{
            padding: '12px 32px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '3px',
            fontFamily: "'Inter', sans-serif",
            cursor: 'pointer',
            border: 'none',
            borderRadius: '12px',
            transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            minWidth: '110px',
            ...(isAuto ? {
              background: 'var(--luna-gradient)',
              color: '#FFFFFF',
              boxShadow: isPremium ? '0 4px 16px rgba(30,41,59,0.3)' : '0 4px 16px rgba(167,139,250,0.35)',
            } : {
              background: 'transparent',
              color: isPremium ? '#475569' : 'var(--text-dim)',
              boxShadow: 'none',
            }),
          }}
        >
          AUTO
        </button>
        <button
          onClick={() => onModeChange('learn')}
          style={{
            padding: '12px 32px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '3px',
            fontFamily: "'Inter', sans-serif",
            cursor: 'pointer',
            border: 'none',
            borderRadius: '12px',
            transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            minWidth: '110px',
            ...(!isAuto ? {
              background: 'var(--luna-gradient)',
              color: '#FFFFFF',
              boxShadow: isPremium ? '0 4px 16px rgba(30,41,59,0.3)' : '0 4px 16px rgba(167,139,250,0.35)',
            } : {
              background: 'transparent',
              color: isPremium ? '#475569' : 'var(--text-dim)',
              boxShadow: 'none',
            }),
          }}
        >
          LEARN
        </button>
      </div>

      {/* Mode tagline */}
      <p style={{
        fontSize: '10px',
        color: isPremium ? '#475569' : 'var(--text-dim)',
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '1px',
        textAlign: 'center',
        maxWidth: '380px',
        lineHeight: 1.5,
        margin: 0,
        transition: 'all 0.3s ease',
        textShadow: isPremium ? '0 0 8px rgba(255,255,255,0.6)' : 'none',
      }}>
        {taglines[mode]}
      </p>

      {/* Initialize button */}
      <button
        onClick={() => onStart(mode)}
        style={{
          padding: '14px 48px',
          background: isPremium ? 'rgba(255,255,255,0.55)' : 'var(--btn-bg)',
          border: isPremium ? '1px solid rgba(255,255,255,0.7)' : '1px solid var(--btn-border)',
          borderRadius: '12px',
          boxShadow: isPremium ? '0 4px 16px rgba(0,0,0,0.08)' : 'var(--btn-shadow)',
          backdropFilter: isPremium ? 'blur(12px)' : 'none',
          color: isPremium ? '#1E293B' : 'var(--text-dim)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '3px',
          cursor: 'pointer',
          fontFamily: "'Inter', sans-serif",
          transition: 'all 0.3s ease',
        }}
        onMouseOver={(e) => {
          e.target.style.transform = 'translateY(-2px)';
          e.target.style.background = isPremium ? 'rgba(255,255,255,0.7)' : 'var(--btn-bg)';
          e.target.style.color = isPremium ? '#0F172A' : 'var(--accent)';
        }}
        onMouseOut={(e) => {
          e.target.style.transform = 'translateY(0)';
          e.target.style.background = isPremium ? 'rgba(255,255,255,0.55)' : 'var(--btn-bg)';
          e.target.style.color = isPremium ? '#1E293B' : 'var(--text-dim)';
        }}
      >
        INITIALIZE SYSTEM
      </button>
    </div>
  );
};

export default HomeScreen;
