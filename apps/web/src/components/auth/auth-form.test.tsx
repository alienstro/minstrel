import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from './auth-form';

const auth = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signUp: { email: auth.signUpEmail },
    signIn: { email: auth.signInEmail, social: auth.signInSocial },
  },
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('AuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sign-up shows the check-your-email message after success', async () => {
    auth.signUpEmail.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    render(<AuthForm mode="sign-up" />);
    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(auth.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email');
    expect(screen.getByRole('status')).toHaveTextContent('ada@example.com');
  });

  it('a field error sits next to its field with aria-describedby', async () => {
    render(<AuthForm mode="sign-up" />);
    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    const errorId = password.getAttribute('aria-describedby')!;
    expect(document.getElementById(errorId)).toHaveTextContent('at least 8 characters');
    expect(auth.signUpEmail).not.toHaveBeenCalled();
  });

  it('a sign-in error from the server shows its message', async () => {
    auth.signInEmail.mockResolvedValue({ data: null, error: { status: 401, message: 'Invalid email or password' } });
    render(<AuthForm mode="sign-in" />);
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(push).not.toHaveBeenCalled();
  });

  it('the Google button starts the Google sign-in', async () => {
    auth.signInSocial.mockResolvedValue({ data: null, error: null });
    render(<AuthForm mode="sign-in" />);
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(auth.signInSocial).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/studio' });
  });
});
