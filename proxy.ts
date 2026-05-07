import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Lightweight proxy — just passes requests through.
// Auth protection is handled in (dashboard)/layout.tsx via server-side auth().
// This avoids calling auth() in the proxy context which can silently fail.
export function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
