import { SmtpMailer, smtpMailerFromEnv, type MailTransport } from './mailer.js';

const FROM = 'Minstrel <minstrel@example.com>';

function fakeTransport() {
  const sent: Parameters<MailTransport['sendMail']>[0][] = [];
  const transport: MailTransport = {
    sendMail: async (message) => {
      sent.push(message);
    },
  };
  return { transport, sent };
}

const smtpEnv = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '465',
  SMTP_USER: 'minstrel@example.com',
  SMTP_PASSWORD: 'app-password',
  EMAIL_FROM: FROM,
};

describe('SmtpMailer', () => {
  it('the verification email goes to the user with the link', async () => {
    const { transport, sent } = fakeTransport();
    await new SmtpMailer(transport, FROM).sendVerification({
      to: 'ada@example.com',
      url: 'https://minstrel.test/api/auth/verify-email?token=t',
    });
    expect(sent).toEqual([
      {
        from: FROM,
        to: 'ada@example.com',
        subject: 'Confirm your email for Minstrel',
        text: 'Open this link to confirm your email: https://minstrel.test/api/auth/verify-email?token=t',
      },
    ]);
  });

  it('the password reset email goes to the user with the link', async () => {
    const { transport, sent } = fakeTransport();
    await new SmtpMailer(transport, FROM).sendPasswordReset({
      to: 'ada@example.com',
      url: 'https://minstrel.test/reset?token=t',
    });
    expect(sent).toEqual([
      {
        from: FROM,
        to: 'ada@example.com',
        subject: 'Reset your Minstrel password',
        text: 'Open this link to set a new password: https://minstrel.test/reset?token=t',
      },
    ]);
  });

  it('a send error rejects, so the caller knows the email did not go', async () => {
    const transport: MailTransport = {
      sendMail: async () => {
        throw new Error('Invalid login: 535 5.7.8 Username and Password not accepted');
      },
    };
    await expect(
      new SmtpMailer(transport, FROM).sendVerification({ to: 'ada@example.com', url: 'https://x.test' }),
    ).rejects.toThrow('535');
  });
});

describe('smtpMailerFromEnv', () => {
  it('complete SMTP settings give a mailer', () => {
    expect(smtpMailerFromEnv(smtpEnv)).toBeInstanceOf(SmtpMailer);
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'] as const)(
    'a missing %s stops the start with its name',
    (name) => {
      expect(() => smtpMailerFromEnv({ ...smtpEnv, [name]: '' })).toThrow(name);
    },
  );
});
