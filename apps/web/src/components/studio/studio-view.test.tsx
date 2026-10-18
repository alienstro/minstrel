import type { ConnectionDto, GenerationDto, GenerationStatus, ProviderInfo, TrackDto } from '@minstrel/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { PlayerProvider } from '@/components/player/player-context';
import { fakeApi, renderWithQuery } from '@/test/render';
import { StudioView } from './studio-view';

const kie: ProviderInfo = {
  adapter: 'kie',
  kind: 'music',
  displayName: 'kie.ai',
  defaultBaseUrl: 'https://api.kie.ai',
  keyUrl: 'https://kie.ai/api-key',
  capabilities: { lyrics: true, style: true, providerTitle: true, instrumental: true, lengthSeconds: null, tracksPerRequest: 2 },
};

const connection: ConnectionDto = {
  id: 'c-kie',
  kind: 'music',
  adapter: 'kie',
  label: 'kie.ai',
  baseUrl: 'https://api.kie.ai',
  keyLast4: '4321',
  defaultModel: null,
  status: 'ok',
  lastCheckedAt: null,
  createdAt: '2026-10-17T10:00:00.000Z',
};

const generation = (id: string, status: GenerationStatus, idea: string): GenerationDto => ({
  id,
  connectionId: 'c-kie',
  adapter: 'kie',
  status,
  input: { idea, instrumental: false, model: 'V6' },
  error: null,
  tracks: [],
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
});

const track = (id: string, generationId: string): TrackDto => ({
  id,
  generationId,
  title: 'Fallen Soldier',
  style: null,
  lyrics: null,
  durationSeconds: 180,
  storageStatus: 'stored',
  createdAt: '2026-10-17T10:01:00.000Z',
});

/** `polled` holds what a later read of a generation returns, when it differs from the list. */
function renderStudio(recent: GenerationDto[], polled: GenerationDto[] = []) {
  const api = fakeApi({
    'GET /api/connections': [connection],
    'GET /api/providers': [kie],
    'GET /api/connections/c-kie/models': [],
    'GET /api/generations': { items: recent, nextCursor: null },
    ...Object.fromEntries([...recent, ...polled].map((g) => [`GET /api/generations/${g.id}`, g])),
  });
  renderWithQuery(
    <PlayerProvider>
      <StudioView />
    </PlayerProvider>,
  );
  return api;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StudioView', () => {
  it('after a reload the Takes panel shows a song in progress', async () => {
    renderStudio([generation('g-1', 'pending', 'a sea shanty about a lost cat')]);
    const takes = await screen.findByRole('region', { name: 'Takes' });
    expect(await within(takes).findByRole('article', { name: 'a sea shanty about a lost cat' })).toBeInTheDocument();
  });

  it('the takes count includes the takes that arrive while the page polls', async () => {
    const pending = generation('g-1', 'pending', 'a fallen soldier');
    const done = { ...pending, status: 'complete' as const, tracks: [track('t-1', 'g-1'), track('t-2', 'g-1')] };
    renderStudio([pending], [done]);
    const takes = await screen.findByRole('region', { name: 'Takes' });
    expect(within(takes).getByText('0 takes')).toBeInTheDocument();
    // The first poll comes after POLL_MS (3 s).
    expect(await within(takes).findByText('2 takes', {}, { timeout: 6000 })).toBeInTheDocument();
  }, 10_000);

  it('the Takes panel shows the 3 newest songs and each older song in progress', async () => {
    renderStudio([
      generation('g-1', 'complete', 'song one'),
      generation('g-2', 'pending', 'song two'),
      generation('g-3', 'failed', 'song three'),
      generation('g-4', 'complete', 'song four'),
      generation('g-5', 'complete', 'song five'),
      generation('g-6', 'running', 'song six'),
    ]);
    const takes = await screen.findByRole('region', { name: 'Takes' });
    await within(takes).findByRole('article', { name: 'song one' });
    expect(within(takes).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'song one',
      'song two',
      'song three',
      'song six',
    ]);
  });

  it('an older song leaves the Takes panel when the poll shows that it is ready', async () => {
    const running = generation('g-4', 'running', 'song four');
    renderStudio(
      [
        generation('g-1', 'complete', 'song one'),
        generation('g-2', 'complete', 'song two'),
        generation('g-3', 'complete', 'song three'),
        running,
      ],
      [{ ...running, status: 'complete', tracks: [track('t-1', 'g-4')] }],
    );
    const takes = await screen.findByRole('region', { name: 'Takes' });
    expect(await within(takes).findByRole('article', { name: 'song four' })).toBeInTheDocument();
    // The first poll comes after POLL_MS (3 s).
    await waitFor(() => expect(within(takes).queryByRole('article', { name: 'song four' })).not.toBeInTheDocument(), {
      timeout: 6000,
    });
    expect(within(takes).getAllByRole('article')).toHaveLength(3);
  }, 10_000);
});
