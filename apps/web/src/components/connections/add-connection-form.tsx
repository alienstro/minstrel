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
    <form noValidate onSubmit={onSubmit} aria-labelledby="add-key-h" className="card gap-[18px] p-7">
      {/* A small record sleeve with a key on its cover. */}
      <div className="relative mx-auto h-[120px] w-[170px]" aria-hidden="true">
        <span className="disc absolute top-1 left-[52px] size-28" />
        <span className="absolute top-0 left-0 z-[1] flex size-[120px] items-center justify-center rounded-xl bg-ink text-white">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="8" cy="12" r="4" />
            <path d="M12 12h9M18 12v3M21 12v2" />
          </svg>
        </span>
      </div>
      <h2 id="add-key-h" className="m-0 mb-1.5 text-center text-[11px] font-semibold uppercase">
        <span>New connection</span>{' '}
        <span className="serif mt-0.5 block text-[44px] leading-none normal-case">Add a key</span>
      </h2>
      <div className="flex flex-col gap-2">
        <label htmlFor="add-provider" className="lbl">
          Provider
        </label>
        <div className="relative">
          <select
            id="add-provider"
            name="adapter"
            className="in appearance-none pr-10"
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
          <svg
            className="pointer-events-none absolute top-1/2 right-[18px] -translate-y-1/2"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M3.5 6l4.5 4.5 4.5-4.5" />
          </svg>
        </div>
        {fields.adapter ? (
          <div className="pl-5">
            <FieldError id="add-provider-error">{fields.adapter}</FieldError>
          </div>
        ) : null}
      </div>
      <TextField label="Label" name="label" placeholder={provider?.displayName ?? 'For example, kie.ai'} error={fields.label} />
      <div className="flex flex-col gap-2">
        <TextField
          label="API key"
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder="Paste your key"
          aria-describedby="add-key-hint"
          error={fields.apiKey}
        />
        <p className="hint" id="add-key-hint">
          Minstrel encrypts the key and never shows it again.
        </p>
      </div>
      <details>
        <summary className="lbl cursor-pointer">Change the base URL</summary>
        <div className="mt-3 flex flex-col gap-2">
          <TextField
            label="Base URL"
            name="baseUrl"
            type="url"
            placeholder={provider?.defaultBaseUrl ?? 'https://'}
            error={fields.baseUrl}
          />
          <p className="hint">Change it only if your provider gave you another address.</p>
        </div>
      </details>
      {fields.form ? (
        <div role="alert" className="pl-5">
          <FieldError id="add-form-error">{fields.form}</FieldError>
        </div>
      ) : null}
      <button type="submit" className="pill dark mt-1 w-full" disabled={add.isPending}>
        Add key <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
