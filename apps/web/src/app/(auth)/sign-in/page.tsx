import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth/auth-form';

export const metadata: Metadata = { title: 'Sign in · Minstrel' };

// The form reads ?error= from the URL, so it needs a Suspense boundary.
export default function SignInPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
