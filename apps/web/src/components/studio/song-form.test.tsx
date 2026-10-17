import type { ConnectionDto, GenerationDto, ProviderInfo } from '@minstrel/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeApi, renderWithQuery } from '@/test/render';
import { SongForm } from './song-form';

const caps = { lyrics: true, style: true, providerTitle: true, instrumental: true, lengthSeconds: null, tracksPerRequest: 2 };
const kieCaps = { ...caps, lengthSeconds: { min: 10, max: 360 }, lengthAuto: true, lengthNeedsCustomMode: true };
const providers: ProviderInfo[] = [
  { adapter: 'kie', kind: 'music', displayName: 'kie.ai', defaultBaseUrl: '', keyUrl: '', capabilities: kieCaps },
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
  { ...connection('c-text', 'openai_compatible', 'OpenRouter'), defaultModel: 'openai/gpt-5-mini' },
];
const models = {
  'c-kie': [{ id: 'V6', label: 'V6' }],
  'c-el': [{ id: 'music_v2_5', label: 'Music v2.5' }],
  'c-text': [
    { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
    { id: 'meta-llama/llama-4', label: 'Llama 4' },
  ],
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

  it('a kie model shows Length with Auto on, so the slider is off and the model picks the length', async () => {
    renderForm();
    await pickModel('V6');
    expect(screen.getByRole('checkbox', { name: 'Auto length' })).toBeChecked();
    expect(screen.getByRole('slider', { name: /length/i })).toBeDisabled();
  });

  it('with Auto off and lyrics, a kie request sends the chosen length', async () => {
    const api = fakeApi({ 'POST /api/generations': generation });
    renderForm();
    await pickModel('V6');
    await userEvent.type(screen.getByLabelText('What is the song about?'), 'a fallen soldier');
    await userEvent.type(screen.getByLabelText('Lyrics'), 'Lay down the sword');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Auto length' }));
    expect(screen.getByRole('slider', { name: /length/i })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /make song/i }));
    await vi.waitFor(() => expect(api.calls).toHaveLength(1));
    expect(api.calls[0]!.body).toMatchObject({ input: { lyrics: 'Lay down the sword', lengthSeconds: 150 } });
  });

  it('a kie song with vocals and no lyrics keeps the slider off and says why', async () => {
    renderForm();
    await pickModel('V6');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Auto length' }));
    expect(screen.getByRole('slider', { name: /length/i })).toBeDisabled();
    expect(screen.getByText(/kie\.ai keeps the length only when the song has lyrics/)).toBeInTheDocument();
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
    await userEvent.type(screen.getByLabelText('What is the song about?'), 'a sea shanty about a lost cat');
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

  it('the Model picker lists only music models, and the Helper model picker lists only text models', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /^model/i }));
    const music = within(screen.getByRole('listbox', { name: 'Models' }));
    // V6 can also show in the Recent group, so there can be more than one match.
    expect(music.getAllByRole('option', { name: /V6/ }).length).toBeGreaterThan(0);
    expect(music.queryByRole('option', { name: /GPT-5 Mini/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^helper model/i }));
    const text = within(screen.getByRole('listbox', { name: 'Models' }));
    expect(text.getByRole('option', { name: /GPT-5 Mini/ })).toBeInTheDocument();
    expect(text.queryByRole('option', { name: /V6/ })).toBeNull();
  });

  it('Write lyrics sends the model picked in the Helper model picker', async () => {
    const api = fakeApi({ 'POST /api/assist': { text: '[Verse]\nThe cat set sail' } });
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /^helper model/i }));
    // The connection's default is GPT-5 Mini, so this pick must replace it.
    await userEvent.click(screen.getByRole('option', { name: /Llama 4/ }));
    await userEvent.type(screen.getByLabelText('What is the song about?'), 'a sea shanty about a lost cat');
    await userEvent.click(screen.getByRole('button', { name: 'Write lyrics' }));
    await vi.waitFor(() => expect(api.calls).toHaveLength(1));
    expect(api.calls[0]!.body).toMatchObject({ connectionId: 'c-text', model: 'meta-llama/llama-4', task: 'lyrics' });
  });

  it('Write lyrics fills the lyrics from the assist result', async () => {
    const api = fakeApi({ 'POST /api/assist': { text: '[Verse]\nThe cat set sail' } });
    renderForm();
    await pickModel('V6');
    await userEvent.type(screen.getByLabelText('What is the song about?'), 'a sea shanty about a lost cat');
    await userEvent.click(screen.getByRole('button', { name: 'Write lyrics' }));
    await vi.waitFor(() => expect(screen.getByLabelText('Lyrics')).toHaveValue('[Verse]\nThe cat set sail'));
    expect(api.calls[0]!.body).toMatchObject({
      connectionId: 'c-text',
      model: 'openai/gpt-5-mini',
      task: 'lyrics',
      idea: 'a sea shanty about a lost cat',
    });
  });
});
