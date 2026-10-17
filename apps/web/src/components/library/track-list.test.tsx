import type { Page, TrackDto } from '@minstrel/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerBar } from '@/components/player/player-bar';
import { PlayerProvider } from '@/components/player/player-context';
import { fakeApi, renderWithQuery } from '@/test/render';
import { TrackList } from './track-list';

const track = (id: string, title: string, style: string | null, durationSeconds: number, day: number): TrackDto => ({
  id,
  generationId: 'g-1',
  title,
  style,
  lyrics: null,
  durationSeconds,
  storageStatus: 'stored',
  createdAt: `2026-10-${day}T10:00:00.000Z`,
});

const page: Page<TrackDto> = {
  items: [
    track('t-2', 'The Cat Who Sailed', 'shanty, accordion', 161, 16),
    track('t-1', 'Lantern Over Dunmoor', 'folk, harp, female', 195, 15),
  ],
  nextCursor: null,
};

function renderList() {
  renderWithQuery(
    <PlayerProvider>
      <TrackList />
      <PlayerBar />
    </PlayerProvider>,
  );
}

const rows = async () => within(await screen.findByRole('list', { name: 'Songs' })).getAllByRole('listitem');

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TrackList', () => {
  it('rows are newest first with title, date, style, and duration', async () => {
    fakeApi({ 'GET /api/tracks': page });
    renderList();

    const [first, second] = await rows();
    expect(first).toHaveTextContent(/The Cat Who Sailed.*16 Oct.*shanty, accordion.*2:41/);
    expect(second).toHaveTextContent(/Lantern Over Dunmoor.*15 Oct.*folk, harp, female.*3:15/);
    expect(within(first!).getByRole('link', { name: 'Download The Cat Who Sailed' })).toHaveAttribute(
      'href',
      '/api/tracks/t-2/download',
    );
  });

  it('rename sends PATCH and shows the new title', async () => {
    const { calls } = fakeApi({
      'GET /api/tracks': page,
      'PATCH /api/tracks/t-2': { ...page.items[0], title: 'Night Sailing' },
    });
    renderList();
    const [first] = await rows();

    await userEvent.click(within(first!).getByRole('button', { name: 'Rename The Cat Who Sailed' }));
    const input = within(first!).getByRole('textbox', { name: 'Title' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Night Sailing{Enter}');

    expect(await within(first!).findByText('Night Sailing')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      path: '/api/tracks/t-2',
      body: { title: 'Night Sailing' },
    });
  });

  it('delete sends DELETE and removes the row', async () => {
    const { calls } = fakeApi({ 'GET /api/tracks': page, 'DELETE /api/tracks/t-2': () => undefined });
    renderList();
    const [first] = await rows();

    await userEvent.click(within(first!).getByRole('button', { name: 'Delete The Cat Who Sailed' }));
    await userEvent.click(within(first!).getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Song deleted'));
    expect(await rows()).toHaveLength(1);
    expect(screen.queryByText('The Cat Who Sailed')).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/tracks/t-2')).toBe(true);
  });

  it('play starts the player', async () => {
    fakeApi({ 'GET /api/tracks': page });
    renderList();
    const [first] = await rows();

    await userEvent.click(within(first!).getByRole('button', { name: 'Play The Cat Who Sailed' }));

    expect(document.querySelector('audio')!.getAttribute('src')).toBe('/api/tracks/t-2/stream');
    expect(screen.getByRole('region', { name: 'Player' })).toHaveTextContent('The Cat Who Sailed');
  });

  it('a next page loads with the cursor', async () => {
    fakeApi({
      'GET /api/tracks': { items: [page.items[0]], nextCursor: 't-2' },
      'GET /api/tracks?cursor=t-2': { items: [page.items[1]], nextCursor: null },
    });
    renderList();
    expect(await rows()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Show more songs' }));

    expect(await screen.findByText('Lantern Over Dunmoor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more songs' })).not.toBeInTheDocument();
  });

  it('no songs shows the empty state', async () => {
    fakeApi({ 'GET /api/tracks': { items: [], nextCursor: null } });
    renderList();

    expect(await screen.findByText(/Your songs appear here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Make a song' })).toHaveAttribute('href', '/studio');
  });

  it('Find shows only the songs whose title or style has the word', async () => {
    fakeApi({ 'GET /api/tracks': page });
    renderList();
    await rows();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a song' }), 'HARP');
    expect(await rows()).toHaveLength(1);
    expect(screen.queryByText('The Cat Who Sailed')).toBeNull();

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Find a song' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a song' }), 'polka');
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });
});
