import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm, ResetPasswordForm } from './reset-form';

const auth = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: auth }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const SENT = 'If an account uses this email, we sent a link to reset the password.';

describe('password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forgot password shows the same message for a known and an unknown email', async () => {
    auth.requestPasswordReset
      .mockResolvedValueOnce({ data: { status: true }, error: null })
      .mockResolvedValueOnce({ data: null, error: { status: 400, message: 'User not found' } });

    const first = render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send link/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
    expect(auth.requestPasswordReset).toHaveBeenCalledWith({ email: 'ada@example.com', redirectTo: '/reset-password' });
    first.unmount();

    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send link/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
  });

  it('reset sends the token and the new password', async () => {
    auth.resetPassword.mockResolvedValue({ data: { status: true }, error: null });
    render(<ResetPasswordForm token="tok-123" />);
    await userEvent.type(screen.getByLabelText('New password'), 'a new long password');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    expect(auth.resetPassword).toHaveBeenCalledWith({ token: 'tok-123', newPassword: 'a new long password' });
    expect(await screen.findByRole('status')).toHaveTextContent('Your password is changed');
  });

  it('a missing token shows an error and a link to forgot password', () => {
    render(<ResetPasswordForm token={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('This link is not complete');
    expect(screen.getByRole('link', { name: /get a new link/i })).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByLabelText('New password')).toBeNull();
  });
});
