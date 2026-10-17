import type { GenerationDto, GenerationStatus, TrackDto } from '@minstrel/shared';
import { act, screen, within } from '@testing-library/react';
import { fakeApi, renderWithQuery } from '@/test/render';
import { TakesPanel } from './takes-panel';

const generation = (status: GenerationStatus, extra: Partial<GenerationDto> = {}): GenerationDto => ({
  id: 'g-1',
  connectionId: 'c-kie',
  adapter: 'kie',
  flow: 'job',
  status,
  input: { idea: 'a sea shanty about a lost cat', instrumental: false, model: 'V6' },
  error: null,
  tracks: [],
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
  ...extra,
});

const track = (id: string, durationSeconds: number): TrackDto => ({
  id,
  generationId: 'g-1',
  title: 'The Cat Who Sailed',
  style: 'shanty, accordion',
  lyrics: null,
  durationSeconds,
  storageStatus: 'pending',
  createdAt: '2026-10-17T10:02:00.000Z',
});

// Each poll gives the next reply. The last reply repeats.
function replies(...list: GenerationDto[]) {
  return () => (list.length > 1 ? list.shift() : list[0]);
}

const nextPoll = () => act(() => vi.advanceTimersByTimeAsync(3000));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TakesPanel', () => {
  it('polling stops at complete', async () => {
    const { calls } = fakeApi({
      'GET /api/generations/g-1': replies(generation('first_ready'), generation('complete')),
    });
    renderWithQuery(<TakesPanel generations={[generation('pending')]} />);

    await nextPoll();
    await nextPoll();
    expect(calls).toHaveLength(2);
    await nextPoll();
    await nextPoll();
    await nextPoll();

    expect(calls).toHaveLength(2);
  });

  it('finished stages show a check mark and the current one a spinner', async () => {
    fakeApi({ 'GET /api/generations/g-1': generation('text_ready') });
    renderWithQuery(<TakesPanel generations={[generation('text_ready')]} />);

    const stages = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem');
    expect(stages.map((li) => li.dataset.state)).toEqual(['done', 'current', 'todo']);
    expect(stages[0]).toHaveTextContent(/Writing words.*done/);
    expect(stages[1]).toHaveTextContent(/First take ready.*in progress/);
    expect(stages[2]).toHaveTextContent('All takes ready');
    expect(within(stages[0]!).getByTestId('stage-check')).toBeInTheDocument();
    expect(within(stages[1]!).getByTestId('stage-spinner')).toBeInTheDocument();
  });

  it('a failed generation shows the API message', async () => {
    fakeApi({});
    const message = 'kie.ai could not make this song: the model is busy.';
    renderWithQuery(
      <TakesPanel generations={[generation('failed', { error: { code: 'generation_failed', message } })]} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('list', { name: 'Progress' })).not.toBeInTheDocument();
  });

  it('a new take appears in the list', async () => {
    fakeApi({
      'GET /api/generations/g-1': generation('complete', { tracks: [track('t-1', 161), track('t-2', 182)] }),
    });
    renderWithQuery(<TakesPanel generations={[generation('pending')]} />);
    expect(screen.queryByText('The Cat Who Sailed')).not.toBeInTheDocument();

    await nextPoll();

    const takes = within(await screen.findByRole('list', { name: 'Takes of this song' })).getAllByRole('listitem');
    expect(takes).toHaveLength(2);
    expect(takes[0]).toHaveTextContent(/The Cat Who Sailed.*2:41/);
    expect(takes[1]).toHaveTextContent(/The Cat Who Sailed.*3:02/);
  });
});
