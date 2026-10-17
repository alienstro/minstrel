'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { retryDelay, shouldRetry } from '@/lib/retry';

export function Providers({ children }: { children: ReactNode }) {
  // One client for each browser tab. useState keeps it across renders.
  // A query keeps its loading state while the database wakes up. A mutation does not retry, so it never runs twice.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, retry: shouldRetry, retryDelay },
          mutations: { retry: 0 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
