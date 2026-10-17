import type { Metadata } from 'next';
import { StudioView } from '@/components/studio/studio-view';

export const metadata: Metadata = { title: 'Studio · Minstrel' };

export default function StudioPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="type-page-title">Studio</h1>
      <StudioView />
    </div>
  );
}
