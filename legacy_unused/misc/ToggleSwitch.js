import React from 'react';
import './ToggleSwitch.css';

export default function ToggleSwitch({ labelLeft, labelRight, active, onToggle }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="toggle-plate">
        
        {/* The Text Labels on the Metal Plate */}
        <div className={`mode-label ${active === 'left' ? 'glow-blue' : ''}`}>{labelLeft}</div>
        
        {/* The Physical Switch Mechanism */}
        <div 
            className={`switch-body ${active === 'right' ? 'toggled-right' : 'toggled-left'}`}
            onClick={onToggle}
        >
            <div className="switch-handle"></div>
        </div>

        <div className={`mode-label ${active === 'right' ? 'glow-red' : ''}`}>{labelRight}</div>
      
      </div>
    </div>
  );
}