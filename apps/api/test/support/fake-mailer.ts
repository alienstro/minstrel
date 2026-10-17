import type { MailMessage, Mailer } from '../../src/auth/mailer.js';

export class FakeMailer implements Mailer {
  readonly verifications: MailMessage[] = [];
  readonly passwordResets: MailMessage[] = [];

  async sendVerification(message: MailMessage): Promise<void> {
    this.verifications.push(message);
  }

  async sendPasswordReset(message: MailMessage): Promise<void> {
    this.passwordResets.push(message);
  }
}
