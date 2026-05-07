import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_PATHS = ['/team', '/settings'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let auth API and login through without session check
  if (pathname.startsWith('/api/auth') || pathname === '/login') {
    return NextResponse.next();
  }

  const session = await auth();

  // Unauthenticated → login
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  // Admin-only routes
  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminPath) {
    const role = session.user?.orgRole;
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.redirect(new URL('/account', req.nextUrl));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
