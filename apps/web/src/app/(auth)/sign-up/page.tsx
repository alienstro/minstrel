import { permanentRedirect } from 'next/navigation';

// Google sign-in also makes the account, so the old sign-up link goes to the sign-in page.
export default function SignUpPage() {
  permanentRedirect('/sign-in');
}
