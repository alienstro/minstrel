import { ContactLink, LEGAL, LegalDocument, LegalSection } from './legal-document';

export function PrivacyPolicy() {
  return (
    <LegalDocument
      label="How Minstrel uses your data"
      title="Privacy policy"
      summary={[
        'Minstrel keeps your account, your encrypted provider keys and the songs that you make.',
        'Your song inputs go only to the providers that you choose, with your key.',
        'Minstrel shows no ads, sells no data and uses no analytics. You can delete your account at any time.',
      ]}
    >
      <LegalSection title="Who runs Minstrel">
        <p>
          {LEGAL.operator} runs Minstrel ({LEGAL.site}) as an individual and is the personal information controller
          for the data on this page. For each question about your data, write to <ContactLink />.
        </p>
      </LegalSection>

      <LegalSection title="The data that Minstrel keeps">
        <ul className="m-0 list-disc space-y-2 pl-[18px]">
          <li>
            <strong>Account data.</strong> Your name, your email address, and your profile picture. Minstrel receives
            them from Google when you sign in.
          </li>
          <li>
            <strong>Session data.</strong> For each signed-in session: the IP address, the browser user agent, and
            the session expiry time.
          </li>
          <li>
            <strong>Provider keys.</strong> The API keys that you add for your music and text providers. Minstrel
            encrypts each key with AES-256-GCM before it stores the key, and shows only the last 4 characters.
          </li>
          <li>
            <strong>Songs.</strong> Your song ideas, lyrics, styles, and titles, the song audio and cover images, and
            the status of each song request.
          </li>
          <li>
            <strong>Limit counters.</strong> Counts of recent requests for each account, which stop abuse.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How Minstrel uses your data">
        <p>
          Minstrel uses your data only to sign you in, to make your songs, to keep your library, and to stop abuse. Minstrel shows no ads, sells no data,
          and uses no analytics or tracking tools.
        </p>
      </LegalSection>

      <LegalSection title="Your music and text providers">
        <p>
          When you make a song or ask for lyrics, Minstrel sends your inputs to the provider that you chose, with your
          key. That provider then processes your inputs under its own terms and privacy policy. Read them before you
          add a key.
        </p>
      </LegalSection>

      <LegalSection title="Services that process your data">
        <ul className="m-0 list-disc space-y-2 pl-[18px]">
          <li>A hosting service runs the website, the API, and the database.</li>
          <li>A network service carries each connection between your browser and Minstrel.</li>
          <li>A file storage service stores the song audio, the cover images, and the database backups.</li>
          <li>Google signs you in.</li>
        </ul>
        <p>
          These services can store or process your data outside the Philippines. Each service processes the data only
          to give its service to Minstrel.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Minstrel sets only the session cookies that keep you signed in. Minstrel uses no advertising or analytics
          cookies.
        </p>
      </LegalSection>

      <LegalSection title="How long Minstrel keeps your data">
        <p>
          Minstrel keeps your data while your account exists. You can delete your account in Settings, Account. The
          deletion removes your audio files first, then your account, keys, songs, and sessions. Minstrel keeps a daily
          backup of the database, so a copy of your data stays in the backups for at most 14 days, and then the
          backups remove it too.
        </p>
        <p>
          Minstrel runs on one server and on free plans. If the server fails, or a plan reaches its limit or ends, your
          data can be lost with no way to get it back. The database backups do not include your audio files. Download
          each song that you want to keep.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Minstrel uses HTTPS for each connection, encrypts your provider keys, and keeps the audio files private. The browser gets audio only through links that expire.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Under the Data Privacy Act of 2012 (Republic Act No. 10173), you can ask to see, correct, or delete your
          data, ask for a copy of it, and object to its processing. Write to <ContactLink />. You can also complain to
          the National Privacy Commission of the Philippines.
        </p>
      </LegalSection>

      <LegalSection title="Age">
        <p>Minstrel is not for persons under 18 years old.</p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          When this policy changes, the date at the top changes. For an important change, the operator also sends an
          email to the address of each account.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
