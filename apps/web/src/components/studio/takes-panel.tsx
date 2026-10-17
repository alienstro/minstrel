'use client';

import { fallbackTitle, type GenerationDto, type GenerationStatus, type TrackDto } from '@minstrel/shared';
import { Logo } from '@/components/brand/logo';
import { usePlayer } from '@/components/player/player-context';
import { useGeneration } from '@/hooks/use-generation';
import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/format';

type StageState = 'done' | 'current' | 'todo';

// Spec §10.2 principle 3: the stages are a real sequence. Each status names how many stages are done.
const STAGES = ['Writing words', 'First take ready', 'All takes ready'];

const DONE_COUNT: Record<GenerationStatus, number> = {
  submitting: 0,
  pending: 0,
  text_ready: 1,
  first_ready: 2,
  queued: 0,
  running: 1,
  complete: 3,
  failed: 0,
};

export function TakesPanel({ generations }: { generations: GenerationDto[] }) {
  if (generations.length === 0) return <p className="mono mu m-0 text-[11px]">Your takes appear here.</p>;
  return (
    <div className="flex flex-col gap-6">
      {generations.map((g) => (
        <TakeGroup key={g.id} initial={g} />
      ))}
    </div>
  );
}

function TakeGroup({ initial }: { initial: GenerationDto }) {
  const { data } = useGeneration(initial.id, initial);
  const generation = data ?? initial;

  return (
    <article className="flex flex-col gap-3" aria-label={fallbackTitle(generation.input)}>
      {generation.tracks.length > 0 ? <TakeList tracks={generation.tracks} /> : null}
      {generation.status === 'failed' ? (
        <p role="alert" className="mono m-0 text-[11px] font-semibold">
          {generation.error?.message ?? 'This song failed. Try again.'}
        </p>
      ) : (
        <Stages generation={generation} />
      )}
    </article>
  );
}

function TakeList({ tracks }: { tracks: TrackDto[] }) {
  const player = usePlayer();
  return (
    <ul aria-label="Takes of this song" className="m-0 list-none p-0">
      {tracks.map((t, i) => {
        const isPlaying = player.current?.id === t.id && player.playing;
        return (
          <li key={t.id} className="rel take-enter" data-on={isPlaying}>
            <div className="relative z-[1] flex items-center gap-3.5 px-3.5 py-3">
              <span className="art flex size-12 items-center justify-center bg-ink" aria-hidden="true">
                <Logo size={24} tone="white" />
              </span>
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className="truncate font-semibold uppercase">{t.title}</span>
                <span className="mu text-[11px] font-medium uppercase tabular-nums">
                  Take {i + 1}
                  {t.durationSeconds ? ` · ${formatDuration(t.durationSeconds)}` : null}
                </span>
              </div>
              <button
                type="button"
                className="pill gl mono min-h-[34px] min-w-16 px-3.5 text-[11px] font-normal"
                aria-label={`${isPlaying ? 'Pause' : 'Play'} take ${i + 1}`}
                onClick={() => (isPlaying ? player.pause() : player.play(t))}
              >
                {isPlaying ? (
                  <span className="bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : null}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// The seconds since the song started. It counts each second while the song runs.
function useElapsed(createdAt: string, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return Math.max(0, (now - new Date(createdAt).getTime()) / 1000);
}

function Stages({ generation }: { generation: GenerationDto }) {
  const done = DONE_COUNT[generation.status];
  const running = generation.status !== 'complete';
  const elapsed = useElapsed(generation.createdAt, running);
  const stateOf = (i: number): StageState => (i < done ? 'done' : i === done ? 'current' : 'todo');

  return (
    <div className="mt-2 flex flex-col gap-3">
      <p className="m-0 text-[13px] font-semibold tabular-nums">
        {running ? `Making your song · ${formatDuration(elapsed)}` : 'Song ready'}
      </p>
      <div
        role="progressbar"
        aria-label="Song progress"
        aria-valuemin={0}
        aria-valuemax={STAGES.length}
        aria-valuenow={done}
        className="song-bar"
        data-running={running}
      >
        <span style={{ width: `${(done / STAGES.length) * 100}%` }} />
      </div>
      <ol aria-label="Progress" aria-live="polite" className="m-0 flex list-none flex-col gap-2.5 p-0">
        {STAGES.map((name, i) => {
          const state = stateOf(i);
          return (
            <li key={name} data-state={state} className={`stage flex items-center gap-2.5 text-[13px] ${state === 'todo' ? 'mu' : ''}`}>
              {state === 'done' ? (
                <span data-testid="stage-check" aria-hidden="true" className="stage-mark stage-done">
                  <svg viewBox="0 0 12 12" width="10" height="10">
                    <path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : null}
              {state === 'current' ? <span data-testid="stage-spinner" aria-hidden="true" className="stage-mark stage-current" /> : null}
              {state === 'todo' ? <span aria-hidden="true" className="stage-mark stage-todo" /> : null}
              <span>{name}</span>
              {state !== 'todo' ? <span className="sr-only">{state === 'done' ? '(done)' : '(in progress)'}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
