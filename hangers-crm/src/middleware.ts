import { NextRequest, NextResponse } from 'next/server'

const PRIVATE_PREFIXES = ['/dashboard', '/login', '/change-password', '/invoice/', '/quotation/', '/daily-iron/']

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  if (PRIVATE_PREFIXES.some((prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(prefix))) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  }
  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/change-password', '/invoice/:path*', '/quotation/:path*', '/daily-iron/:path*'],
}
