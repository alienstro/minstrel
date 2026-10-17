import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeHero } from './home-hero';

beforeEach(() => {
  // jsdom has no media playback. These stubs fire the events that a browser fires.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HomeHero sample song', () => {
  it('plays the sample song of The Cat Who Sailed', async () => {
    const { container } = render(<HomeHero />);

    await userEvent.click(screen.getByRole('button', { name: 'Play The Cat Who Sailed' }));

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('/samples/the-cat-who-sailed.mp3');
    expect(screen.getByRole('button', { name: 'Pause The Cat Who Sailed' })).toBeInTheDocument();
  });

  it('shows no play button on a cover with no sample song', async () => {
    render(<HomeHero />);

    await userEvent.click(screen.getByRole('button', { name: 'Next cover' }));

    expect(screen.getByRole('img', { name: 'Sample cover art for Lantern Over Dunmoor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Play / })).toBeNull();
  });

  it('stops the sample song when the cover changes', async () => {
    render(<HomeHero />);
    await userEvent.click(screen.getByRole('button', { name: 'Play The Cat Who Sailed' }));

    await userEvent.click(screen.getByRole('button', { name: 'Next cover' }));

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});
