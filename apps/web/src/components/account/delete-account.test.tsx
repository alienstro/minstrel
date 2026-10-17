import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteAccount } from './delete-account';

const auth = vi.hoisted(() => ({ deleteUser: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: { deleteUser: auth.deleteUser } }));

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

function renderDelete() {
  const client = new QueryClient();
  client.setQueryData(['tracks'], { pages: [], pageParams: [] });
  render(
    <QueryClientProvider client={client}>
      <DeleteAccount />
    </QueryClientProvider>,
  );
  return client;
}

describe('DeleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.deleteUser.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('delete account asks for a confirmation first', async () => {
    renderDelete();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(auth.deleteUser).not.toHaveBeenCalled();
    expect(screen.getByText(/deletes your songs, your keys, and your account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, delete my account' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Yes, delete my account' })).not.toBeInTheDocument();
  });

  it('after the confirmation it calls deleteUser and goes to /', async () => {
    const client = renderDelete();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete my account' }));

    expect(auth.deleteUser).toHaveBeenCalledWith({ password: 'correct horse battery' });
    expect(replace).toHaveBeenCalledWith('/');
    // No data of the deleted account stays in this tab.
    expect(client.getQueryData(['tracks'])).toBeUndefined();
  });

  it('an error from the API shows next to the form and stays on the page', async () => {
    auth.deleteUser.mockResolvedValue({ data: null, error: { status: 400, message: 'Invalid password' } });
    renderDelete();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete my account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid password');
    expect(replace).not.toHaveBeenCalled();
  });
});
