import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// ─── Route matchers ─────────────────────────────────────────────────────────

const PUBLIC_PATHS = [
  /^\/login(\/.*)?$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/logout$/,
  /^\/api\/google\/callback$/,
  /^\/embed\/.+/,                // tokenized client-portal pages — token in URL is the auth
  /^\/api\/hooks\/.+/,            // inbound webhooks — secret in URL is the auth
  /^\/api\/inbound-emails$/,      // inbound email receiver — for provider webhooks
  /^\/settings\/passkey/,         // admin passkey entry page — passkey IS the auth
  /^\/api\/settings\/passkey/,    // admin passkey submission API — passkey IS the auth
]
const API_PREFIX = /^\/api\//

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname))
}

function isApi(pathname: string): boolean {
  return API_PREFIX.test(pathname)
}

// ─── Localhost detection ────────────────────────────────────────────────────

function isLocalhost(req: NextRequest): boolean {
  const host = req.headers.get('host') || ''
  return (
    host.startsWith('localhost:') ||
    host === 'localhost' ||
    host.startsWith('127.0.0.1:') ||
    host === '127.0.0.1' ||
    host.startsWith('[::1]:') ||
    host === '[::1]'
  )
}

// ─── MCP API key validation (Edge-compatible, constant-time) ───────────────

function validateMcpApiKey(key: string): boolean {
  const validKey = process.env.MCP_API_KEY
  if (!validKey) return false
  if (key.length !== validKey.length) return false
  let result = 0
  for (let i = 0; i < key.length; i++) {
    result |= key.charCodeAt(i) ^ validKey.charCodeAt(i)
  }
  return result === 0
}

// ─── Admin passkey validation (Edge-compatible, constant-time) ──────────────

function validatePasskey(submitted: string, expected: string): boolean {
  if (submitted.length !== expected.length) return false
  let result = 0
  for (let i = 0; i < expected.length; i++) {
    result |= submitted.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return result === 0
}

// ─── Session cookie validation ──────────────────────────────────────────────

const SESSION_COOKIE = 'fc_session'

function getSessionSecret(): Uint8Array {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.MCP_API_KEY ||
    process.env.OWNER_PASSWORD ||
    'fusionclaw-dev-only-do-not-use-in-prod'
  return new TextEncoder().encode(secret)
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return false
  try {
    await jwtVerify(token, getSessionSecret())
    return true
  } catch {
    return false
  }
}

// ─── Public read-only demo ──────────────────────────────────────────────────
// NEXT_PUBLIC_DEMO_MODE=true turns a deployment into a stranger-safe showcase:
// every visitor is the owner, every write is refused. Only ever set this on a
// throwaway instance seeded with fictional data — never on a real one.

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const DEMO_READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const DEMO_WRITE_ALLOW = [/^\/api\/auth\//, /^\/api\/demo\/seed$/]

// ─── Main middleware ────────────────────────────────────────────────────────

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 0. Root → redirect straight to the dashboard (not the landing page).
  //    The marketing page still lives at /marketing for reference.
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // 0.1. Force the admin passkey environment variable.
  //    The deployed worker MUST have ADMIN_PASSKEY set (default 5309).
  //    If it is missing or blank, send every request to the passkey entry
  //    page rather than leaving /settings open.
  if (process.env.ADMIN_PASSKEY == null || process.env.ADMIN_PASSKEY === '') {
    const passkeyUrl = new URL('/settings/passkey', req.url)
    passkeyUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(passkeyUrl)
  }

  // 1. Public demo: reads pass through as the owner, writes are refused.
  if (DEMO_MODE) {
    if (isApi(pathname) && !DEMO_READ_METHODS.has(req.method) && !DEMO_WRITE_ALLOW.some((re) => re.test(pathname))) {
      return NextResponse.json(
        { error: 'This is a read-only demo of FusionClaw. Nothing is saved here. Get your own instance at https://fusionclaw.app/#pricing.' },
        { status: 403, headers: { 'x-fusionclaw-demo': 'read-only' } },
      )
    }
    if (pathname === '/login' || pathname.startsWith('/login/')) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // 1. MCP agent path — API route with valid Bearer token bypasses everything.
  if (isApi(pathname)) {
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const key = authHeader.slice(7)
      if (validateMcpApiKey(key)) return NextResponse.next()
    }
  }

  // 2. Public routes — login, auth APIs, OAuth callbacks, passkey entry page.
  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  // 2.5. Admin passkey gate — /settings (UI) and /api/settings (API) require
  //    a passkey cookie. The passkey cookie is itself sufficient auth for both:
  //    once the user has entered 5309 on /settings/passkey, the cookie carries
  //    them through without a session.
  const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || '5309'
  const PASSKEY_COOKIE = 'fc_admin_passkey'
  const isAdminSettingPath = pathname.startsWith('/settings') && !pathname.startsWith('/settings/passkey')
  const isAdminSettingsApi = pathname === '/api/settings' || pathname.startsWith('/api/settings/')
  if (isAdminSettingPath || isAdminSettingsApi) {
    const passkeyCookie = req.cookies.get(PASSKEY_COOKIE)?.value
    if (!passkeyCookie || !validatePasskey(passkeyCookie, ADMIN_PASSKEY)) {
      // For the API, return 403 so the client can read the refusal instead of
      // being redirected to an HTML passkey page that it cannot render.
      if (isApi(pathname)) {
        return NextResponse.json({ error: 'Admin passkey required' }, { status: 403 })
      }
      const passkeyUrl = new URL('/settings/passkey', req.url)
      passkeyUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(passkeyUrl)
    }
    // Passkey cookie is valid — this is enough auth for the settings tree.
    // Skip the session check below so /settings and /api/settings do not
    // redirect to /login.
    return NextResponse.next()
  }

  // 3. Localhost — trusted, no auth required. lib/auth.getCurrentUser()
  //    will auto-provision and return the singleton owner.
  if (isLocalhost(req)) {
    return NextResponse.next()
  }

  // 4. Deployed: require a valid session cookie.
  if (await hasValidSession(req)) {
    return NextResponse.next()
  }

  // 5. No auth — redirect non-API requests to /login. API requests get 401.
  if (isApi(pathname)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
