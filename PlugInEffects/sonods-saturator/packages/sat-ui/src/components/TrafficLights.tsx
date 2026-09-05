import React from 'react';
import styles from './TrafficLights.module.css';

export interface TrafficLightsProps {
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

export const TrafficLights: React.FC<TrafficLightsProps> = ({
  onClose,
  onMinimize,
  onMaximize,
}) => {
  return (
    <div className={styles.trafficLights}>
      <button
        type="button"
        className={`${styles.dot} ${styles.dotRed}`}
        onClick={onClose}
        title="Close Plugin"
        aria-label="Close"
      >
        <svg className={styles.glyph} width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 1L5 5M5 1L1 5" stroke="rgba(0,0,0,0.65)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className={`${styles.dot} ${styles.dotAmber}`}
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
        title="Maximize / Full View"
        aria-label="Maximize"
      >
        <svg className={styles.glyph} width="6" height="6" viewBox="0 0 6 6">
          <path d="M3 0.75V5.25M0.75 3H5.25" stroke="rgba(0,0,0,0.65)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};
