// Admin-only endpoint for the non-secret app_settings KV (feature flags
// and similar toggles). Sibling of /api/admin/system-config (which is
// for encrypted API keys).
//
// GET   → list every KNOWN_KEY + current value + isDefault flag
// PATCH → set { key, value } — admin role required

import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import {
  listAppSettings,
  setAppSetting,
  isKnownAppSettingKey,
  type KnownAppSettingKey,
} from "@/lib/app-settings";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("admin/app-settings");

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const settings = await listAppSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "app-settings list failed");
    return NextResponse.json(
      { error: "Failed to load app settings" },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.string().min(1).max(256),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  if (!isKnownAppSettingKey(parsed.data.key)) {
    return NextResponse.json(
      { error: `Unknown setting key: ${parsed.data.key}` },
      { status: 400 }
    );
  }

  try {
    await setAppSetting(
      parsed.data.key as KnownAppSettingKey,
      parsed.data.value,
      { userId: auth.userId, email: auth.email }
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, key: parsed.data.key }, "app-settings update failed");
    return NextResponse.json(
      { error: "Failed to update setting" },
      { status: 500 }
    );
  }
}
