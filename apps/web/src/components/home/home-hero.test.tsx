import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeHero } from './home-hero';

// jsdom has no media playback. These stubs fire the events that a browser fires.
function allowPlayback() {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
}

// The browser refuses sound that starts before the visitor clicks the page.
function blockAutoplay() {
  const play = vi.mocked(HTMLMediaElement.prototype.play);
  play.mockImplementationOnce(() => Promise.reject(new DOMException('play() failed', 'NotAllowedError')));
}

beforeEach(() => {
  allowPlayback();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HomeHero sample song', () => {
  it('starts Figuring Out on the first cover when the page loads', () => {
    const { container } = render(<HomeHero />);

    expect(screen.getByRole('img', { name: 'Sample cover art for Figuring Out' })).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('/samples/figuring-out.mp3');
    expect(screen.getByRole('button', { name: 'Pause Figuring Out' })).toBeInTheDocument();
  });

  it('shows Play with no error when the browser blocks the start, and one click starts the song', async () => {
    blockAutoplay();
    render(<HomeHero />);

    const play = await screen.findByRole('button', { name: 'Play Figuring Out' });
    await userEvent.click(play);

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Pause Figuring Out' })).toBeInTheDocument();
  });

  it('stays on the first cover and shows Play when the song ends', () => {
    const { container } = render(<HomeHero />);

    act(() => {
      container.querySelector('audio')?.dispatchEvent(new Event('ended'));
    });

    expect(screen.getByRole('img', { name: 'Sample cover art for Figuring Out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Figuring Out' })).toBeInTheDocument();
  });

  it('stops Figuring Out when the visitor goes to the next cover', async () => {
    render(<HomeHero />);

    await userEvent.click(screen.getByRole('button', { name: 'Next cover' }));

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('plays The Cat Who Sailed on the second cover, with no start on its own', async () => {
    const { container } = render(<HomeHero />);
    await userEvent.click(screen.getByRole('button', { name: 'Next cover' }));

    expect(screen.getByRole('img', { name: 'Sample cover art for Lantern Over Dunmoor' })).toBeInTheDocument();
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('/samples/the-cat-who-sailed.mp3');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Play Lantern Over Dunmoor' }));

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Pause Lantern Over Dunmoor' })).toBeInTheDocument();
  });

  it('shows no play button on a cover with no sample song', async () => {
    render(<HomeHero />);

    await userEvent.click(screen.getByRole('button', { name: 'Show Weld and Woad' }));

    expect(screen.getByRole('img', { name: 'Sample cover art for Weld and Woad' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Play|Pause) / })).toBeNull();
  });
});
