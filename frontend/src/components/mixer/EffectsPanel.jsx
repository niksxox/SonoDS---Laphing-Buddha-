import React from 'react';
import useMixerStore from '../../store/useMixerStore';

const AVAILABLE_PLUGINS = [
  { value: 'eq', label: 'SonoDS EQ' },
  { value: 'saturator', label: 'SonoDS Saturator' },
  { value: 'compressor', label: 'SonoDS Compressor' },
  { value: 'gate', label: 'SonoDS Gate' },
];

export const EffectsPanel = ({ stems = [] }) => {
  const selectedStemId = useMixerStore((s) => s.selectedStemId);
  const fxSlots = useMixerStore((s) => s.fxSlots);
  const openPluginWindow = useMixerStore((s) => s.openPluginWindow);
  const setSlotPlugin = useMixerStore((s) => s.setSlotPlugin);
  const toggleSlotBypass = useMixerStore((s) => s.toggleSlotBypass);
  const clearSlot = useMixerStore((s) => s.clearSlot);
  const openPlugin = useMixerStore((s) => s.openPlugin);

  const selectedStem = stems.find((s) => s.id === selectedStemId) || stems[0];
  const activeStemId = selectedStem?.id;

  // 10 insert slots (FL Studio standard)
  const rawSlots = activeStemId && fxSlots[activeStemId] ? fxSlots[activeStemId] : [];
  const slots = Array.from({ length: 10 }, (_, i) => rawSlots[i] || {
    slotIndex: i,
    pluginType: null,
    enabled: true,
    params: {},
  });

  const stemName = selectedStem?.label || selectedStem?.title || activeStemId || 'Master';

  return (
    <div
      style={{
        width: '240px',
        minWidth: '240px',
        background: '#ffffff',
        borderLeft: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        userSelect: 'none',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* --- Rack Header --- */}
      <div
        style={{
          padding: '14px 16px 12px 16px',
          borderBottom: '1px solid #e2e8f0',
          background: '#fafafa',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '1px',
            color: '#64748b',
            textTransform: 'uppercase',
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: '4px',
          }}
        >
          EFFECTS RACK
        </div>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#0f172a',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {stemName}
        </div>
      </div>

      {/* --- Insert Slots (1 to 10) --- */}
      <div
        style={{
          flex: 1,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          overflowY: 'auto',
        }}
      >
        {slots.map((slot, index) => {
          const isLoaded = Boolean(slot.pluginType);
          const pluginMeta = AVAILABLE_PLUGINS.find((p) => p.value === slot.pluginType);
          const isOpen =
            openPluginWindow &&
            openPluginWindow.stemId === activeStemId &&
            openPluginWindow.slotIndex === index;

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '34px',
                padding: '0 8px',
                borderRadius: '6px',
                background: isOpen ? '#f1f5f9' : isLoaded ? '#f8fafc' : '#ffffff',
                border: isOpen
                  ? '1px solid #0f172a'
                  : isLoaded
                  ? '1px solid #cbd5e1'
                  : '1px solid #e2e8f0',
                boxSizing: 'border-box',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Bypass Indicator Light */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isLoaded && activeStemId) toggleSlotBypass(activeStemId, index);
                }}
                disabled={!isLoaded}
                title={isLoaded ? (slot.enabled ? 'Mute/Bypass' : 'Enable') : 'Empty slot'}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  border: 'none',
                  padding: 0,
                  cursor: isLoaded ? 'pointer' : 'default',
                  background: isLoaded
                    ? slot.enabled
                      ? '#10b981'
                      : '#94a3b8'
                    : '#e2e8f0',
                  flexShrink: 0,
                }}
              />

              {/* Slot Number */}
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                  color: '#94a3b8',
                  width: '16px',
                  flexShrink: 0,
                }}
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              {/* Slot Content: Plugin Name or Dropdown */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                {isLoaded ? (
                  <div
                    onClick={() => activeStemId && openPlugin(activeStemId, index, slot.pluginType)}
                    title="Click to open plugin window"
                    style={{
                      width: '100%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: slot.enabled ? '#0f172a' : '#94a3b8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pluginMeta?.label || slot.pluginType}
                    </span>
                    <span
                      style={{
                        fontSize: '8px',
                        fontFamily: "'JetBrains Mono', monospace",
                        color: isOpen ? '#0f172a' : '#64748b',
                        fontWeight: 700,
                        background: isOpen ? '#e2e8f0' : '#f1f5f9',
                        padding: '1px 4px',
                        borderRadius: '3px',
                      }}
                    >
                      {isOpen ? 'OPEN' : 'EDIT'}
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value && activeStemId) {
                          setSlotPlugin(activeStemId, index, e.target.value);
                          openPlugin(activeStemId, index, e.target.value);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '4px 18px 4px 0',
                        fontSize: '11px',
                        color: '#94a3b8',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        cursor: 'pointer',
                        appearance: 'none',
                      }}
                    >
                      <option value="" disabled>
                        (Select effect...)
                      </option>
                      {AVAILABLE_PLUGINS.map((p) => (
                        <option key={p.value} value={p.value} style={{ color: '#0f172a' }}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <span
                      style={{
                        position: 'absolute',
                        right: 0,
                        pointerEvents: 'none',
                        fontSize: '8px',
                        color: '#94a3b8',
                      }}
                    >
                      ▼
                    </span>
                  </div>
                )}
              </div>

              {/* Clear Slot (✕) */}
              {isLoaded && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeStemId) clearSlot(activeStemId, index);
                  }}
                  title="Remove effect"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EffectsPanel;
