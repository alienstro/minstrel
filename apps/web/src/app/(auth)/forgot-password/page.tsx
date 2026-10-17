import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/reset-form';

export const metadata: Metadata = { title: 'Reset password · Minstrel' };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
