'use client';

import type { ConnectionDto, CreateConnectionBody, ProviderInfo } from '@minstrel/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { FieldError, TextField } from '@/components/ui/text-field';
import { ApiClientError, apiFetch } from '@/lib/api';

interface Props {
  providers: ProviderInfo[];
  onAdded: (connection: ConnectionDto) => void;
}

export function AddConnectionForm({ providers, onAdded }: Props) {
  const [adapter, setAdapter] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const provider = providers.find((p) => p.adapter === adapter);

  const add = useMutation({
    mutationFn: (body: CreateConnectionBody) =>
      apiFetch<ConnectionDto>('/api/connections', { method: 'POST', body: JSON.stringify(body) }),
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!provider) return setFields({ adapter: 'Choose a provider.' });
    const apiKey = String(form.get('apiKey') ?? '').trim();
    if (!apiKey) return setFields({ apiKey: 'Enter the key.' });
    const baseUrl = String(form.get('baseUrl') ?? '').trim();
    setFields({});
    try {
      const connection = await add.mutateAsync({
        kind: provider.kind,
        adapter: provider.adapter,
        label: String(form.get('label') ?? '').trim() || provider.displayName,
        apiKey,
        ...(baseUrl ? { baseUrl } : {}),
      });
      formElement.reset();
      setAdapter('');
      onAdded(connection);
    } catch (error) {
      if (error instanceof ApiClientError) setFields(error.fields ?? { form: error.message });
      else setFields({ form: 'Minstrel could not add the key. Try again.' });
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="card flex flex-col gap-4">
      <span className="card-pill">Add key</span>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="add-provider" className="type-label text-muted">
          Provider
        </label>
        <select
          id="add-provider"
          name="adapter"
          className="field"
          value={adapter}
          onChange={(e) => setAdapter(e.target.value)}
          aria-invalid={fields.adapter ? true : undefined}
          aria-describedby={fields.adapter ? 'add-provider-error' : undefined}
        >
          <option value="">Choose a provider</option>
          {providers.map((p) => (
            <option key={p.adapter} value={p.adapter}>
              {p.displayName} ({p.kind === 'music' ? 'songs' : 'lyrics helper'})
            </option>
          ))}
        </select>
        {fields.adapter ? <FieldError id="add-provider-error">{fields.adapter}</FieldError> : null}
      </div>
      <TextField label="Label" name="label" placeholder={provider?.displayName ?? 'For example, kie.ai'} error={fields.label} />
      <TextField label="API key" name="apiKey" type="password" autoComplete="off" error={fields.apiKey} />
      <details>
        <summary className="type-label cursor-pointer text-muted">Change the base URL</summary>
        <div className="mt-3">
          <TextField
            label="Base URL"
            name="baseUrl"
            type="url"
            placeholder={provider?.defaultBaseUrl ?? 'https://'}
            error={fields.baseUrl}
          />
        </div>
      </details>
      {fields.form ? (
        <div role="alert">
          <FieldError id="add-form-error">{fields.form}</FieldError>
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={add.isPending}>
        <span>Add key</span>
        <span aria-hidden="true">›</span>
      </button>
    </form>
  );
}
