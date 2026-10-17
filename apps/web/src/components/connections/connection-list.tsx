'use client';

import type { ConnectionDto, ConnectionStatus, ProviderInfo } from '@minstrel/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AddConnectionForm } from './add-connection-form';

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  unchecked: 'Not tested',
  ok: 'Key works',
  invalid_key: 'Key not accepted',
  unreachable: 'No answer',
};

export const connectionsQuery = {
  queryKey: ['connections'],
  queryFn: () => apiFetch<ConnectionDto[]>('/api/connections'),
};

export const providersQuery = {
  queryKey: ['providers'],
  queryFn: () => apiFetch<ProviderInfo[]>('/api/providers'),
  staleTime: Infinity,
};

// Spec §10.1. A first-time user sees the empty state with key links. It replaces an onboarding flow.
export function ConnectionsSettings() {
  const queryClient = useQueryClient();
  const connections = useQuery(connectionsQuery);
  const providers = useQuery(providersQuery);
  const [toast, setToast] = useState<string>();

  if (connections.isPending || providers.isPending) return <p className="text-muted">Loading keys…</p>;
  if (connections.isError || providers.isError) {
    return <p role="alert">Minstrel could not load your keys. Reload the page.</p>;
  }

  const musicProviders = providers.data.filter((p) => p.kind === 'music');
  const hasMusic = connections.data.some((c) => c.kind === 'music');
  const nameOf = (adapter: string) => providers.data.find((p) => p.adapter === adapter)?.displayName ?? adapter;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="flex flex-col gap-6">
        {!hasMusic ? (
          <div className="card flex flex-col gap-3">
            <span className="card-pill">Start here</span>
            <p>Add a music provider key to make songs.</p>
            <ul aria-label="Music providers" className="flex flex-col gap-2">
              {musicProviders.map((p) => (
                <li key={p.adapter}>
                  <a href={p.keyUrl} target="_blank" rel="noreferrer" className="underline">
                    Get a {p.displayName} key
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {connections.data.length > 0 ? (
          <div className="card">
            <span className="card-pill">Your keys</span>
            <ul className="flex flex-col divide-y divide-bg">
              {connections.data.map((c) => (
                <ConnectionRow key={c.id} connection={c} providerName={nameOf(c.adapter)} />
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <section className="flex flex-col gap-3">
        <AddConnectionForm
          providers={providers.data}
          onAdded={() => {
            setToast('Key added');
            void queryClient.invalidateQueries({ queryKey: connectionsQuery.queryKey });
          }}
        />
        <p role="status" aria-live="polite" className="min-h-6">
          {toast}
        </p>
      </section>
    </div>
  );
}

function ConnectionRow({ connection, providerName }: { connection: ConnectionDto; providerName: string }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: connectionsQuery.queryKey });
  const test = useMutation({
    mutationFn: () => apiFetch<ConnectionDto>(`/api/connections/${connection.id}/test`, { method: 'POST' }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch<void>(`/api/connections/${connection.id}`, { method: 'DELETE' }),
    onSettled: refresh,
  });
  // The UI never shows a key again (spec §7.1), so a remove asks first, as the Library delete does.
  const [confirming, setConfirming] = useState(false);
  const labelId = `connection-${connection.id}`;

  return (
    <li aria-labelledby={labelId} className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span id={labelId}>{connection.label}</span>
        <span className="type-label text-muted">
          {providerName} · <span className="tabular">•••• {connection.keyLast4}</span> ·{' '}
          {STATUS_TEXT[connection.status]}
        </span>
      </div>
      {confirming ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Remove this key? Songs in progress with this key will fail.</span>
          <button type="button" className="btn btn-soft" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Yes, remove
          </button>
          <button type="button" className="btn btn-text" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          {remove.isError ? (
            <span role="alert" className="text-sm">
              Minstrel could not remove this key. Try again.
            </span>
          ) : null}
        </span>
      ) : (
        <>
          <button type="button" className="btn btn-soft" disabled={test.isPending} onClick={() => test.mutate()}>
            Test key
          </button>
          <button type="button" className="btn btn-text" onClick={() => setConfirming(true)}>
            Remove
          </button>
        </>
      )}
    </li>
  );
}
