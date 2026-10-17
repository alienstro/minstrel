'use client';

import type { GenerationDto, ModelOption, Page } from '@minstrel/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { connectionsQuery, providersQuery } from '@/components/connections/connection-list';
import { usePlayer } from '@/components/player/player-context';
import { generationQueryOptions, isFinished } from '@/hooks/use-generation';
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
  const { playing } = usePlayer();
  const takes = takesToShow(created, recent.data?.items ?? []);
  // The count reads the same polled rows as the Takes panel, so it grows as the takes arrive.
  const live = useQueries({ queries: takes.map((g) => generationQueryOptions(g.id, g)) });
  const trackCount = takes.reduce((n, g, i) => n + (live[i]?.data ?? g).tracks.length, 0);

  if (connections.isPending || providers.isPending || modelQueries.some((q) => q.isPending)) {
    return <p className="mono mu text-center text-[11px]">Loading…</p>;
  }
  if (connections.isError || providers.isError) {
    return <p role="alert">Minstrel could not load your keys. Reload the page.</p>;
  }
  if (music.length === 0) {
    return (
      <div className="card mx-auto max-w-xl flex-row flex-wrap items-center justify-between py-3 pr-3 pl-6">
        <p className="m-0 text-[14px]">Add a music provider key to make songs.</p>
        <Link href="/settings/connections" className="pill dark">
          Add key <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  const models = Object.fromEntries(music.map((c, i) => [c.id, modelQueries[i]?.data ?? []]));
  return (
    <div className="flex flex-wrap items-start gap-x-16 gap-y-14">
      <div className="min-w-0 flex-[999_1_560px]">
        <SongForm
          connections={connections.data}
          providers={providers.data}
          models={models}
          onCreated={(g) => setCreated((list) => [g, ...list])}
        />
      </div>
      <section aria-label="Takes" className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
        {/* The record spins while a song plays. */}
        <div className="relative h-[216px] w-[300px] self-center" aria-hidden="true">
          <span className="disc absolute top-2 left-[92px] size-[200px]" data-paused={!playing} />
          <span className="absolute top-0 left-0 z-[1] flex size-[216px] items-center justify-center rounded-2xl bg-ink outline outline-black/25">
            <Logo size={110} tone="white" />
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <h2 className="m-0 text-[11px] font-semibold uppercase">Takes</h2>
          <span className="mono mu text-[11px]">{trackCount === 1 ? '1 take' : `${trackCount} takes`}</span>
        </div>
        <TakesPanel generations={takes} />
      </section>
    </div>
  );
}
