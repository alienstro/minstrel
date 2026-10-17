import type { Metadata } from 'next';
import { ConnectionsSettings } from '@/components/connections/connection-list';

export const metadata: Metadata = { title: 'Connections · Minstrel' };

export default function ConnectionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="type-page-title">Connections</h1>
      <ConnectionsSettings />
    </div>
  );
}
