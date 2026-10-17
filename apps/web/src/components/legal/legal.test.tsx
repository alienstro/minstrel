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
    for (const service of ['Cloudflare Tunnel', 'Cloudflare R2', 'Google']) {
      expect(screen.getAllByText(new RegExp(service)).length).toBeGreaterThan(0);
    }
  });

  it('names no hosting service that Minstrel no longer uses', () => {
    const { container } = render(<PrivacyPolicy />);
    expect(container.textContent).not.toMatch(/Vercel|Neon/);
  });

  it('says that the database backups keep deleted data for at most 14 days', () => {
    render(<PrivacyPolicy />);
    expect(screen.getByText(/at most 14 days/)).toBeInTheDocument();
  });

  it('names no email service and no password, because Minstrel has Google sign-in only', () => {
    const { container } = render(<PrivacyPolicy />);
    expect(container.textContent).not.toMatch(/Resend|password/i);
  });

  it('says that data can be lost with no way to get it back', () => {
    render(<PrivacyPolicy />);
    expect(screen.getByText(/no way to get it back/)).toBeInTheDocument();
  });
});

describe('TermsOfService', () => {
  it('names the governing law and the contact address', () => {
    render(<TermsOfService />);
    expect(screen.getByRole('heading', { level: 1, name: /Terms of service$/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Republic of the Philippines/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'robinxaquino@gmail.com' })[0]).toHaveAttribute('href', CONTACT);
  });

  it('says that Minstrel runs on free plans and can be down or lose data at any time', () => {
    render(<TermsOfService />);
    const section = screen.getByRole('heading', { name: 'Free plans, no promise of service' }).closest('section')!;
    expect(section).toHaveTextContent('free plans');
    expect(section).toHaveTextContent('can be slow or down at any time');
    expect(section).toHaveTextContent('with no way to get them back');
    expect(section).toHaveTextContent('Download each song that you want to keep');
  });

  it('names no password, because Minstrel has Google sign-in only', () => {
    const { container } = render(<TermsOfService />);
    expect(container.textContent).not.toMatch(/password/i);
  });
});
