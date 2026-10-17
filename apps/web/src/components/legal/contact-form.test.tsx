import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactForm, contactMailto } from './contact-form';

describe('contactMailto', () => {
  it('puts the topic in the subject and the name and message in the body', () => {
    const url = new URL(contactMailto({ topic: 'A song failed', name: 'Ada', message: 'Take 2 stopped.' }));
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('robinxaquino@gmail.com');
    expect(url.searchParams.get('subject')).toBe('Minstrel: A song failed');
    expect(url.searchParams.get('body')).toBe('Take 2 stopped.\n\nAda');
  });
});

describe('ContactForm', () => {
  it('shows the hint of the topic that the visitor picks', async () => {
    render(<ContactForm openMail={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    expect(screen.getByRole('button', { name: 'Privacy' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Message')).toHaveAttribute('placeholder', expect.stringContaining('a copy of your data'));
  });

  it('asks for a message before it opens the email app', async () => {
    const openMail = vi.fn();
    render(<ContactForm openMail={openMail} />);
    await userEvent.click(screen.getByRole('button', { name: /write the email/i }));
    const message = screen.getByLabelText('Message');
    expect(message).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(message.getAttribute('aria-describedby')!)).toHaveTextContent('Write a message.');
    expect(openMail).not.toHaveBeenCalled();
  });

  it('opens the email app with the message', async () => {
    const openMail = vi.fn();
    render(<ContactForm openMail={openMail} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Message'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /write the email/i }));
    expect(openMail).toHaveBeenCalledWith(contactMailto({ topic: 'A key does not work', name: 'Ada', message: 'Hello' }));
    expect(screen.getByRole('status')).toHaveTextContent('Your email app opens');
  });
});
