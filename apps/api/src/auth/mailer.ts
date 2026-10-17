import { createTransport } from 'nodemailer';

export const MAILER = Symbol('MAILER');

export interface MailMessage {
  to: string;
  url: string;
}

export interface Mailer {
  sendVerification(message: MailMessage): Promise<void>;
  sendPasswordReset(message: MailMessage): Promise<void>;
}

/** The part of a nodemailer transport that the mailer uses, so a test can give a fake one. */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

export class SmtpMailer implements Mailer {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  async sendVerification({ to, url }: MailMessage): Promise<void> {
    await this.send(
      to,
      'Confirm your email for Minstrel',
      `Open this link to confirm your email: ${url}`,
    );
  }

  async sendPasswordReset({ to, url }: MailMessage): Promise<void> {
    await this.send(
      to,
      'Reset your Minstrel password',
      `Open this link to set a new password: ${url}`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    await this.transport.sendMail({ from: this.from, to, subject, text });
  }
}

const REQUIRED = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'] as const;

/**
 * Any SMTP server works, for example Gmail with an app password. A missing setting stops the
 * start, so a deploy never runs with sign-up email that cannot go out.
 */
export function smtpMailerFromEnv(
  env: Partial<Record<string, string>> = process.env,
): SmtpMailer {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Set ${missing.join(', ')} to send email.`);
  }
  const port = Number(env.SMTP_PORT ?? 465);
  const transport = createTransport({
    host: env.SMTP_HOST,
    port,
    // Port 465 uses TLS from the start. Other ports upgrade with STARTTLS.
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return new SmtpMailer(transport, env.EMAIL_FROM!);
}
