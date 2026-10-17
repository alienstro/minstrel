import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from './auth-form';

const auth = vi.hoisted(() => ({ signInSocial: vi.fn() }));
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: auth.signInSocial } },
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => search.params }));

describe('AuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.params = new URLSearchParams();
  });

  it('the form has no email or password field, only the Google button', () => {
    render(<AuthForm />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Continue with Google']);
  });

  it('Continue with Google starts the Google sign-in to the studio', async () => {
    auth.signInSocial.mockResolvedValue({ data: {}, error: null });
    render(<AuthForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(auth.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/studio',
      errorCallbackURL: '/sign-in',
    });
  });

  it('a Google sign-in that does not start shows the error and enables the button again', async () => {
    auth.signInSocial.mockResolvedValue({ data: null, error: { status: 500, message: 'Server error' } });
    render(<AuthForm />);
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Minstrel could not open Google. Try again.');
    expect(button).toBeEnabled();
  });

  it('an account_not_linked error in the URL tells the user which account to use', () => {
    search.params = new URLSearchParams('error=account_not_linked');
    render(<AuthForm />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Minstrel cannot link this Google account. Use the Google account with the email of your Minstrel account.',
    );
  });

  it('another error in the URL asks the user to try again', () => {
    search.params = new URLSearchParams('error=state_mismatch');
    render(<AuthForm />);
    expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in did not finish. Try again.');
  });

  it('the note links to the Terms and the Privacy notice', () => {
    render(<AuthForm />);
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute('href', '/privacy');
  });
});
