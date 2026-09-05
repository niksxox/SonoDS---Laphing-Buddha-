import React from 'react';
import styles from './ModePills.module.css';

export type EqMode = 'curve' | 'dynamic' | 'ai';

export interface ModePillsProps {
  activeMode: EqMode;
  onModeChange: (mode: EqMode) => void;
}

export const ModePills: React.FC<ModePillsProps> = ({ activeMode, onModeChange }) => {
  return (
    <div className={styles.bottomBar}>
      <div className={styles.modePillsRow}>
        <div
          className={`${styles.sketchPill} ${activeMode === 'curve' ? styles.active : ''}`}
          onClick={() => onModeChange('curve')}
          title="Response Curve & Shape Controls"
        >
          <div className={styles.pillInnerRing}>
            <span className={styles.pillIcon}>EQ</span>
          </div>
        </div>

        <div
          className={`${styles.sketchPill} ${activeMode === 'dynamic' ? styles.active : ''}`}
          onClick={() => onModeChange('dynamic')}
          title="Dynamic EQ Mode (Compressor / Expander)"
        >
          <div className={styles.pillInnerRing}>
            <span className={styles.pillIcon}>DYN</span>
          </div>
        </div>

        <div
          className={`${styles.sketchPill} ${activeMode === 'ai' ? styles.active : ''}`}
          onClick={() => onModeChange('ai')}
          title="SonoAI Assist & Reference Matching"
        >
          <div className={styles.pillInnerRing}>
            <span className={styles.pillIcon}>AI</span>
          </div>
        </div>
      </div>
    </div>
  );
};
