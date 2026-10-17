'use client';

import type { Page, TrackDto } from '@minstrel/shared';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { usePlayer } from '@/components/player/player-context';
import { ApiClientError, apiFetch } from '@/lib/api';
import { formatDuration } from '@/lib/format';

const tracksKey = ['tracks'] as const;
type TrackPages = InfiniteData<Page<TrackDto>, string | null>;

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

const matches = (track: TrackDto, words: string) =>
  `${track.title} ${track.style ?? ''}`.toLowerCase().includes(words.trim().toLowerCase());

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICON_BUTTON = 'pi';

// Spec §10.2: the library is a list, like the contents page of a songbook.
export function TrackList() {
  const [status, setStatus] = useState<string>();
  const [find, setFind] = useState('');
  const query = useInfiniteQuery({
    queryKey: tracksKey,
    queryFn: ({ pageParam }) =>
      apiFetch<Page<TrackDto>>(
        pageParam ? `/api/tracks?cursor=${encodeURIComponent(pageParam)}` : '/api/tracks',
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  if (query.isPending) return <p className="mono mu text-center text-[11px]">Loading…</p>;
  if (query.isError) return <p role="alert">Minstrel could not load your songs. Reload the page.</p>;

  const tracks = query.data.pages.flatMap((p) => p.items);
  const shown = find.trim() ? tracks.filter((t) => matches(t, find)) : tracks;
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5">
      {tracks.length === 0 ? (
        <div className="card mx-auto max-w-xl flex-row flex-wrap items-center justify-between py-3 pr-3 pl-6">
          <p className="m-0 text-[14px]">Your songs appear here.</p>
          <Link href="/studio" className="pill dark">
            Make a song <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="mono mu m-0 text-[11px]">
              {tracks.length === 1 ? '1 song' : `${tracks.length} songs`} · newest first
            </p>
            <div className="relative min-w-[220px] flex-[0_1_340px]">
              <label className="vh" htmlFor="find-song">
                Find a song
              </label>
              <span className="mu pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">
                <Icon>
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.5 10.5L14 14" />
                </Icon>
              </span>
              <input
                className="in pl-10"
                id="find-song"
                type="search"
                placeholder="Find by title or style"
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
            </div>
          </div>
          {shown.length > 0 ? (
            <ul aria-label="Songs" className="m-0 list-none p-0">
              {shown.map((t) => (
                <TrackRow key={t.id} track={t} onDone={setStatus} />
              ))}
            </ul>
          ) : (
            <p className="m-0 py-10 text-center">
              <span className="serif text-[36px]">Nothing here.</span>
              <br />
              <span className="mono mu text-[11px]">No song matches that word. Try another one.</span>
            </p>
          )}
        </>
      )}
      <p role="status" aria-live="polite" className="mono m-0 min-h-5 text-center text-[11px]">
        {status}
      </p>
      {query.hasNextPage ? (
        <button
          type="button"
          className="pill gl self-center"
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
  const isPlaying = player.current?.id === track.id && player.playing;

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
    <li className="rel" data-on={isPlaying}>
      <div className="relative z-[1] flex flex-wrap items-center gap-x-5 gap-y-2 px-3.5 py-3">
        <button
          type="button"
          className="art flex size-12 items-center justify-center bg-ink text-white"
          aria-label={`${isPlaying ? 'Pause' : 'Play'} ${track.title}`}
          onClick={() => (isPlaying ? player.pause() : player.play(track))}
        >
          {isPlaying ? (
            <span className="bars [&_i]:bg-white" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <Logo size={24} tone="white" />
          )}
        </button>
        {mode === 'rename' ? (
          <form onSubmit={onRename} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input
              aria-label="Title"
              className="in min-w-0 flex-1"
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
            <button type="submit" className="pill dark min-h-10" disabled={rename.isPending}>
              Save
            </button>
            <button type="button" className="pill gl min-h-10" onClick={() => setMode('view')}>
              Cancel
            </button>
            {renameError ? (
              <p id={errorId} className="m-0 w-full pl-5 text-[12px] font-semibold">
                {renameError}
              </p>
            ) : null}
          </form>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2.5 truncate font-semibold uppercase">
                {track.title}
                {isPlaying ? <span className="pulse-dot" role="img" aria-label="Playing now" /> : null}
              </span>
              <span className="mu flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-medium uppercase">
                <span>{dateFormat.format(new Date(track.createdAt))}</span>
                {track.style ? <span className="normal-case">{track.style}</span> : null}
              </span>
            </div>
            <span className="mono mu flex-none text-[11px] tabular-nums">{formatDuration(track.durationSeconds)}</span>
          </>
        )}
        {mode === 'delete' ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px]">Delete this song?</span>
            <button type="button" className="pill dark min-h-10" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Yes, delete
            </button>
            <button type="button" className="pill gl min-h-10" onClick={() => setMode('view')}>
              Cancel
            </button>
            {remove.isError ? (
              <span role="alert" className="text-[12px] font-semibold">
                Minstrel could not delete this song. Try again.
              </span>
            ) : null}
          </span>
        ) : mode === 'view' ? (
          <span className="flex flex-none">
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={`Rename ${track.title}`}
              onClick={() => {
                setTitle(track.title);
                rename.reset();
                setMode('rename');
              }}
            >
              <Icon>
                <path d="M10.5 2.5l3 3L6 13H3v-3z" />
              </Icon>
            </button>
            <a className={ICON_BUTTON} href={`/api/tracks/${track.id}/download`} aria-label={`Download ${track.title}`}>
              <Icon>
                <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />
              </Icon>
            </a>
            <button type="button" className={ICON_BUTTON} aria-label={`Delete ${track.title}`} onClick={() => setMode('delete')}>
              <Icon>
                <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
              </Icon>
            </button>
          </span>
        ) : null}
      </div>
    </li>
  );
}
