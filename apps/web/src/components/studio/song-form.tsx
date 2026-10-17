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
import { type ModelGroup, ModelPicker, type ModelValue } from './model-picker';

interface Props {
  connections: ConnectionDto[];
  providers: ProviderInfo[];
  models: Record<string, ModelOption[]>;
  onCreated: (generation: GenerationDto) => void;
}

type Task = AssistBody['task'];
type Errors = Record<string, string>;

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

  const [model, setModel] = useState<ModelValue | null>(() => firstModel(groups));
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
  // The same rule as sunoMode on the API: custom mode needs lyrics, or an instrumental with a style.
  const customMode = caps?.instrumental && instrumental ? Boolean(style.trim()) : Boolean(lyrics.trim());
  const lengthFits = !caps?.lengthNeedsCustomMode || customMode;
  const lengthAutoOn = Boolean(caps?.lengthAuto) && autoLength;
  const lengthOn = range !== null && !lengthAutoOn && lengthFits;

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
    if (!idea.trim()) return setErrors({ idea: 'Describe the song first.' });
    setErrors({});
    submitting.current = true;
    try {
      const generation = await create.mutateAsync({
        connectionId: model.connectionId,
        input: buildInput(caps, { idea, lyrics, style, title, instrumental, length: lengthOn ? length : null, model: model.modelId }),
      });
      onCreated(generation);
    } catch (error) {
      setErrors(toErrors(error));
    } finally {
      submitting.current = false;
    }
  }

  async function help(task: Task, fill: (text: string) => void) {
    if (!textConnection) return;
    if (!idea.trim()) return setErrors({ idea: 'Describe the song first.' });
    setErrors({});
    try {
      const result = await assist.mutateAsync({
        connectionId: textConnection.id,
        task,
        idea,
        fields: { lyrics, style, title },
      });
      fill(result.text);
    } catch (error) {
      setErrors(toErrors(error));
    }
  }

  const helperDisabled = !textConnection || assist.isPending;
  const showLyrics = caps?.lyrics ?? true;
  const showStyle = caps?.style ?? true;

  return (
    <form noValidate onSubmit={onSubmit} aria-label="New song" className="flex flex-col gap-6">
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

      {range ? (
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
              ? 'The model picks the length. Turn off Auto to choose it.'
              : !lengthFits
                ? `${providerName} keeps the length only when the song has lyrics, or is an instrumental with a style.`
                : `From ${formatSeconds(range.min)} to ${formatSeconds(range.max)}.`}
          </p>
        </div>
      ) : null}

      {showLyrics ? (
        <Field
          id="song-lyrics"
          label="Lyrics"
          error={errors.lyrics}
          action={
            <button type="button" className="txt" disabled={helperDisabled || instrumental} onClick={() => help('lyrics', setLyrics)}>
              Write lyrics
            </button>
          }
        >
          <textarea
            id="song-lyrics"
            className="in rounded-[24px] px-5 py-4 leading-[1.7]"
            rows={7}
            value={lyrics}
            disabled={instrumental}
            onChange={(e) => setLyrics(e.target.value)}
            {...describedBy('song-lyrics', errors.lyrics)}
          />
        </Field>
      ) : null}

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

      {!textConnection ? <p className="hint">Add a text provider key in Settings to use Write lyrics and Suggest.</p> : null}

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

// Only the fields that the provider uses go out. A title always goes, because Minstrel keeps it.
function buildInput(
  caps: MusicCapabilities,
  /** `length` is null when Auto is on, or when the provider would not keep the length. */
  form: { idea: string; lyrics: string; style: string; title: string; instrumental: boolean; length: number | null; model: string },
): GenerationInput {
  const input: GenerationInput = { idea: form.idea.trim(), instrumental: caps.instrumental && form.instrumental, model: form.model };
  if (caps.lyrics && !input.instrumental && form.lyrics.trim()) input.lyrics = form.lyrics;
  if (caps.style && form.style.trim()) input.style = form.style.trim();
  if (form.title.trim()) input.title = form.title.trim();
  if (caps.lengthSeconds && form.length !== null) input.lengthSeconds = clamp(form.length, caps.lengthSeconds);
  return input;
}

function toErrors(error: unknown): Errors {
  if (error instanceof ApiClientError) {
    if (!error.fields) return { form: error.message };
    // The API names input fields with or without the "input." prefix.
    return Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k.replace(/^input\./, ''), v]));
  }
  return { form: 'Minstrel could not send the request. Try again.' };
}
