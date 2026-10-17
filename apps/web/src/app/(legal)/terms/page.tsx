import type { Metadata } from 'next';
import { TermsOfService } from '@/components/legal/terms-of-service';

export const metadata: Metadata = { title: 'Terms of service · Minstrel' };

export default function TermsPage() {
  return <TermsOfService />;
}
