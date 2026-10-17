import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

// Spec §7.2. This check is for navigation only. The API session guard is the real check.
const SIGNED_IN_PREFIXES = ['/studio', '/library', '/settings'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = getSessionCookie(request) !== null;

  if (pathname === '/' && hasSession) {
    return NextResponse.redirect(new URL('/studio', request.url));
  }
  const needsSession = SIGNED_IN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsSession && !hasSession) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/studio/:path*', '/library/:path*', '/settings/:path*'],
};
