import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignOutButton } from './sign-out-button';

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: auth }));

const leave = vi.fn();

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs out and goes to the home page', async () => {
    auth.signOut.mockResolvedValue({ data: { success: true }, error: null });
    render(<SignOutButton leave={leave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(auth.signOut).toHaveBeenCalled();
    expect(leave).toHaveBeenCalledWith('/');
  });

  it('shows an error and stays when the sign-out fails', async () => {
    auth.signOut.mockResolvedValue({ data: null, error: { status: 500, message: 'Server error' } });
    render(<SignOutButton leave={leave} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Minstrel could not sign you out. Try again.');
    expect(leave).not.toHaveBeenCalled();
  });
});
