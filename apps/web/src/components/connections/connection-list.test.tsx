import type { ConnectionDto, ProviderInfo } from '@minstrel/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeApi, renderWithQuery } from '@/test/render';
import { ConnectionsSettings } from './connection-list';

const capabilities = {
  lyrics: true,
  style: true,
  providerTitle: true,
  instrumental: true,
  lengthSeconds: null,
  tracksPerRequest: 2,
};

const providers: ProviderInfo[] = [
  { adapter: 'kie', kind: 'music', displayName: 'kie.ai', defaultBaseUrl: 'https://api.kie.ai', keyUrl: 'https://kie.ai/api-key', capabilities },
  { adapter: 'suno_classic', kind: 'music', displayName: 'Suno-compatible', defaultBaseUrl: 'https://apibox.erweima.ai', keyUrl: 'https://sunoapi.org/api-key', capabilities },
  { adapter: 'elevenlabs', kind: 'music', displayName: 'ElevenLabs Music', defaultBaseUrl: 'https://api.elevenlabs.io', keyUrl: 'https://elevenlabs.io/app/settings/api-keys', capabilities: { ...capabilities, lengthSeconds: { min: 5, max: 180 }, tracksPerRequest: 1 } },
  { adapter: 'openai_compatible', kind: 'text', displayName: 'OpenAI-compatible', defaultBaseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys', capabilities: null },
];

const kie: ConnectionDto = {
  id: 'c1',
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

describe('ConnectionsSettings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('with no music connection it shows "Add a music provider key to make songs."', async () => {
    fakeApi({ 'GET /api/connections': [], 'GET /api/providers': providers });
    renderWithQuery(<ConnectionsSettings />);
    expect(await screen.findByText('Add a music provider key to make songs.')).toBeInTheDocument();
  });

  it('the empty state lists kie.ai, Suno-compatible, and ElevenLabs Music with key links', async () => {
    fakeApi({ 'GET /api/connections': [], 'GET /api/providers': providers });
    renderWithQuery(<ConnectionsSettings />);
    const list = await screen.findByRole('list', { name: 'Music providers' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Get a kie.ai key',
      'Get a Suno-compatible key',
      'Get a ElevenLabs Music key',
    ]);
    expect(links[0]).toHaveAttribute('href', 'https://kie.ai/api-key');
  });

  it('a connection shows its label and key_last4 only', async () => {
    fakeApi({ 'GET /api/connections': [kie], 'GET /api/providers': providers });
    renderWithQuery(<ConnectionsSettings />);
    const row = await screen.findByRole('listitem', { name: 'kie.ai' });
    expect(row).toHaveTextContent('•••• 4321');
    expect(screen.queryByText('Add a music provider key to make songs.')).toBeNull();
  });

  it('Remove deletes the key only after "Yes, remove"', async () => {
    const api = fakeApi({
      'GET /api/connections': [kie],
      'GET /api/providers': providers,
      'DELETE /api/connections/c1': undefined,
    });
    renderWithQuery(<ConnectionsSettings />);
    const row = await screen.findByRole('listitem', { name: 'kie.ai' });
    await userEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    expect(row).toHaveTextContent('Remove this key? Songs in progress with this key will fail.');
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }));
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(row).getByRole('button', { name: 'Yes, remove' }));
    expect(api.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('a failed remove shows an alert', async () => {
    fakeApi({
      'GET /api/connections': [kie],
      'GET /api/providers': providers,
      'DELETE /api/connections/c1': () => {
        throw new Response(JSON.stringify({ code: 'internal_error', message: 'Something went wrong.' }), {
          status: 500,
        });
      },
    });
    renderWithQuery(<ConnectionsSettings />);
    const row = await screen.findByRole('listitem', { name: 'kie.ai' });
    await userEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(row).getByRole('button', { name: 'Yes, remove' }));
    expect(await within(row).findByRole('alert')).toHaveTextContent('Minstrel could not remove this key. Try again.');
  });

  it('Add key shows the toast "Key added"', async () => {
    let connections: ConnectionDto[] = [];
    const api = fakeApi({
      'GET /api/connections': () => connections,
      'GET /api/providers': providers,
      'POST /api/connections': () => {
        connections = [kie];
        return kie;
      },
    });
    renderWithQuery(<ConnectionsSettings />);
    await screen.findByText('Add a music provider key to make songs.');
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'kie');
    await userEvent.type(screen.getByLabelText('API key'), 'sk-kie-very-secret-4321');
    await userEvent.click(screen.getByRole('button', { name: /add key/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('Key added');
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      kind: 'music',
      adapter: 'kie',
      label: 'kie.ai',
      apiKey: 'sk-kie-very-secret-4321',
    });
    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(await screen.findByRole('listitem', { name: 'kie.ai' })).toBeInTheDocument();
  });
});
