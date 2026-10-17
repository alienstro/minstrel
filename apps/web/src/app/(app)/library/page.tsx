import type { Metadata } from 'next';
import { TrackList } from '@/components/library/track-list';

export const metadata: Metadata = { title: 'Library · Minstrel' };

export default function LibraryPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="type-page-title">Library</h1>
      <TrackList />
    </div>
  );
}
