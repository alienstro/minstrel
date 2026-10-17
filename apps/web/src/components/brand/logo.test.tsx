import { render } from '@testing-library/react';
import { Logo } from './logo';

describe('Logo', () => {
  it('Logo is hidden from screen readers and draws the mark', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '28');
    // The mark is a ring for the record and five bars for the waveform.
    expect(svg?.querySelector('path')).toHaveAttribute('fill', '#111111');
    expect(svg?.querySelectorAll('rect')).toHaveLength(5);
  });

  it('draws the white mark at the size that the caller gives', () => {
    const { container } = render(<Logo size={120} tone="white" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '120');
    expect(svg?.querySelector('path')).toHaveAttribute('fill', '#ffffff');
  });
});
