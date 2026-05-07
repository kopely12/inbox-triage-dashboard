import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const ADMIN_PATHS = ['/team', '/settings'];
const PUBLIC_PATHS = ['/login', '/api/auth'];

// NextAuth v5: use auth as a wrapper so req.auth is populated from the JWT
export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Always allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Unauthenticated → login
  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Admin-only routes
  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminPath) {
    const role = req.auth.user?.orgRole;
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.redirect(new URL('/account', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
