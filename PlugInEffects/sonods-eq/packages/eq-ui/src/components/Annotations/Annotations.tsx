import React from 'react';
import { ExplainableAnnotation } from '../../explainability.js';
import styles from './Annotations.module.css';

export interface AnnotationsProps {
  annotations: ExplainableAnnotation[];
  onDismiss: (id: string) => void;
}

export const Annotations: React.FC<AnnotationsProps> = ({ annotations, onDismiss }) => {
  if (annotations.length === 0) return null;

  return (
    <div className={styles.annotationBanner}>
      {annotations.map((a) => (
        <div key={a.id} className={styles.annotationItem}>
          <span>
            💡 <strong>AI Tip:</strong> {a.text}
          </span>
          <span
            className={styles.annotationClose}
            onClick={() => onDismiss(a.id)}
            title="Dismiss annotation"
          >
            ✕
          </span>
        </div>
      ))}
    </div>
  );
};
