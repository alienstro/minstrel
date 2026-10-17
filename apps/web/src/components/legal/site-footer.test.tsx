import { render, screen } from '@testing-library/react';
import { PHOTO_CREDITS } from './photo-credits';
import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  it('links to the privacy policy, the terms and the contact page', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
  });

  it('Home footer credits the photos', () => {
    render(<SiteFooter credits />);
    for (const credit of PHOTO_CREDITS) {
      expect(screen.getByRole('link', { name: credit.creator })).toHaveAttribute('href', credit.source);
    }
    expect(screen.getByText(/CC BY 2\.0/)).toBeInTheDocument();
  });

  it('leaves out the credits on a page with no photos', () => {
    render(<SiteFooter />);
    expect(screen.queryByRole('link', { name: 'Jebulon' })).toBeNull();
  });
});
