import type { ConnectionDto, GenerationDto, ProviderInfo } from '@minstrel/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeApi, renderWithQuery } from '@/test/render';
import { SongForm } from './song-form';

const caps = { lyrics: true, style: true, providerTitle: true, instrumental: true, lengthSeconds: null, tracksPerRequest: 2 };
const providers: ProviderInfo[] = [
  { adapter: 'kie', kind: 'music', displayName: 'kie.ai', defaultBaseUrl: '', keyUrl: '', capabilities: caps },
  {
    adapter: 'elevenlabs',
    kind: 'music',
    displayName: 'ElevenLabs Music',
    defaultBaseUrl: '',
    keyUrl: '',
    capabilities: { ...caps, providerTitle: false, lengthSeconds: { min: 5, max: 180 }, tracksPerRequest: 1 },
  },
];

const connection = (id: string, adapter: ConnectionDto['adapter'], label: string): ConnectionDto => ({
  id,
  kind: adapter === 'openai_compatible' ? 'text' : 'music',
  adapter,
  label,
  baseUrl: '',
  keyLast4: '1234',
  defaultModel: null,
  status: 'ok',
  lastCheckedAt: null,
  createdAt: '2026-10-17T10:00:00.000Z',
});

const connections = [
  connection('c-kie', 'kie', 'kie.ai'),
  connection('c-el', 'elevenlabs', 'ElevenLabs'),
  connection('c-text', 'openai_compatible', 'OpenRouter'),
];
const models = {
  'c-kie': [{ id: 'V6', label: 'V6' }],
  'c-el': [{ id: 'music_v2_5', label: 'Music v2.5' }],
};

const generation = { id: 'g1', status: 'pending', tracks: [] } as unknown as GenerationDto;

const pickModel = async (text: string) => {
  await userEvent.click(screen.getByRole('button', { name: /^model/i }));
  await userEvent.type(screen.getByRole('combobox', { name: 'Search models' }), text);
  await userEvent.keyboard('{ArrowDown}{Enter}');
};

const renderForm = (onCreated = vi.fn()) =>
  renderWithQuery(<SongForm connections={connections} providers={providers} models={models} onCreated={onCreated} />);

describe('SongForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the model error describes the model picker', async () => {
    fakeApi({});
    const noModels = Object.fromEntries(Object.keys(models).map((id) => [id, []]));
    renderWithQuery(<SongForm connections={connections} providers={providers} models={noModels} onCreated={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /make song/i }));
    expect(screen.getByText('Choose a model.')).toBeInTheDocument();
    const picker = screen.getByRole('button', { name: /^model/i });
    expect(picker).toHaveAccessibleDescription('Choose a model.');
  });

  it('an ElevenLabs model shows the Length slider with min 5, max 180, step 5, value 150', async () => {
    renderForm();
    await pickModel('music');
    const slider = screen.getByRole('slider', { name: /length/i });
    expect(slider).toHaveAttribute('min', '5');
    expect(slider).toHaveAttribute('max', '180');
    expect(slider).toHaveAttribute('step', '5');
    expect(slider).toHaveValue('150');
  });

  it('a kie model hides the slider', async () => {
    renderForm();
    await pickModel('V6');
    expect(screen.queryByRole('slider', { name: /length/i })).toBeNull();
  });

  it('lyrics typed before a model change stay', async () => {
    renderForm();
    await pickModel('V6');
    await userEvent.type(screen.getByLabelText('Lyrics'), 'Drip drop');
    await pickModel('music');
    await pickModel('V6');
    expect(screen.getByLabelText('Lyrics')).toHaveValue('Drip drop');
  });

  it('Make song is disabled while the request runs, so a double click sends one request', async () => {
    let release!: () => void;
    const api = fakeApi({});
    api.spy.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Response(JSON.stringify(generation), { status: 202, headers: { 'content-type': 'application/json' } }));
        }),
    );
    const onCreated = vi.fn();
    renderForm(onCreated);
    await pickModel('V6');
    await userEvent.type(screen.getByLabelText('Idea'), 'a sea shanty about a lost cat');
    const button = screen.getByRole('button', { name: /make song/i });
    await userEvent.dblClick(button);
    expect(button).toBeDisabled();
    release();
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(generation));
    expect(api.spy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(api.spy.mock.calls[0]![1]!.body));
    expect(body).toEqual({
      connectionId: 'c-kie',
      input: { idea: 'a sea shanty about a lost cat', instrumental: false, model: 'V6' },
    });
  });

  it('Write lyrics fills the lyrics from the assist result', async () => {
    const api = fakeApi({ 'POST /api/assist': { text: '[Verse]\nThe cat set sail' } });
    renderForm();
    await pickModel('V6');
    await userEvent.type(screen.getByLabelText('Idea'), 'a sea shanty about a lost cat');
    await userEvent.click(screen.getByRole('button', { name: 'Write lyrics' }));
    await vi.waitFor(() => expect(screen.getByLabelText('Lyrics')).toHaveValue('[Verse]\nThe cat set sail'));
    expect(api.calls[0]!.body).toMatchObject({ connectionId: 'c-text', task: 'lyrics', idea: 'a sea shanty about a lost cat' });
  });
});
