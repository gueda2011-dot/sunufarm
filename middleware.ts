/**
 * SunuFarm - Middleware global d'authentification
 *
 * Edge runtime must stay lean on Vercel. We only check for a valid NextAuth JWT
 * cookie here, and keep the full credentials/prisma auth setup in server-only code.
 */

import { getToken } from "next-auth/jwt"
import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PATHS: RegExp[] = [
  /^\/login(\/|$)/,
  /^\/register(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/reset-password(\/|$)/,
  /^\/verify-email(\/|$)/,
  /^\/api\/auth\//,
  /^\/api\/payments\/webhooks\//,
  /^\/api\/cron\//,
  /^\/api\/track\//,
  /^\/sw\.js$/,
  /^\/manifest\.json$/,
  /^\/manifest\.webmanifest$/,
  /^\/icons\//,
  /^\/images\//,
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname))
}

export default async function middleware(req: NextRequest) {
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: req.nextUrl.protocol === "https:",
  })

  if (!token?.sub) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", code: "UNAUTHENTICATED" },
        { status: 401 },
      )
    }

    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
}
