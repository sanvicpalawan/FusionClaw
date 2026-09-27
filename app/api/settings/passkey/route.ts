import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Validates the 4-digit admin passkey and sets a cookie on success.
 *
 * Uses constant-time comparison to avoid timing leaks.
 */

const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || "5309";
const PASSKEY_COOKIE = "fc_admin_passkey";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { passkey } = body;

    if (!passkey || typeof passkey !== "string") {
      return NextResponse.json({ error: "Passkey is required" }, { status: 400 });
    }

    if (!constantTimeEqual(passkey, ADMIN_PASSKEY)) {
      return NextResponse.json({ error: "Invalid passkey" }, { status: 403 });
    }

    const response = NextResponse.json({ success: true });

    // Set cookie scoped to /settings path so it only applies there
    response.cookies.set(PASSKEY_COOKIE, passkey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/settings",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function GET() {
  // Health check — returns whether passkey auth is configured
  return NextResponse.json({
    configured: !!process.env.ADMIN_PASSKEY,
  });
}
