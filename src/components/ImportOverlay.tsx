import { useEffect, useRef } from 'react';
import type { ImportProgress } from '../types';

const phaseLabels: Record<ImportProgress['phase'], string> = {
  reading: '正在讀取 PDF…',
  extracting: '正在整理文章…',
  annotating: '正在加入粵拼…',
  saving: '正在儲存到這部裝置…'
};

function progressValue(progress: ImportProgress) {
  const ratio = progress.total > 0 ? progress.current / progress.total : 0;

  switch (progress.phase) {
    case 'reading':
      return 4;
    case 'extracting':
      return 8 + ratio * 42;
    case 'annotating':
      return 50 + ratio * 46;
    case 'saving':
      return 99;
  }
}

export default function ImportOverlay({ progress }: { progress: ImportProgress }) {
  const value = progressValue(progress);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={dialogRef}
      className="import-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-status"
      tabIndex={-1}
    >
      <div className="import-panel">
        <div className="import-glyph" aria-hidden="true">粵</div>
        <p id="import-status" aria-live="polite">{phaseLabels[progress.phase]}</p>
        {progress.total > 0 && progress.phase !== 'saving' ? (
          <span className="import-count">
            {progress.current} / {progress.total}
          </span>
        ) : null}
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value)}
        >
          <span style={{ width: `${value}%` }} />
        </div>
      </div>
    </div>
  );
}
