import React from 'react';
import CareerMode from '../components/CareerMode'; // The big HUD component
import { useNavigate } from 'react-router-dom';
import '../VstStyles.css'; 

export default function CareerPage() {
  const navigate = useNavigate();

  return (
    <div className="vst-screen-content">
      {/* HEADER with Back Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <button 
          onClick={() => navigate('/learning-hub')}
          style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
        >
          ← BACK
        </button>
        <h2 style={{ fontSize: '1rem', letterSpacing: '2px', color: '#94a3b8', margin: 0 }}>
          CAREER OPS // <span style={{ color: '#7c3aed', fontWeight: '800' }}>SEASON 1</span>
        </h2>
      </div>

      {/* The Full HUD Component Container */}
      <div style={{ padding: '40px', height: 'calc(100% - 70px)', boxSizing: 'border-box' }}>
        <CareerMode />
      </div>
    </div>
  );
}