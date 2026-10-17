import type { Metadata } from 'next';
import { StudioView } from '@/components/studio/studio-view';

export const metadata: Metadata = { title: 'Studio · Minstrel' };

export default function StudioPage() {
  return (
    <div className="flex flex-col">
      <h1 className="mt-4 mb-10 text-center text-[13px] font-semibold uppercase">
        <span>New song</span>{' '}
        <span className="serif mt-1 block text-[56px] leading-none tracking-[-0.02em] normal-case sm:text-[72px]">Studio</span>
      </h1>
      <StudioView />
    </div>
  );
}
