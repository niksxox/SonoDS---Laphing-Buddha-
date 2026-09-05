import React from "react";
import { useNavigate } from "react-router-dom";

export default function NavControls() {
  const navigate = useNavigate();
  // REMOVED: The check that hid buttons on "/" path

  return (
    <div className="nav-controls-container">
      {/* BACK BUTTON */}
      <button 
        className="nav-mini-btn" 
        onClick={() => navigate(-1)} 
        title="Go Back"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      {/* HOME BUTTON */}
      <button 
        className="nav-mini-btn home-btn" 
        onClick={() => navigate("/")} 
        title="Return to Gateway"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </button>
    </div>
  );
}