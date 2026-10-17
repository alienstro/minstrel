import type { Metadata } from 'next';
import { ConnectionsSettings } from '@/components/connections/connection-list';

export const metadata: Metadata = { title: 'Connections · Minstrel' };

export default function ConnectionsPage() {
  return (
    <div className="flex flex-col">
      <h1 className="mt-4 mb-12 text-center text-[13px] font-semibold uppercase">
        <span>Your services</span>{' '}
        <span className="serif mt-1 block text-[56px] leading-none tracking-[-0.02em] normal-case sm:text-[72px]">Connections</span>
      </h1>
      <ConnectionsSettings />
    </div>
  );
}
