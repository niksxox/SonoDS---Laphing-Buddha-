import React from 'react';
import { BandState, CutSlope, ProcessingMode, Shape } from '@sonods/eq-engine';
import styles from './ContextMenu.module.css';

export interface ContextMenuProps {
  x: number;
  y: number;
  band: BandState;
  onSelectShape: (shape: Shape) => void;
  onSelectSlope: (slope: CutSlope) => void;
  onToggleDynamic: () => void;
  onToggleMode: () => void;
  onDeleteBand: () => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  band,
  onSelectShape,
  onSelectSlope,
  onToggleDynamic,
  onToggleMode,
  onDeleteBand,
}) => {
  const isCut = band.shape === Shape.LowCut || band.shape === Shape.HighCut;

  return (
    <div
      className={styles.contextMenu}
      style={{ left: `${Math.min(x, 740)}px`, top: `${Math.min(y, 240)}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`${styles.menuItem} ${band.shape === Shape.Bell ? styles.menuItemActive : ''}`}
        onClick={() => onSelectShape(Shape.Bell)}
      >
        Bell (Peak)
      </div>
      <div
        className={`${styles.menuItem} ${band.shape === Shape.LowShelf ? styles.menuItemActive : ''}`}
        onClick={() => onSelectShape(Shape.LowShelf)}
      >
        Low Shelf
      </div>
      <div
        className={`${styles.menuItem} ${band.shape === Shape.HighShelf ? styles.menuItemActive : ''}`}
        onClick={() => onSelectShape(Shape.HighShelf)}
      >
        High Shelf
      </div>
      <div
        className={`${styles.menuItem} ${band.shape === Shape.LowCut ? styles.menuItemActive : ''}`}
        onClick={() => onSelectShape(Shape.LowCut)}
      >
        Low Cut (HPF)
      </div>
      <div
        className={`${styles.menuItem} ${band.shape === Shape.HighCut ? styles.menuItemActive : ''}`}
        onClick={() => onSelectShape(Shape.HighCut)}
      >
        High Cut (LPF)
      </div>

      {isCut && (
        <>
          <div className={styles.menuDivider} />
          <div
            className={`${styles.menuItem} ${band.slope === 12 ? styles.menuItemActive : ''}`}
            onClick={() => onSelectSlope(12)}
          >
            Slope: 12 dB/oct
          </div>
          <div
            className={`${styles.menuItem} ${band.slope === 24 ? styles.menuItemActive : ''}`}
            onClick={() => onSelectSlope(24)}
          >
            Slope: 24 dB/oct
          </div>
          <div
            className={`${styles.menuItem} ${band.slope === 48 ? styles.menuItemActive : ''}`}
            onClick={() => onSelectSlope(48)}
          >
            Slope: 48 dB/oct
          </div>
          <div
            className={`${styles.menuItem} ${band.slope === 96 ? styles.menuItemActive : ''}`}
            onClick={() => onSelectSlope(96)}
          >
            Slope: 96 dB/oct (Steep)
          </div>
        </>
      )}

      <div className={styles.menuDivider} />
      <div className={styles.menuItem} onClick={onToggleDynamic}>
        {band.dynamicEnabled ? '✓ Dynamic EQ: ON' : 'Dynamic EQ: OFF'}
      </div>
      <div className={styles.menuItem} onClick={onToggleMode}>
        Mode:{' '}
        {band.mode === ProcessingMode.Stereo
          ? 'Stereo'
          : band.mode === ProcessingMode.Mid
          ? 'Mid'
          : 'Side'}
      </div>

      <div className={styles.menuDivider} />
      <div className={`${styles.menuItem} ${styles.deleteItem}`} onClick={onDeleteBand}>
        Delete Band
      </div>
    </div>
  );
};
