'use client';

import type { GenerationDto, GenerationStatus, TrackDto } from '@minstrel/shared';
import { usePlayer } from '@/components/player/player-context';
import { useGeneration } from '@/hooks/use-generation';
import { formatDuration } from '@/lib/format';

type StageState = 'done' | 'current' | 'todo';

// Spec §10.2 principle 3: the stages are a real sequence. Each status names how many stages are done.
const JOB_STAGES = ['Writing words', 'First take ready', 'All takes ready'];
const DIRECT_STAGES = ['Waiting for a free place', 'Making the song', 'Song ready'];

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
  if (generations.length === 0) return <p className="text-muted">Your takes appear here.</p>;
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
    <article className="flex flex-col gap-3" aria-label={generation.input.title || generation.input.idea}>
      {generation.tracks.length > 0 ? <TakeList tracks={generation.tracks} /> : null}
      {generation.status === 'failed' ? (
        <p role="alert" className="text-sm">
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
    <ul aria-label="Takes of this song" className="flex flex-col gap-1">
      {tracks.map((t, i) => {
        const isPlaying = player.current?.id === t.id && player.playing;
        return (
          <li key={t.id} className="take-enter flex items-center justify-between gap-4">
            <span className="font-extrabold">{t.title}</span>
            <span className="flex items-center gap-3">
              <span className="text-muted tabular-nums">{formatDuration(t.durationSeconds)}</span>
              <button
                type="button"
                className="btn btn-text"
                aria-label={`${isPlaying ? 'Pause' : 'Play'} take ${i + 1}`}
                onClick={() => (isPlaying ? player.pause() : player.play(t))}
              >
                <span aria-hidden="true">{isPlaying ? '❚❚' : '▶'}</span>
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Stages({ generation }: { generation: GenerationDto }) {
  const names = generation.flow === 'direct' ? DIRECT_STAGES : JOB_STAGES;
  const done = DONE_COUNT[generation.status];
  const stateOf = (i: number): StageState => (i < done ? 'done' : i === done ? 'current' : 'todo');

  return (
    <ol aria-label="Progress" aria-live="polite" className="flex flex-col gap-1 text-sm">
      {names.map((name, i) => {
        const state = stateOf(i);
        return (
          <li key={name} data-state={state} className={state === 'todo' ? 'text-muted' : undefined}>
            <span className="inline-flex items-center gap-2">
              {name}
              {state === 'done' ? (
                <span data-testid="stage-check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
              {state === 'current' ? (
                <span
                  data-testid="stage-spinner"
                  aria-hidden="true"
                  className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : null}
              {state !== 'todo' ? (
                <span className="sr-only">{state === 'done' ? '(done)' : '(in progress)'}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
