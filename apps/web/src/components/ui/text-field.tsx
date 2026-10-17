import { type InputHTMLAttributes, useId } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

// Spec §10.3: the error text sits next to its field and the field names it with aria-describedby.
// Errors use no color: a 2 px ink edge, bold text, and an icon.
export function TextField({ label, error, id, 'aria-describedby': hintId, ...input }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  // A hint and an error can both describe the field.
  const describedBy = [error ? errorId : undefined, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={fieldId} className="lbl">
        {label}
      </label>
      <input
        id={fieldId}
        className="in"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {error ? (
        <div className="pl-5">
          <FieldError id={errorId}>{error}</FieldError>
        </div>
      ) : null}
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
