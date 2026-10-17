'use client';

import type { Page, TrackDto } from '@minstrel/shared';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';
import { usePlayer } from '@/components/player/player-context';
import { ApiClientError, apiFetch } from '@/lib/api';
import { formatDuration } from '@/lib/format';

const tracksKey = ['tracks'] as const;
type TrackPages = InfiniteData<Page<TrackDto>, string | null>;

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

// Spec §10.2: the library is a list, like the contents page of a songbook.
export function TrackList() {
  const [status, setStatus] = useState<string>();
  const query = useInfiniteQuery({
    queryKey: tracksKey,
    queryFn: ({ pageParam }) =>
      apiFetch<Page<TrackDto>>(
        pageParam ? `/api/tracks?cursor=${encodeURIComponent(pageParam)}` : '/api/tracks',
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  if (query.isPending) return <p className="text-muted">Loading…</p>;
  if (query.isError) return <p role="alert">Minstrel could not load your songs. Reload the page.</p>;

  const tracks = query.data.pages.flatMap((p) => p.items);
  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="min-h-6 text-sm">
        {status}
      </p>
      {tracks.length === 0 ? (
        <div className="card text-center">
          <p>Your songs appear here.</p>
          <Link href="/studio" className="underline">
            Make a song
          </Link>
        </div>
      ) : (
        <ul aria-label="Songs" className="card flex flex-col divide-y divide-soft">
          {tracks.map((t) => (
            <TrackRow key={t.id} track={t} onDone={setStatus} />
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <button
          type="button"
          className="btn btn-soft self-start"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          Show more songs
        </button>
      ) : null}
    </div>
  );
}

function TrackRow({ track, onDone }: { track: TrackDto; onDone: (message: string) => void }) {
  const client = useQueryClient();
  const player = usePlayer();
  const errorId = useId();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [title, setTitle] = useState(track.title);

  const updateCache = (change: (items: TrackDto[]) => TrackDto[]) =>
    client.setQueryData<TrackPages>(tracksKey, (data) =>
      data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: change(p.items) })) } : data,
    );

  const rename = useMutation({
    mutationFn: (newTitle: string) =>
      apiFetch<TrackDto>(`/api/tracks/${track.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle }),
      }),
    onSuccess: (saved) => {
      updateCache((items) => items.map((t) => (t.id === saved.id ? saved : t)));
      setMode('view');
      onDone('Title saved');
    },
  });

  const remove = useMutation({
    mutationFn: () => apiFetch<void>(`/api/tracks/${track.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      updateCache((items) => items.filter((t) => t.id !== track.id));
      onDone('Song deleted');
    },
  });

  function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    rename.mutate(title);
  }

  const renameError =
    rename.error instanceof ApiClientError
      ? (rename.error.fields?.title ?? rename.error.message)
      : rename.error
        ? 'Minstrel could not save the title. Try again.'
        : undefined;

  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
      {mode === 'rename' ? (
        <form onSubmit={onRename} className="flex flex-1 flex-wrap items-center gap-2">
          <input
            aria-label="Title"
            className="field min-w-0 flex-1"
            value={title}
            maxLength={80}
            autoFocus
            aria-invalid={renameError ? true : undefined}
            aria-describedby={renameError ? errorId : undefined}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMode('view');
            }}
          />
          <button type="submit" className="btn btn-soft" disabled={rename.isPending}>
            Save
          </button>
          <button type="button" className="btn btn-text" onClick={() => setMode('view')}>
            Cancel
          </button>
          {renameError ? (
            <p id={errorId} className="w-full text-sm">
              {renameError}
            </p>
          ) : null}
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-base font-extrabold">{track.title}</span>
          <span className="text-muted hidden truncate sm:inline sm:w-56">{track.style}</span>
          <span className="text-muted tabular-nums">{formatDuration(track.durationSeconds)}</span>
          <span className="text-muted tabular-nums">{dateFormat.format(new Date(track.createdAt))}</span>
        </>
      )}
      {mode === 'delete' ? (
        <span className="flex items-center gap-2">
          <span className="text-sm">Delete this song?</span>
          <button
            type="button"
            className="btn btn-soft"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Yes, delete
          </button>
          <button type="button" className="btn btn-text" onClick={() => setMode('view')}>
            Cancel
          </button>
          {remove.isError ? (
            <span role="alert" className="text-sm">
              Minstrel could not delete this song. Try again.
            </span>
          ) : null}
        </span>
      ) : mode === 'view' ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-text"
            aria-label={`Play ${track.title}`}
            onClick={() => player.play(track)}
          >
            <span aria-hidden="true">▶</span>
          </button>
          <a
            className="btn btn-text"
            href={`/api/tracks/${track.id}/download`}
            aria-label={`Download ${track.title}`}
          >
            Download
          </a>
          <button
            type="button"
            className="btn btn-text"
            aria-label={`Rename ${track.title}`}
            onClick={() => {
              setTitle(track.title);
              rename.reset();
              setMode('rename');
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="btn btn-text"
            aria-label={`Delete ${track.title}`}
            onClick={() => setMode('delete')}
          >
            Delete
          </button>
        </span>
      ) : null}
    </li>
  );
}
