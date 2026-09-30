'use client';
import { forwardRef } from 'react';
import type { Breadcrumb as Crumb } from '@/lib/form/navigation';

interface Props {
  crumb: Crumb | null;
  open: boolean;
  /** True while a save is in flight: the sheet cannot be opened. */
  disabled?: boolean;
  onOpen: () => void;
}

/** "Chapter › Screen · N de M" under the progress bar, plus the button that opens the sections sheet. */
export const Breadcrumb = forwardRef<HTMLButtonElement, Props>(function Breadcrumb({ crumb, open, disabled = false, onOpen }, ref) {
  const where = crumb?.screenTitle ? `${crumb.position} de ${crumb.total}` : null;
  const spoken = crumb
    ? `Estás en ${crumb.chapterTitle}${crumb.screenTitle ? `, ${crumb.screenTitle}, pantalla ${where}` : ''}`
    : '';
  return (
    <div className="crumb-bar">
      <nav aria-label="Ubicación en el formulario" className="crumb" data-testid="breadcrumb">
        {crumb && (
          <>
            <span className="sr-only">{spoken}</span>
            <span className="crumb-line" aria-hidden="true" title={spoken}>
              <span className="crumb-text">
                <span className="crumb-chapter">{crumb.chapterTitle}</span>
                {crumb.screenTitle && (
                  <>
                    <span className="crumb-sep">›</span>
                    <span className="crumb-screen">{crumb.screenTitle}</span>
                  </>
                )}
              </span>
              {where && <span className="crumb-pos">· {where}</span>}
            </span>
          </>
        )}
      </nav>
      <button
        ref={ref}
        type="button"
        className="sections-btn"
        data-testid="sections-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        // aria-disabled (not `disabled`) keeps the button focusable, so focus can return to it when the
        // sheet closes at the start of a jump whose save is still in flight.
        aria-disabled={disabled || undefined}
        onClick={() => { if (!disabled) onOpen(); }}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
          <path d="M6.5 4.5h8M6.5 9h8M6.5 13.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="3" cy="4.5" r="1.1" fill="currentColor" />
          <circle cx="3" cy="9" r="1.1" fill="currentColor" />
          <circle cx="3" cy="13.5" r="1.1" fill="currentColor" />
        </svg>
        Secciones
      </button>
    </div>
  );
});
