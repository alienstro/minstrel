import { type InputHTMLAttributes, useId } from 'react';
import { FieldError } from '@/components/ui/text-field';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

// The canvas auth fields: the placeholder shows the label, and a hidden label names the field for screen readers.
// The error goes below the card. The field names it with aria-describedby (spec §10.3).
export function AuthField({ label, error, id, ...input }: AuthFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <>
      <label htmlFor={fieldId} className="vh">
        {label}
      </label>
      <input
        id={fieldId}
        className="in"
        placeholder={label}
        style={{ flex: '1 1 200px' }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        {...input}
      />
    </>
  );
}

// The errors of the fields in one card, in the order of the fields.
export function AuthFieldErrors({ errors }: { errors: { id: string; message?: string }[] }) {
  const shown = errors.filter((error) => error.message);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      {shown.map((error) => (
        <FieldError key={error.id} id={`${error.id}-error`}>
          {error.message}
        </FieldError>
      ))}
    </div>
  );
}
