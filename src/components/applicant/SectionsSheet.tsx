'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { entryTarget, type OutlineEntry } from '@/lib/form/navigation';

interface Props {
  outline: OutlineEntry[];
  /** Outline entry id of the step on screen. */
  currentSectionId: string | null;
  currentIndex: number;
  onJump: (stepIndex: number) => void;
  /** True while a save is in flight: rows cannot start a jump until it ends. */
  disabled?: boolean;
  onClose: () => void;
  /** Receives focus back when the sheet closes. */
  returnFocus: RefObject<HTMLElement | null>;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className="sheet-icon">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DotIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className="sheet-icon">
      <circle cx="8" cy="8" r="4.5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function statusOf(entry: OutlineEntry, current: boolean): { text: string; tone: 'done' | 'todo' | 'current' | 'none' } {
  if (current) return { text: 'En curso', tone: 'current' };
  if (entry.kind === 'review') return { text: 'Resumen y envío', tone: 'none' };
  return entry.status === 'complete' ? { text: 'Completa', tone: 'done' } : { text: `Faltan ${entry.missing}`, tone: 'todo' };
}

/** Bottom sheet listing every section (and its screens) so the applicant can jump anywhere. */
export function SectionsSheet({ outline, currentSectionId, currentIndex, onJump, disabled = false, onClose, returnFocus }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(currentSectionId ? [currentSectionId] : []));

  useEffect(() => {
    const opener = returnFocus.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [returnFocus]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const toggle = (id: string) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="sheet-root" onKeyDown={onKeyDown}>
      <div className="sheet-overlay" onClick={onClose} aria-hidden="true" data-testid="sheet-overlay" />
      <div ref={panelRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-head">
          <span className="sheet-grip" aria-hidden="true" />
          <h2 id={titleId}>Secciones</h2>
          <button ref={closeRef} type="button" className="sheet-close" onClick={onClose}>Cerrar</button>
        </div>
        <ul className="sheet-list">
          {outline.map((entry) => {
            const current = entry.id === currentSectionId;
            const status = statusOf(entry, current);
            const open = entry.kind === 'chapter' && expanded.has(entry.id);
            const listId = `${titleId}-${entry.id}`;
            return (
              <li key={entry.id} className={`sheet-section${current ? ' is-current' : ''}`}>
                <div className="sheet-row">
                  <button
                    type="button"
                    className="sheet-jump"
                    data-testid={`section-row-${entry.id}`}
                    aria-current={current ? 'true' : undefined}
                    disabled={disabled}
                    onClick={() => onJump(entryTarget(entry))}
                  >
                    <span className="sheet-title">{entry.title}</span>
                    <span className={`sheet-status tone-${status.tone}`}>
                      {status.tone === 'done' && <CheckIcon />}
                      {status.tone === 'todo' && <DotIcon filled={false} />}
                      {status.tone === 'current' && <DotIcon filled />}
                      {status.text}
                    </span>
                  </button>
                  {entry.kind === 'chapter' && (
                    <button
                      type="button"
                      className="sheet-disclosure"
                      aria-expanded={open}
                      aria-controls={listId}
                      aria-label={`${open ? 'Ocultar' : 'Ver'} preguntas de ${entry.title}`}
                      onClick={() => toggle(entry.id)}
                    >
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  )}
                </div>
                {entry.kind === 'chapter' && open && (
                  <ul id={listId} className="sheet-screens">
                    {entry.screens.map((s) => {
                      const here = s.stepIndex === currentIndex;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={`sheet-screen${here ? ' is-here' : ''}`}
                            aria-current={here ? 'step' : undefined}
                            disabled={disabled}
                            onClick={() => onJump(s.stepIndex)}
                          >
                            <span className={`sheet-mark${s.complete ? ' is-done' : ''}`}>{s.complete ? <CheckIcon /> : <DotIcon filled={false} />}</span>
                            <span className="sheet-screen-title">{s.title}</span>
                            <span className="sr-only">{s.complete ? ', completa' : ', incompleta'}</span>
                            {here && <span className="sheet-here">Aquí</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
