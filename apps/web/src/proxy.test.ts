// @vitest-environment node
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const SESSION = 'better-auth.session_token=abc.def';

const go = (path: string, cookie?: string) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} }));

describe('proxy', () => {
  it('/studio without a cookie redirects to /sign-in', () => {
    const res = go('/studio');
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/sign-in');
  });

  it('/settings/connections without a cookie redirects to /sign-in', () => {
    expect(new URL(go('/settings/connections').headers.get('location')!).pathname).toBe('/sign-in');
  });

  it('/ with a cookie redirects to /studio', () => {
    const res = go('/', SESSION);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/studio');
  });

  it('a secure session cookie counts too', () => {
    expect(go('/studio', `__Secure-${SESSION}`).headers.get('location')).toBeNull();
  });

  it('/sign-in without a cookie passes', () => {
    const res = go('/sign-in');
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});
