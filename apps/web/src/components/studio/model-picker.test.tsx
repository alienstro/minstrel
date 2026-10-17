import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ModelGroup, ModelPicker, RECENT_KEY } from './model-picker';

const groups: ModelGroup[] = [
  {
    connectionId: 'kie-1',
    connectionLabel: 'kie.ai',
    models: [
      { id: 'V6', label: 'V6', note: 'Best quality' },
      { id: 'V6_MINI', label: 'V6 Mini', note: 'Fast' },
    ],
  },
  {
    connectionId: 'kie-2',
    connectionLabel: 'Second kie.ai',
    models: [{ id: 'V5', label: 'V5', note: 'Older model' }],
  },
];

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: /model/i }));
  return screen.getByRole('combobox', { name: 'Search models' });
};

const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent);

describe('ModelPicker', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the model and its connection in the field', () => {
    render(<ModelPicker groups={groups} value={{ connectionId: 'kie-1', modelId: 'V6' }} onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /model/i })).toHaveTextContent('V6 · kie.ai');
  });

  it('typing filters by model name, connection label, or note', async () => {
    render(<ModelPicker groups={groups} value={null} onPick={vi.fn()} />);
    const search = await open();
    expect(search).toHaveFocus();
    await userEvent.type(search, 'mini');
    expect(optionNames()).toEqual([expect.stringContaining('V6 Mini')]);
    await userEvent.clear(search);
    await userEvent.type(search, 'second');
    expect(optionNames()).toEqual([expect.stringContaining('V5')]);
    await userEvent.clear(search);
    await userEvent.type(search, 'best quality');
    expect(optionNames()).toEqual([expect.stringContaining('V6')]);
  });

  it('ArrowDown then Enter picks the highlighted model', async () => {
    const onPick = vi.fn();
    render(<ModelPicker groups={groups} value={null} onPick={onPick} />);
    const search = await open();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith({ connectionId: 'kie-1', modelId: 'V6_MINI' });
    expect(search).not.toBeInTheDocument();
  });

  it('Escape closes the panel and focuses the field', async () => {
    render(<ModelPicker groups={groups} value={null} onPick={vi.fn()} />);
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: /model/i })).toHaveFocus();
  });

  it('Recent shows the last 3 picks', async () => {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([
        { connectionId: 'kie-2', modelId: 'V5' },
        { connectionId: 'kie-1', modelId: 'V6_MINI' },
        { connectionId: 'kie-1', modelId: 'V6' },
        { connectionId: 'gone', modelId: 'old' },
      ]),
    );
    render(<ModelPicker groups={groups} value={null} onPick={vi.fn()} />);
    await open();
    const recent = screen.getByRole('group', { name: 'Recent' });
    expect(within(recent).getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('V5'),
      expect.stringContaining('V6 Mini'),
      expect.stringContaining('V6'),
    ]);
  });

  it('a pick goes to the front of Recent', async () => {
    render(<ModelPicker groups={groups} value={null} onPick={vi.fn()} />);
    await open();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)[0]).toEqual({ connectionId: 'kie-1', modelId: 'V6' });
  });

  it('no match shows "No models match"', async () => {
    render(<ModelPicker groups={groups} value={null} onPick={vi.fn()} />);
    await userEvent.type(await open(), 'zzz');
    expect(screen.getByText('No models match')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('aria-activedescendant names the highlighted option', async () => {
    render(<ModelPicker groups={groups} value={null} onPick={vi.fn()} />);
    const search = await open();
    await userEvent.keyboard('{ArrowDown}');
    const active = document.getElementById(search.getAttribute('aria-activedescendant')!);
    expect(active).toHaveAttribute('role', 'option');
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active).toHaveTextContent('V6');
  });

  it('the footer shows the count and an Add a key link', async () => {
    render(<ModelPicker groups={groups} value={null} onPick={vi.fn()} />);
    await open();
    expect(screen.getByText('3 models')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a key' })).toHaveAttribute('href', '/settings/connections');
  });
});
