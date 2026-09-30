import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { filterOptions } from '@/lib/form/search';
import type { ControlA11y } from './FieldShell';

interface Props {
  fieldKey: string;
  type: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  a11y: ControlA11y;
  disabled?: boolean;
  placeholder?: string;
}

/** Longest list rendered at once; the biggest department has ~125 municipalities, so this only guards odd data. */
const MAX_RENDERED = 200;

/**
 * Searchable single choice (ARIA 1.2 combobox with a listbox popup). Filtering ignores accents and case.
 * The list renders in the page flow (not floating) so it can never sit under the phone keyboard or
 * the sticky action bar.
 */
export function SearchSelect({ fieldKey, type, options, value, onChange, a11y, disabled, placeholder = 'Escribe para buscar' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = `${a11y.id}-list`;
  const optionId = (i: number) => `${a11y.id}-opt-${i}`;

  const matches = useMemo(() => filterOptions(options, query), [options, query]);
  const shown = matches.slice(0, MAX_RENDERED);

  // Keep the keyboard-highlighted option in view.
  useEffect(() => {
    if (active >= 0) (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function openList() {
    if (open || disabled) return;
    setOpen(true);
    setQuery('');
    setActive(Math.max(0, options.indexOf(value)));
    // Bring the field to the top so the list has room above the keyboard.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    inputRef.current?.closest('.field')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }

  function close() {
    setOpen(false);
    setQuery('');
    setActive(-1);
  }

  function choose(v: string) {
    if (v !== value) onChange(v);
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (shown.length ? (i + dir + shown.length) % shown.length : -1));
    } else if (e.key === 'Enter') {
      // Never submit the form from the combobox.
      e.preventDefault();
      if (open && active >= 0 && shown[active]) choose(shown[active]);
      else if (!open) openList();
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === 'Tab') {
      if (open && query && active >= 0 && shown[active]) choose(shown[active]);
      else close();
    }
  }

  return (
    <div className={`combo${open ? ' is-open' : ''}`} data-field={fieldKey} data-type={type}>
      <div className="combo-box">
        <input
          ref={inputRef}
          id={a11y.id}
          className="control combo-input"
          type="text"
          role="combobox"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 && shown[active] ? optionId(active) : undefined}
          aria-invalid={a11y.invalid}
          aria-describedby={a11y.describedBy}
          disabled={disabled}
          placeholder={open ? value || placeholder : placeholder}
          value={open ? query : value}
          onChange={(e) => {
            if (!open) setOpen(true);
            setQuery(e.target.value);
            setActive(0);
          }}
          onClick={openList}
          onFocus={openList}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        {value && !open && !disabled && (
          <button type="button" className="combo-clear" aria-label="Borrar selección" onClick={() => { onChange(''); inputRef.current?.focus(); }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        )}
        <svg aria-hidden="true" className="combo-chevron" width="16" height="16" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      {/* Mouse down (also the compatibility event after a tap) must not blur the input before the click selects. */}
      <div className="combo-pop" hidden={!open} onMouseDown={(e) => e.preventDefault()}>
        <ul ref={listRef} id={listId} role="listbox" aria-labelledby={a11y.labelId} className="combo-list">
          {shown.map((o, i) => (
            <li
              key={o}
              id={optionId(i)}
              role="option"
              aria-selected={o === value}
              className={`combo-option${i === active ? ' is-active' : ''}`}
              onClick={() => choose(o)}
              onPointerMove={() => setActive(i)}
            >
              {o}
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="combo-empty" role="status">Sin resultados</p>}
        {matches.length > shown.length && <p className="combo-empty">Sigue escribiendo para ver más resultados</p>}
      </div>
    </div>
  );
}
