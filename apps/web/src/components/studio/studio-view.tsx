'use client';

import type { GenerationDto, ModelOption } from '@minstrel/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { connectionsQuery, providersQuery } from '@/components/connections/connection-list';
import { apiFetch } from '@/lib/api';
import { SongForm } from './song-form';

export function StudioView() {
  const connections = useQuery(connectionsQuery);
  const providers = useQuery(providersQuery);
  const music = (connections.data ?? []).filter((c) => c.kind === 'music');
  const modelQueries = useQueries({
    queries: music.map((c) => ({
      queryKey: ['models', c.id],
      queryFn: () => apiFetch<ModelOption[]>(`/api/connections/${c.id}/models`),
      staleTime: 5 * 60_000,
    })),
  });
  const [generations, setGenerations] = useState<GenerationDto[]>([]);

  if (connections.isPending || providers.isPending || modelQueries.some((q) => q.isPending)) {
    return <p className="text-muted">Loading…</p>;
  }
  if (connections.isError || providers.isError) {
    return <p role="alert">Minstrel could not load your keys. Reload the page.</p>;
  }
  if (music.length === 0) {
    return (
      <div className="card max-w-xl">
        <span className="card-pill">Start here</span>
        <p>
          Add a music provider key to make songs.{' '}
          <Link href="/settings/connections" className="underline">
            Add key
          </Link>
        </p>
      </div>
    );
  }

  const models = Object.fromEntries(music.map((c, i) => [c.id, modelQueries[i]?.data ?? []]));
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="card">
        <span className="card-pill">New song</span>
        <SongForm
          connections={connections.data}
          providers={providers.data}
          models={models}
          onCreated={(g) => setGenerations((list) => [g, ...list])}
        />
      </section>
      <section className="card" aria-label="Takes">
        <span className="card-pill">Takes</span>
        {generations.length === 0 ? <p className="text-muted">Your takes appear here.</p> : null}
      </section>
    </div>
  );
}
