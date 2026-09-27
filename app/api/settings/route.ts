import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/settings — fetch current settings (admin passkey gated)
export async function GET(request: NextRequest) {
  // Double-guard: the middleware sets fc_admin_passkey on /settings paths,
  // but API routes can be hit directly — verify the cookie here too.
  const passkeyCookie = request.cookies.get("fc_admin_passkey")?.value;
  const expected = process.env.ADMIN_PASSKEY || "5309";
  if (!passkeyCookie || passkeyCookie !== expected) {
    return NextResponse.json({ error: "Admin passkey required" }, { status: 403 });
  }

  try {
    const result = await db.select().from(settings).limit(1);
    if (!result[0]) {
      const created = await db.insert(settings).values({
        defaultImageModel: "fal-ai/nano-banana-pro",
        chatModel: "anthropic/claude-sonnet-4",
        chatMaxTokens: 4096,
        chatTemperature: "0.70",
      }).returning();
      return NextResponse.json(created[0]);
    }
    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// PATCH /api/settings — update settings (admin passkey gated)
export async function PATCH(request: NextRequest) {
  // Double-guard: verify admin passkey cookie
  const passkeyCookie = request.cookies.get("fc_admin_passkey")?.value;
  const expected = process.env.ADMIN_PASSKEY || "5309";
  if (!passkeyCookie || passkeyCookie !== expected) {
    return NextResponse.json({ error: "Admin passkey required" }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Get existing settings (create if not exists)
    let existing = await db.select().from(settings).limit(1);
    if (!existing[0]) {
      existing = await db.insert(settings).values({}).returning();
    }

    const result = await db
      .update(settings)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(settings.id, existing[0].id))
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
