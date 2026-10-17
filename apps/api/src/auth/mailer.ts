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

export class ResendMailer implements Mailer {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.resend = new Resend(apiKey);
  }

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
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      text,
    });
    if (error) throw new Error(`Resend did not send the email: ${error.name}`);
  }
}
