import { type InputHTMLAttributes, useId } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

// Spec §10.3: the error text sits next to its field and the field names it with aria-describedby.
// Errors use no color: a 2 px ink edge, bold text, and an icon.
export function TextField({ label, error, id, ...input }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="type-label text-muted">
        {label}
      </label>
      <input
        id={fieldId}
        className="field"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1 text-[12px] font-semibold text-ink">
      <span aria-hidden="true">⚠</span>
      {children}
    </p>
  );
}
