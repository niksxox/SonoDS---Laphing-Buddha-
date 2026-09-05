import React from 'react';
import styles from './StatusDots.module.css';

export interface TrafficLightsProps {
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  cpuWarning?: boolean;
  overload?: boolean;
}

export type StatusDotsProps = TrafficLightsProps;

export const TrafficLights: React.FC<TrafficLightsProps> = ({
  onClose,
  onMinimize,
  onMaximize,
  cpuWarning = false,
  overload = false,
}) => {
  return (
    <div className={styles.trafficLights}>
      <button
        type="button"
        className={`${styles.dot} ${styles.dotRed} ${overload ? styles.active : ''}`}
        onClick={onClose}
        title="Close / Hide Plugin"
        aria-label="Close"
      >
        <svg className={styles.glyph} width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 1L5 5M5 1L1 5" stroke="rgba(0,0,0,0.65)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className={`${styles.dot} ${styles.dotAmber} ${cpuWarning ? styles.active : ''}`}
        onClick={onMinimize}
        title="Minimize / Compact View"
        aria-label="Minimize"
      >
        <svg className={styles.glyph} width="6" height="2" viewBox="0 0 6 2">
          <path d="M0.75 1H5.25" stroke="rgba(0,0,0,0.65)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className={`${styles.dot} ${styles.dotGreen}`}
        onClick={onMaximize}
        title="Maximize / Fullscreen"
        aria-label="Maximize"
      >
        <svg className={styles.glyph} width="6" height="6" viewBox="0 0 6 6">
          <path d="M3 0.75V5.25M0.75 3H5.25" stroke="rgba(0,0,0,0.65)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};

export const StatusDots = TrafficLights;

