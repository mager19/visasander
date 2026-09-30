import { NextResponse } from 'next/server';

// The manager UI lives internally under /manager and is only reachable through the
// rewritten public path (NEXT_PUBLIC_MANAGER_PATH). Direct hits to /manager are 404.
export function middleware() {
  return new NextResponse(null, { status: 404 });
}

export const config = { matcher: ['/manager', '/manager/:path*'] };
