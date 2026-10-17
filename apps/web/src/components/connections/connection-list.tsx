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

  if (connections.isPending || providers.isPending) return <p className="mono mu text-center text-[11px]">Loading keys…</p>;
  if (connections.isError || providers.isError) {
    return <p role="alert">Minstrel could not load your keys. Reload the page.</p>;
  }

  const musicProviders = providers.data.filter((p) => p.kind === 'music');
  const hasMusic = connections.data.some((c) => c.kind === 'music');
  const nameOf = (adapter: string) => providers.data.find((p) => p.adapter === adapter)?.displayName ?? adapter;
  const sections = [
    { kind: 'music', title: 'Music', note: 'makes the songs', text: 'Minstrel makes songs with these keys. Each provider charges your own account.' },
    { kind: 'text', title: 'Text', note: 'writes the words', text: 'These keys write lyrics, styles and titles. Any OpenAI-compatible API works.' },
  ] as const;

  return (
    <div className="flex flex-wrap items-start gap-x-16 gap-y-14">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-14">
        {!hasMusic ? (
          <div className="card px-7 py-6">
            <p className="m-0 text-[14px]">Add a music provider key to make songs.</p>
            <ul aria-label="Music providers" className="m-0 flex list-none flex-wrap gap-2 p-0">
              {musicProviders.map((p) => (
                <li key={p.adapter}>
                  <a href={p.keyUrl} target="_blank" rel="noreferrer" className="pill gl min-h-9 px-4 text-[12px]">
                    Get a {p.displayName} key
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {sections.map((section) => {
          const keys = connections.data.filter((c) => c.kind === section.kind);
          return (
            <section key={section.kind} aria-labelledby={`keys-${section.kind}`}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 id={`keys-${section.kind}`} className="m-0 text-[11px] font-semibold uppercase">
                  {section.title}
                </h2>
                <span className="mono mu text-[11px]">{section.note}</span>
              </div>
              <p className="mu mt-1.5 mb-[18px]">{section.text}</p>
              {keys.length > 0 ? (
                <ul className="m-0 list-none p-0">
                  {keys.map((c) => (
                    <ConnectionRow key={c.id} connection={c} providerName={nameOf(c.adapter)} />
                  ))}
                </ul>
              ) : (
                <p className="mono mu m-0 border-y border-dotted border-black/10 px-3.5 py-4 text-[11px]">
                  No {section.title.toLowerCase()} key yet. Add one in the form.
                </p>
              )}
            </section>
          );
        })}
      </div>
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
        <AddConnectionForm
          providers={providers.data}
          onAdded={() => {
            setToast('Key added');
            void queryClient.invalidateQueries({ queryKey: connectionsQuery.queryKey });
          }}
        />
        <p role="status" aria-live="polite" className="mono m-0 min-h-[18px] text-center text-[11px]">
          {toast}
        </p>
      </div>
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
  const works = connection.status === 'ok';

  return (
    <li aria-labelledby={labelId} className="rel">
      <div className="relative z-[1] flex flex-wrap items-center gap-x-5 gap-y-2.5 px-3.5 py-4">
        <span className="art mono flex size-10 items-center justify-center bg-ink text-[15px] text-white uppercase" aria-hidden="true">
          {providerName.slice(0, 1)}
        </span>
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
          <span id={labelId} className="font-semibold uppercase">
            {connection.label}
          </span>
          <span className="mu text-[11px] font-medium uppercase">
            {providerName} · <span className="tabular">•••• {connection.keyLast4}</span>
          </span>
        </div>
        {confirming ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px]">Remove this key? Songs in progress with this key will fail.</span>
            <button type="button" className="pill dark min-h-9 px-4 text-[11px]" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Yes, remove
            </button>
            <button type="button" className="pill gl min-h-9 px-4 text-[11px]" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            {remove.isError ? (
              <span role="alert" className="text-[12px] font-semibold">
                Minstrel could not remove this key. Try again.
              </span>
            ) : null}
          </span>
        ) : (
          <>
            <span className="mono inline-flex min-w-[140px] items-center gap-2 text-[11px]">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${works ? 'bg-ink' : 'border border-ink'}`} />
              {STATUS_TEXT[connection.status]}
            </span>
            <span className="flex gap-1.5">
              <button type="button" className="pill gl mono min-h-9 px-4 text-[11px] font-normal" disabled={test.isPending} onClick={() => test.mutate()}>
                {test.isPending ? 'Testing…' : 'Test key'}
              </button>
              <button type="button" className="pill gl mono min-h-9 px-4 text-[11px] font-normal" onClick={() => setConfirming(true)}>
                Remove
              </button>
            </span>
          </>
        )}
      </div>
    </li>
  );
}
