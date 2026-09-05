import React from 'react';
import './VstStyles.css'; // We will put the "Metal" look here

export default function VstInterface({ children }) {
  return (
    // The "Studio Room" Background
    <div className="studio-room">
      
      {/* The Physical Device */}
      <div className="hardware-chassis">
        
        {/* The "Screws" (Visual flair - strictly aesthetic) */}
        <div className="screw top-left"></div>
        <div className="screw top-right"></div>
        <div className="screw bottom-left"></div>
        <div className="screw bottom-right"></div>

        {/* The Top Header / Branding Plate */}
        <div className="faceplate-header">
           <div className="brand-logo">SONO<span className="brand-highlight">DS</span></div>
           <div className="model-number">AI-MIX-01 // PROTOTYPE</div>
           <div className="power-light active"></div>
        </div>

        {/* The Main Interface Area (Recessed) */}
        <div className="interface-bed">
            {children}
        </div>

      </div>
    </div>
  );
}