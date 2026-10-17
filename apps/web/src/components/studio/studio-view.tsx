'use client';

import type { GenerationDto, ModelOption, Page } from '@minstrel/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { connectionsQuery, providersQuery } from '@/components/connections/connection-list';
import { isFinished } from '@/hooks/use-generation';
import { apiFetch } from '@/lib/api';
import { SongForm } from './song-form';
import { TakesPanel } from './takes-panel';

// Spec §5.3 step 4: the Takes panel reads GET /api/generations, so a reload keeps the songs in
// progress. One read per visit is enough, because each take then polls its own row.
const recentGenerationsQuery = {
  queryKey: ['generations', 'recent'],
  queryFn: () => apiFetch<Page<GenerationDto>>('/api/generations'),
  staleTime: Infinity,
};

// The panel is not a second Library, so it keeps only the newest finished songs.
const FINISHED_TAKES = 3;

function takesToShow(created: GenerationDto[], recent: GenerationDto[]): GenerationDto[] {
  const createdIds = new Set(created.map((g) => g.id));
  let finished = 0;
  const seeded = recent.filter(
    (g) => !createdIds.has(g.id) && (!isFinished(g.status) || finished++ < FINISHED_TAKES),
  );
  return [...created, ...seeded];
}

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
  const recent = useQuery(recentGenerationsQuery);
  const [created, setCreated] = useState<GenerationDto[]>([]);

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
          onCreated={(g) => setCreated((list) => [g, ...list])}
        />
      </section>
      <section className="card" aria-label="Takes">
        <span className="card-pill">Takes</span>
        <TakesPanel generations={takesToShow(created, recent.data?.items ?? [])} />
      </section>
    </div>
  );
}
