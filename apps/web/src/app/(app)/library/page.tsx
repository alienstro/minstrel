import type { Metadata } from 'next';
import { TrackList } from '@/components/library/track-list';

export const metadata: Metadata = { title: 'Library · Minstrel' };

export default function LibraryPage() {
  return (
    <div className="flex flex-col">
      <h1 className="mt-4 mb-10 text-center text-[13px] font-semibold uppercase">
        <span>The complete works</span>{' '}
        <span className="serif mt-1 block text-[56px] leading-none tracking-[-0.02em] normal-case sm:text-[72px]">Library</span>
      </h1>
      <TrackList />
    </div>
  );
}
