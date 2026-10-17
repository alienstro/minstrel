import type { ConnectionDto, GenerationDto, ProviderInfo } from '@minstrel/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeApi, renderWithQuery } from '@/test/render';
import { SongForm } from './song-form';

const caps = { lyrics: true, style: true, providerTitle: true, instrumental: true, lengthSeconds: null, tracksPerRequest: 2 };
const kieCaps = { ...caps, lengthSeconds: { min: 10, max: 360 }, lengthAuto: true, lengthNeedsCustomMode: true };
const providers: ProviderInfo[] = [
  { adapter: 'kie', kind: 'music', displayName: 'kie.ai', defaultBaseUrl: '', keyUrl: '', capabilities: kieCaps },
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
  { ...connection('c-text', 'openai_compatible', 'OpenRouter'), defaultModel: 'openai/gpt-5-mini' },
];
const models = {
  'c-kie': [{ id: 'V6', label: 'V6' }, { id: 'V5', label: 'V5' }],
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

const useLyrics = () => userEvent.click(screen.getByRole('button', { name: 'Lyrics' }));

// Write lyrics opens a box for the idea. Write sends it.
const writeLyrics = async (idea: string) => {
  await userEvent.click(screen.getByRole('button', { name: 'Write lyrics' }));
  await userEvent.type(screen.getByLabelText('What are the lyrics about?'), idea);
  await userEvent.click(screen.getByRole('button', { name: 'Write' }));
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

  it('the form starts in Describe mode with only the idea, the model, and Instrumental', async () => {
    renderForm();
    await pickModel('V6');
    expect(screen.getByRole('button', { name: 'Describe' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('What is the song about?')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Instrumental' })).toBeInTheDocument();
    // kie.ai ignores lyrics, style, title, and length in this mode, so the form does not show them.
    expect(screen.queryByLabelText('Lyrics')).toBeNull();
    expect(screen.queryByLabelText('Style')).toBeNull();
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.queryByRole('slider', { name: /length/i })).toBeNull();
  });

  it('Describe mode asks for the idea', async () => {
    renderForm();
    await pickModel('V6');
    await userEvent.click(screen.getByRole('button', { name: /make song/i }));
    expect(screen.getByLabelText('What is the song about?')).toHaveAccessibleDescription('Describe the song first.');
  });

  it('Lyrics mode hides the idea and makes a song from the lyrics alone', async () => {
    const api = fakeApi({ 'POST /api/generations': generation });
    renderForm();
    await pickModel('V6');
    await userEvent.type(screen.getByLabelText('What is the song about?'), 'rain');
    await userEvent.clear(screen.getByLabelText('What is the song about?'));
    await useLyrics();
    expect(screen.queryByLabelText('What is the song about?')).toBeNull();
    await userEvent.type(screen.getByLabelText('Lyrics'), 'Lay down the sword');
    await userEvent.click(screen.getByRole('button', { name: /make song/i }));
    await vi.waitFor(() => expect(api.calls).toHaveLength(1));
    expect(api.calls[0]!.body).toEqual({
      connectionId: 'c-kie',
      input: { lyrics: 'Lay down the sword', instrumental: false, model: 'V6' },
    });
  });

  it('Lyrics mode puts the lyrics first, above the model, as Describe puts the idea first', async () => {
    renderForm();
    await useLyrics();
    const lyricsBox = screen.getByLabelText('Lyrics');
    const picker = screen.getByRole('button', { name: /^model/i });
    expect(lyricsBox.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the Write lyrics box opens below the button that opens it', async () => {
    renderForm();
    await useLyrics();
    const button = screen.getByRole('button', { name: 'Write lyrics' });
    await userEvent.click(button);
    const brief = screen.getByLabelText('What are the lyrics about?');
    expect(button.compareDocumentPosition(brief) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Lyrics mode with no lyrics asks for the lyrics', async () => {
    const api = fakeApi({});
    renderForm();
    await pickModel('V6');
    await useLyrics();
    await userEvent.click(screen.getByRole('button', { name: /make song/i }));
    expect(screen.getByLabelText('Lyrics')).toHaveAccessibleDescription('Add the lyrics, or use Write lyrics.');
    expect(api.calls).toHaveLength(0);
  });

  it('a Lyrics-mode instrumental with no style asks for a style', async () => {
    const api = fakeApi({});
    renderForm();
    await pickModel('V6');
    await useLyrics();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Instrumental' }));
    await userEvent.click(screen.getByRole('button', { name: /make song/i }));
    expect(screen.getByLabelText('Style')).toHaveAccessibleDescription('Add a style for the instrumental.');
    expect(api.calls).toHaveLength(0);
  });

  it('Suggest in Lyrics mode works from the lyrics and sends no idea', async () => {
    const api = fakeApi({ 'POST /api/assist': { text: 'Lay Down' } });
    renderForm();
    await useLyrics();
    await userEvent.type(screen.getByLabelText('Lyrics'), 'Lay down the sword');
    await userEvent.click(screen.getByRole('button', { name: 'Suggest a title' }));
    await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Lay Down'));
    expect(api.calls[0]!.body).not.toHaveProperty('idea');
    expect(api.calls[0]!.body).toMatchObject({ task: 'title', fields: { lyrics: 'Lay down the sword' } });
  });

  it('a kie model shows the Length slider with min 10, max 360, step 5, value 150', async () => {
    renderForm();
    await pickModel('V6');
    await useLyrics();
    const slider = screen.getByRole('slider', { name: /length/i });
    expect(slider).toHaveAttribute('min', '10');
    expect(slider).toHaveAttribute('max', '360');
    expect(slider).toHaveAttribute('step', '5');
    expect(slider).toHaveValue('150');
  });

  it('a kie model shows Length with Auto on, so the slider is off and the model picks the length', async () => {
    renderForm();
    await pickModel('V6');
    await useLyrics();
    expect(screen.getByRole('checkbox', { name: 'Auto length' })).toBeChecked();
    expect(screen.getByRole('slider', { name: /length/i })).toBeDisabled();
  });

  it('with Auto on, the hint says that a song can be longer than the slider maximum', async () => {
    renderForm();
    await pickModel('V6');
    await useLyrics();
    expect(screen.getByText('kie.ai picks the length. A song can be longer than 6:00. Turn off Auto to choose it.')).toBeInTheDocument();
  });

  it('with Auto off and lyrics, a kie request sends the chosen length', async () => {
    const api = fakeApi({ 'POST /api/generations': generation });
    renderForm();
    await pickModel('V6');
    await useLyrics();
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
    await useLyrics();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Auto length' }));
    expect(screen.getByRole('slider', { name: /length/i })).toBeDisabled();
    expect(screen.getByText(/kie\.ai keeps the length only when the song has lyrics/)).toBeInTheDocument();
  });

  it('lyrics typed before a model change stay', async () => {
    renderForm();
    await pickModel('V6');
    await useLyrics();
    await userEvent.type(screen.getByLabelText('Lyrics'), 'Drip drop');
    await pickModel('V5');
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
    await userEvent.keyboard('{Escape}');
    await useLyrics();
    await userEvent.click(screen.getByRole('button', { name: /^helper model/i }));
    const text = within(screen.getByRole('listbox', { name: 'Models' }));
    expect(text.getByRole('option', { name: /GPT-5 Mini/ })).toBeInTheDocument();
    expect(text.queryByRole('option', { name: /V6/ })).toBeNull();
  });

  it('Write lyrics sends the model picked in the Helper model picker', async () => {
    const api = fakeApi({ 'POST /api/assist': { text: '[Verse]\nThe cat set sail' } });
    renderForm();
    await useLyrics();
    await userEvent.click(screen.getByRole('button', { name: /^helper model/i }));
    // The connection's default is GPT-5 Mini, so this pick must replace it.
    await userEvent.click(screen.getByRole('option', { name: /Llama 4/ }));
    await writeLyrics('a sea shanty about a lost cat');
    await vi.waitFor(() => expect(api.calls).toHaveLength(1));
    expect(api.calls[0]!.body).toMatchObject({ connectionId: 'c-text', model: 'meta-llama/llama-4', task: 'lyrics' });
  });

  it('Write lyrics fills the lyrics from the assist result', async () => {
    const api = fakeApi({ 'POST /api/assist': { text: '[Verse]\nThe cat set sail' } });
    renderForm();
    await pickModel('V6');
    await useLyrics();
    await writeLyrics('a sea shanty about a lost cat');
    await vi.waitFor(() => expect(screen.getByLabelText('Lyrics')).toHaveValue('[Verse]\nThe cat set sail'));
    expect(api.calls[0]!.body).toMatchObject({
      connectionId: 'c-text',
      model: 'openai/gpt-5-mini',
      task: 'lyrics',
      idea: 'a sea shanty about a lost cat',
    });
  });

  describe('without a text key', () => {
    const musicOnly = connections.filter((c) => c.kind === 'music');
    const renderMusicOnly = () =>
      renderWithQuery(<SongForm connections={musicOnly} providers={providers} models={models} onCreated={vi.fn()} />);

    it('without a text key, Write lyrics uses the kie connection', async () => {
      const api = fakeApi({ 'POST /api/assist': { text: '[Verse]\nkie.ai lyrics' } });
      renderMusicOnly();
      await pickModel('V6');
      await useLyrics();
      await writeLyrics('a sea shanty about a lost cat');
      await vi.waitFor(() => expect(screen.getByLabelText('Lyrics')).toHaveValue('[Verse]\nkie.ai lyrics'));
      expect(api.calls[0]!.body).toEqual({
        connectionId: 'c-kie',
        task: 'lyrics',
        idea: 'a sea shanty about a lost cat',
        fields: { lyrics: '', style: '', title: '' },
      });
      expect(screen.queryByRole('button', { name: /^helper model/i })).toBeNull();
    });

    it('an error on a field that the form does not show appears as the form error', async () => {
      const message = 'Write lyrics needs a text provider key, for example OpenRouter.';
      const body = { code: 'invalid_input', message, fields: { connectionId: message } };
      fakeApi({
        'POST /api/assist': () => {
          throw new Response(JSON.stringify(body), { status: 400, headers: { 'content-type': 'application/json' } });
        },
      });
      renderMusicOnly();
      await pickModel('V6');
      await useLyrics();
      await writeLyrics('rain');
      expect(await screen.findByText(message)).toBeInTheDocument();
    });

    it('without a text key, Suggest is disabled', async () => {
      renderMusicOnly();
      await pickModel('V6');
      await useLyrics();
      expect(screen.getByRole('button', { name: 'Suggest a style' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Suggest a title' })).toBeDisabled();
      expect(screen.getByText('Write lyrics uses kie.ai. Add a text key in Settings to use Suggest.')).toBeInTheDocument();
    });
  });
});
