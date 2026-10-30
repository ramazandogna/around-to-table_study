import type { ReactNode } from 'react';

/**
 * The one look for every screen from naming yourself to sitting at the table:
 * a warm wooden frame, a big title and chunky choices. Keep new dialogs on
 * these pieces so they all feel like the same place.
 */
export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`} aria-label={title}>
      {title && <h2 className="panel-title">{title}</h2>}
      {children}
    </section>
  );
}

/** A dimmed layer that centers a panel and keeps taps from reaching the world. */
export function Dialog({ children }: { children: ReactNode }) {
  return (
    <div className="dialog" role="dialog" aria-modal="true">
      {children}
    </div>
  );
}

export function Choice({
  icon,
  label,
  hint,
  shortcut,
  selected,
  onSelect,
}: {
  icon: string;
  label: string;
  hint?: string;
  shortcut?: number;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="choice" aria-pressed={selected ?? false} onClick={onSelect}>
      <span className="choice-icon" aria-hidden>
        {icon}
      </span>
      <span className="choice-text">
        <span className="choice-label">{label}</span>
        {hint && <span className="choice-hint">{hint}</span>}
      </span>
      {shortcut !== undefined && (
        <kbd className="choice-key" aria-hidden>
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

export function Check({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check" aria-disabled={disabled}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="choice-text">
        <span className="choice-label">{label}</span>
        {hint && <span className="choice-hint">{hint}</span>}
      </span>
    </label>
  );
}
