import React from 'react';
import VerticalFader from './VerticalFader';
import VUMeter from './VUMeter';
import MuteSoloButtons from './MuteSoloButtons';
import { DEVIATION_THRESHOLD } from '../../utils/stemConfig';

const ChannelStrip = ({ 
  stem, isSelected, isMuted, isSoloed, 
  onSelect, onMute, onSolo, onGainChange, 
  getAnalyserData, isPlaying,
  bypass, bypassVersion, currentDB,
  locked, onLockedAttempt, mode,
}) => {
  const threshold = stem.safeRange != null ? stem.safeRange : DEVIATION_THRESHOLD;
  const deviation = currentDB !== undefined ? Math.abs(currentDB - stem.initialDB) : 0;
  const isInDanger = !bypass && deviation > threshold;

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 8px',
        background: isInDanger
          ? 'rgba(239,68,68,0.06)'
          : isSelected 
            ? 'var(--mixer-channel-bg-selected)' 
            : 'var(--mixer-channel-bg)',
        border: isInDanger
          ? '1.5px solid rgba(239,68,68,0.4)'
          : isSelected
            ? `1.5px solid var(--mixer-channel-border-selected)`
            : `0.5px solid var(--mixer-channel-border)`,
        borderRadius: '12px',
        minWidth: '70px',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'all 0.3s ease',
        boxShadow: isInDanger ? '0 0 16px rgba(239,68,68,0.15)' : 'none',
      }}
    >
      {/* Channel label + color dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <div style={{ 
          width: '6px', height: '6px', borderRadius: '50%', 
          background: isInDanger ? '#ef4444' : stem.color,
          boxShadow: isInDanger
            ? '0 0 8px rgba(239,68,68,0.6)'
            : isSelected ? `0 0 8px ${stem.color}` : 'none',
          transition: 'all 0.3s ease',
        }} />
        <span style={{ 
          fontSize: '9px', letterSpacing: '1px', 
          color: isInDanger ? '#ef4444' : isSelected ? 'var(--mixer-label-color-active)' : 'var(--mixer-label-color)', 
          fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
        }}>
          {stem.displayName.toUpperCase()}
        </span>
      </div>

      {/* VU Meter + Fader side by side */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
        <VUMeter 
          getAnalyserData={() => getAnalyserData(stem.id)} 
          isPlaying={isPlaying} 
        />
        <VerticalFader
          stemId={stem.id}
          initialDB={stem.initialDB}
          safeRange={threshold}
          onGainChange={onGainChange}
          isSelected={isSelected}
          bypass={bypass}
          bypassVersion={bypassVersion}
          locked={locked}
          onLockedAttempt={onLockedAttempt}
        />
      </div>

      {/* Mute / Solo */}
      <MuteSoloButtons
        stemId={stem.id}
        isMuted={isMuted}
        isSoloed={isSoloed}
        onMute={onMute}
        onSolo={onSolo}
        mode={mode}
      />
    </div>
  );
};

export default ChannelStrip;
