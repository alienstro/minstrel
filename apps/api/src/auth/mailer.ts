import { createTransport } from 'nodemailer';
import { Resend } from 'resend';

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

/** The two auth emails are plain text. Each provider class only sends them. */
abstract class PlainTextMailer implements Mailer {
  async sendVerification({ to, url }: MailMessage): Promise<void> {
    await this.send(to, 'Confirm your email for Minstrel', `Open this link to confirm your email: ${url}`);
  }

  async sendPasswordReset({ to, url }: MailMessage): Promise<void> {
    await this.send(to, 'Reset your Minstrel password', `Open this link to set a new password: ${url}`);
  }

  protected abstract send(to: string, subject: string, text: string): Promise<void>;
}

export class SmtpMailer extends PlainTextMailer {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {
    super();
  }

  protected async send(to: string, subject: string, text: string): Promise<void> {
    await this.transport.sendMail({ from: this.from, to, subject, text });
  }
}

/** The part of the Resend SDK that the mailer uses, so a test can give a fake one. */
export interface ResendClient {
  emails: {
    send(message: {
      from: string;
      to: string;
      replyTo?: string;
      subject: string;
      text: string;
    }): Promise<{ error: { name: string; message: string } | null }>;
  };
}

export class ResendMailer extends PlainTextMailer {
  constructor(
    private readonly client: ResendClient,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {
    super();
  }

  protected async send(to: string, subject: string, text: string): Promise<void> {
    const message = { from: this.from, to, subject, text, ...(this.replyTo ? { replyTo: this.replyTo } : {}) };
    // The SDK returns an error object in place of a throw.
    const { error } = await this.client.emails.send(message);
    if (error) throw new Error(`Resend did not send the email: ${error.name}: ${error.message}`);
  }
}

/**
 * Production sends through Resend. Without RESEND_API_KEY the API uses SMTP, for local
 * development. EMAIL_REPLY_TO is optional.
 */
export function mailerFromEnv(env: Partial<Record<string, string>> = process.env): Mailer {
  if (!env.RESEND_API_KEY) return smtpMailerFromEnv(env);
  if (!env.EMAIL_FROM) throw new Error('Set EMAIL_FROM to send email.');
  return new ResendMailer(new Resend(env.RESEND_API_KEY), env.EMAIL_FROM, env.EMAIL_REPLY_TO);
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
