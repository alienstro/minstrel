import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordFromQuery } from '@/components/auth/reset-form';

export const metadata: Metadata = { title: 'New password · Minstrel' };

// The token is in the query string, so the form reads it in the browser, inside Suspense.
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordFromQuery />
    </Suspense>
  );
}
