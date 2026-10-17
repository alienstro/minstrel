import Link from 'next/link';
import { ContactLink, LEGAL, LegalDocument, LegalSection } from './legal-document';

export function TermsOfService() {
  return (
    <LegalDocument
      label="The rules for using Minstrel"
      title="Terms of service"
      summary={[
        'You must be 18 or older. You keep your password safe.',
        'You pay your music and text providers directly, and you obey their terms.',
        'You keep your rights in your inputs. Minstrel is in early access, so keep your own copies of your songs.',
      ]}
    >
      <LegalSection title="The agreement">
        <p>
          These terms are an agreement between you and {LEGAL.operator}, who runs Minstrel ({LEGAL.site}) as an
          individual. When you make an account or use Minstrel, you accept these terms and the{' '}
          <Link href="/privacy" className="dotted">
            privacy policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Who can use Minstrel">
        <p>You must be at least 18 years old to use Minstrel.</p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          Keep your password safe. You are responsible for each action that your account does. Tell us at once at{' '}
          <ContactLink /> if someone else uses your account.
        </p>
      </LegalSection>

      <LegalSection title="Your provider keys and costs">
        <p>
          Minstrel makes songs with the provider keys that you add. You pay your providers directly, and you must obey
          their terms. Minstrel is not responsible for provider charges, provider outages, or provider decisions, for
          example a refused prompt. Add only keys that you have the right to use.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You keep your rights in your ideas, lyrics, and other inputs. Your rights in the songs that a provider makes
          depend on the terms of that provider. You let Minstrel store, process, and show your content to you only to
          run the service.
        </p>
      </LegalSection>

      <LegalSection title="Rules of use">
        <ul className="m-0 list-disc space-y-2 pl-[18px]">
          <li>Do not use Minstrel to break the law or to harm other persons.</li>
          <li>Do not send lyrics or other material that you have no right to use.</li>
          <li>Do not try to get around the request limits or the security of Minstrel.</li>
          <li>Do not send so many requests that the service becomes slow for other users.</li>
        </ul>
      </LegalSection>

      <LegalSection title="The service">
        <p>
          Minstrel is in early access. The operator provides it &quot;as is&quot;, and can change it or stop it at
          any time. Minstrel is not a backup service, so keep your own copies of the songs that matter to you.
        </p>
      </LegalSection>

      <LegalSection title="Limit of liability">
        <p>
          As far as the law allows, the operator is not liable for indirect or consequential loss, lost data, or
          provider charges that come from your use of Minstrel.
        </p>
      </LegalSection>

      <LegalSection title="End of use">
        <p>
          You can delete your account at any time in Settings, Account. The operator can suspend or close an account
          that breaks these terms.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          When these terms change, the date at the top changes. For an important change, Minstrel also sends an email
          to each account. If you use Minstrel after a change, you accept the new terms.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          The laws of the Republic of the Philippines govern these terms. The courts of the Philippines decide each
          dispute about them.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Write to <ContactLink /> with each question about these terms.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
