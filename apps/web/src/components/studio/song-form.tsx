'use client';

import type {
  AssistBody,
  AssistResult,
  ConnectionDto,
  CreateGenerationBody,
  GenerationDto,
  GenerationInput,
  ModelOption,
  MusicCapabilities,
  ProviderInfo,
} from '@minstrel/shared';
import { useMutation } from '@tanstack/react-query';
import { type CSSProperties, type FormEvent, useRef, useState } from 'react';
import { FieldError } from '@/components/ui/text-field';
import { ApiClientError, apiFetch } from '@/lib/api';
import { HELPER_RECENT_KEY, type ModelGroup, ModelPicker, type ModelValue } from './model-picker';

interface Props {
  connections: ConnectionDto[];
  providers: ProviderInfo[];
  models: Record<string, ModelOption[]>;
  onCreated: (generation: GenerationDto) => void;
}

type Task = AssistBody['task'];
type Errors = Record<string, string>;
type Mode = 'describe' | 'lyrics';

// The same two modes as Suno. Describe: the provider writes the lyrics and the music from the idea.
// Lyrics: the provider uses the lyrics, style, and title of the user.
const MODES: { id: Mode; label: string }[] = [
  { id: 'describe', label: 'Describe' },
  { id: 'lyrics', label: 'Lyrics' },
];

// The error keys that the form shows next to a field.
const SHOWN_FIELDS = new Set(['idea', 'model', 'helperModel', 'lyrics', 'style', 'title']);

const DEFAULT_LENGTH = 150;
const LENGTH_STEP = 5;

// Spec §10.2. The form shows only the fields in the adapter capabilities. Hidden fields keep their
// values, so nothing typed is lost when the user picks a model of another provider.
export function SongForm({ connections, providers, models, onCreated }: Props) {
  const music = connections.filter((c) => c.kind === 'music');
  const textConnection = connections.find((c) => c.kind === 'text');
  const groups: ModelGroup[] = music.map((c) => ({
    connectionId: c.id,
    connectionLabel: c.label,
    models: models[c.id] ?? [],
  }));

  // The helpers (Write lyrics, Suggest) use a text model, so they have their own picker.
  const helperGroups: ModelGroup[] = textConnection
    ? [{ connectionId: textConnection.id, connectionLabel: textConnection.label, models: models[textConnection.id] ?? [] }]
    : [];

  const [model, setModel] = useState<ModelValue | null>(() => firstModel(groups));
  const [helperModel, setHelperModel] = useState<ModelValue | null>(() =>
    textConnection?.defaultModel ? { connectionId: textConnection.id, modelId: textConnection.defaultModel } : null,
  );
  const [mode, setMode] = useState<Mode>('describe');
  // Write lyrics opens a box for the idea. The box shares the idea with Describe.
  const [briefOpen, setBriefOpen] = useState(false);
  const [idea, setIdea] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [style, setStyle] = useState('');
  const [title, setTitle] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [autoLength, setAutoLength] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const submitting = useRef(false);

  const connection = music.find((c) => c.id === model?.connectionId);
  const caps = providers.find((p) => p.adapter === connection?.adapter)?.capabilities ?? null;
  const range = caps?.lengthSeconds ?? null;
  const providerName = providers.find((p) => p.adapter === connection?.adapter)?.displayName ?? 'This provider';
  const showLyrics = caps?.lyrics ?? true;
  const showStyle = caps?.style ?? true;
  const lyricsMode = showLyrics && mode === 'lyrics';
  const isInstrumental = Boolean(caps?.instrumental ?? true) && instrumental;
  // The same rule as sunoMode on the API: custom mode needs lyrics, or an instrumental with a style.
  const customMode = lyricsMode && (isInstrumental ? Boolean(style.trim()) : Boolean(lyrics.trim()));
  const lengthFits = !caps?.lengthNeedsCustomMode || customMode;
  // Describe never keeps a length on such a provider, so the form does not show the slider there.
  const showLength = range !== null && (lyricsMode || !caps?.lengthNeedsCustomMode);
  const lengthAutoOn = Boolean(caps?.lengthAuto) && autoLength;
  const lengthOn = showLength && !lengthAutoOn && lengthFits;

  const create = useMutation({
    mutationFn: (body: CreateGenerationBody) =>
      apiFetch<GenerationDto>('/api/generations', { method: 'POST', body: JSON.stringify(body) }),
  });
  const assist = useMutation({
    mutationFn: (body: AssistBody) =>
      apiFetch<AssistResult>('/api/assist', { method: 'POST', body: JSON.stringify(body) }),
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The ref stops a second request before React shows the disabled button.
    if (submitting.current || create.isPending) return;
    if (!model || !caps) return setErrors({ model: 'Choose a model.' });
    if (!lyricsMode && !idea.trim()) return setErrors({ idea: 'Describe the song first.' });
    if (lyricsMode && isInstrumental && !style.trim()) return setErrors({ style: 'Add a style for the instrumental.' });
    if (lyricsMode && !isInstrumental && !lyrics.trim()) return setErrors({ lyrics: 'Add the lyrics, or use Write lyrics.' });
    setErrors({});
    submitting.current = true;
    try {
      const generation = await create.mutateAsync({
        connectionId: model.connectionId,
        input: buildInput(caps, {
          lyricsMode,
          idea,
          lyrics,
          style,
          title,
          instrumental,
          length: lengthOn ? length : null,
          model: model.modelId,
        }),
      });
      onCreated(generation);
    } catch (error) {
      setErrors(toErrors(error));
    } finally {
      submitting.current = false;
    }
  }

  async function help(task: Task, fill: (text: string) => void) {
    // Without a text key, Write lyrics uses the music connection of the chosen model (kie.ai).
    const target = textConnection ?? (task === 'lyrics' ? connection : undefined);
    if (!target) return;
    // The idea goes only when its box is open. Suggest can work from the lyrics alone.
    const brief = briefOpen ? idea.trim() : '';
    if (task === 'lyrics' && !brief) return setErrors({ idea: 'Describe the song first.' });
    if (task !== 'lyrics' && !brief && !lyrics.trim()) return setErrors({ lyrics: 'Add the lyrics first.' });
    if (textConnection && !helperModel) return setErrors({ helperModel: 'Choose a helper model.' });
    setErrors({});
    try {
      const result = await assist.mutateAsync({
        connectionId: target.id,
        ...(textConnection && helperModel ? { model: helperModel.modelId } : {}),
        task,
        ...(brief ? { idea: brief } : {}),
        fields: { lyrics, style, title },
      });
      fill(result.text);
    } catch (error) {
      setErrors(toErrors(error));
    }
  }

  const helperDisabled = !textConnection || assist.isPending;
  const writeLyricsDisabled = (!textConnection && !connection) || assist.isPending;

  return (
    <form noValidate onSubmit={onSubmit} aria-label="New song" className="flex flex-col gap-6">
      {showLyrics ? (
        <div className="flex flex-col gap-2">
          <div role="group" aria-label="How to make the song" className="flex flex-wrap gap-1.5">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`pill min-h-9 px-4 text-[12px] uppercase ${item.id === mode ? 'dark' : 'gl'}`}
                aria-pressed={item.id === mode}
                onClick={() => {
                  setMode(item.id);
                  setErrors({});
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="hint pl-5">
            {lyricsMode
              ? `${providerName} uses your lyrics, style, and title.`
              : `${providerName} writes the ${isInstrumental ? 'music' : 'lyrics and the music'} from your idea.`}
          </p>
        </div>
      ) : null}

      {lyricsMode ? (
        <Field
          id="song-lyrics"
          label="Lyrics"
          error={errors.lyrics}
          action={
            <button
              type="button"
              className="txt"
              aria-expanded={briefOpen}
              aria-controls="song-brief-box"
              disabled={writeLyricsDisabled || isInstrumental}
              onClick={() => setBriefOpen((open) => !open)}
            >
              Write lyrics
            </button>
          }
        >
          {briefOpen ? (
            <div id="song-brief-box" className="flex flex-col gap-2">
              <label htmlFor="song-brief" className="hint pl-5">
                What are the lyrics about?
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="song-brief"
                  className="in min-w-0 flex-[1_1_240px]"
                  placeholder="A sea shanty about a lost cat"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  {...describedBy('song-brief', errors.idea)}
                />
                <button type="button" className="pill dark" disabled={writeLyricsDisabled} onClick={() => help('lyrics', setLyrics)}>
                  {assist.isPending ? 'Writing…' : 'Write'}
                </button>
              </div>
              {errors.idea ? (
                <div className="pl-5">
                  <FieldError id="song-brief-error">{errors.idea}</FieldError>
                </div>
              ) : null}
            </div>
          ) : null}
          <textarea
            id="song-lyrics"
            className="in rounded-[24px] px-5 py-4 leading-[1.7]"
            rows={7}
            value={lyrics}
            disabled={isInstrumental}
            placeholder={isInstrumental ? 'An instrumental has no lyrics.' : undefined}
            onChange={(e) => setLyrics(e.target.value)}
            {...describedBy('song-lyrics', errors.lyrics)}
          />
        </Field>
      ) : (
        <Field id="song-idea" label="What is the song about?" error={errors.idea}>
          <textarea
            id="song-idea"
            className="idea"
            rows={2}
            placeholder="A sea shanty about a lost cat"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            {...describedBy('song-idea', errors.idea)}
          />
        </Field>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[440px] flex-[1_1_280px]">
          <ModelPicker
            groups={groups}
            value={model}
            onPick={setModel}
            errorId={errors.model ? 'song-model-error' : undefined}
          />
          {errors.model ? (
            <div className="mt-2 pl-5">
              <FieldError id="song-model-error">{errors.model}</FieldError>
            </div>
          ) : null}
        </div>
        {caps?.instrumental ?? true ? (
          <label className="sw">
            <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} />
            Instrumental
          </label>
        ) : null}
      </div>

      {textConnection && lyricsMode ? (
        <div className="min-w-0 max-w-[440px]">
          <ModelPicker
            groups={helperGroups}
            value={helperModel}
            onPick={setHelperModel}
            label="Helper model"
            recentKey={HELPER_RECENT_KEY}
            errorId={errors.helperModel ? 'song-helper-model-error' : undefined}
          />
          <div className="mt-2 pl-5">
            {errors.helperModel ? (
              <FieldError id="song-helper-model-error">{errors.helperModel}</FieldError>
            ) : (
              <p className="hint">Write lyrics and Suggest use this text model.</p>
            )}
          </div>
        </div>
      ) : null}

      {showLength && range ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 pr-5">
            <label htmlFor="song-length" className="lbl">
              Length
            </label>
            <div className="flex items-center gap-4">
              {caps?.lengthAuto ? (
                <label className="sw">
                  <input
                    type="checkbox"
                    aria-label="Auto length"
                    checked={autoLength}
                    onChange={(e) => setAutoLength(e.target.checked)}
                  />
                  Auto
                </label>
              ) : null}
              <span className={`mono text-[11px] tabular-nums ${lengthOn ? '' : 'mu'}`} aria-hidden="true">
                {formatSeconds(clamp(length, range))}
              </span>
            </div>
          </div>
          <div className="flex px-5">
            <input
              id="song-length"
              className="seek"
              type="range"
              min={range.min}
              max={range.max}
              step={LENGTH_STEP}
              value={clamp(length, range)}
              disabled={!lengthOn}
              aria-valuetext={formatSeconds(clamp(length, range))}
              onChange={(e) => setLength(Number(e.target.value))}
              style={{ '--p': `${((clamp(length, range) - range.min) / Math.max(range.max - range.min, 1)) * 100}%` } as CSSProperties}
            />
          </div>
          <p className="hint">
            {lengthAutoOn
              ? // With no length, the provider does not limit the song to range.max (issue #7).
                `${providerName} picks the length. A song can be longer than ${formatSeconds(range.max)}. Turn off Auto to choose it.`
              : !lengthFits
                ? `${providerName} keeps the length only when the song has lyrics, or is an instrumental with a style.`
                : `From ${formatSeconds(range.min)} to ${formatSeconds(range.max)}.`}
          </p>
        </div>
      ) : null}

      {lyricsMode ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {showStyle ? (
            <Field
              id="song-style"
              label="Style"
              error={errors.style}
              action={
                <button type="button" aria-label="Suggest a style" className="txt" disabled={helperDisabled} onClick={() => help('style', setStyle)}>
                  Suggest
                </button>
              }
            >
              <input
                id="song-style"
                className="in"
                placeholder="shanty, accordion"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                {...describedBy('song-style', errors.style)}
              />
            </Field>
          ) : null}
          <Field
            id="song-title"
            label="Title"
            error={errors.title}
            action={
              <button type="button" aria-label="Suggest a title" className="txt" disabled={helperDisabled} onClick={() => help('title', setTitle)}>
                Suggest
              </button>
            }
          >
            <input
              id="song-title"
              className="in"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              {...describedBy('song-title', errors.title)}
            />
          </Field>
        </div>
      ) : null}

      {lyricsMode && !textConnection ? (
        <p className="hint">
          {connection
            ? `Write lyrics uses ${providerName}. Add a text key in Settings to use Suggest.`
            : 'Add a text provider key in Settings to use Write lyrics and Suggest.'}
        </p>
      ) : null}

      {errors.form ? (
        <div role="alert" className="pl-5">
          <FieldError id="song-form-error">{errors.form}</FieldError>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <button type="submit" className="pill dark ml-auto min-w-[220px]" disabled={create.isPending}>
          {create.isPending ? 'Sending…' : 'Make song'} <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  action,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-3 pr-5">
        <label htmlFor={id} className="lbl">
          {label}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <div className="pl-5">
          <FieldError id={`${id}-error`}>{error}</FieldError>
        </div>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {};

function firstModel(groups: ModelGroup[]): ModelValue | null {
  const group = groups.find((g) => g.models.length > 0);
  return group ? { connectionId: group.connectionId, modelId: group.models[0]!.id } : null;
}

const clamp = (value: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, value));

const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Only the fields of the chosen mode that the provider uses go out. Describe sends only the idea,
// because the provider writes the rest. Lyrics sends no idea, because the provider does not use it.
function buildInput(
  caps: MusicCapabilities,
  /** `length` is null when Auto is on, or when the provider would not keep the length. */
  form: {
    lyricsMode: boolean;
    idea: string;
    lyrics: string;
    style: string;
    title: string;
    instrumental: boolean;
    length: number | null;
    model: string;
  },
): GenerationInput {
  const input: GenerationInput = { instrumental: caps.instrumental && form.instrumental, model: form.model };
  if (!form.lyricsMode) input.idea = form.idea.trim();
  if (form.lyricsMode && caps.lyrics && !input.instrumental && form.lyrics.trim()) input.lyrics = form.lyrics;
  if (form.lyricsMode && caps.style && form.style.trim()) input.style = form.style.trim();
  if (form.lyricsMode && form.title.trim()) input.title = form.title.trim();
  if (caps.lengthSeconds && form.length !== null) input.lengthSeconds = clamp(form.length, caps.lengthSeconds);
  return input;
}

function toErrors(error: unknown): Errors {
  if (error instanceof ApiClientError) {
    if (!error.fields) return { form: error.message };
    // The API names input fields with or without the "input." prefix.
    const errors: Errors = Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k.replace(/^input\./, ''), v]));
    // The form has no place for some fields, for example connectionId. Then it shows the message at the end.
    return Object.keys(errors).some((k) => SHOWN_FIELDS.has(k)) ? errors : { ...errors, form: error.message };
  }
  return { form: 'Minstrel could not send the request. Try again.' };
}
