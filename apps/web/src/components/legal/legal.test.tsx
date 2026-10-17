import { render, screen } from '@testing-library/react';
import { PrivacyPolicy } from './privacy-policy';
import { TermsOfService } from './terms-of-service';

const CONTACT = 'mailto:robinxaquino@gmail.com';

describe('PrivacyPolicy', () => {
  it('names the operator and the contact address', () => {
    render(<PrivacyPolicy />);
    expect(screen.getByRole('heading', { level: 1, name: /Privacy policy$/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Robinx Prhynz Aquino/).length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole('link', { name: 'robinxaquino@gmail.com' })) {
      expect(link).toHaveAttribute('href', CONTACT);
    }
  });

  it('names each service that processes user data', () => {
    render(<PrivacyPolicy />);
    for (const service of ['Vercel', 'Neon', 'Cloudflare R2', 'Google', 'Resend']) {
      expect(screen.getAllByText(new RegExp(service)).length).toBeGreaterThan(0);
    }
  });
});

describe('TermsOfService', () => {
  it('names the governing law and the contact address', () => {
    render(<TermsOfService />);
    expect(screen.getByRole('heading', { level: 1, name: /Terms of service$/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Republic of the Philippines/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'robinxaquino@gmail.com' })[0]).toHaveAttribute('href', CONTACT);
  });
});
