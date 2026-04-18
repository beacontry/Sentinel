import { createRequire } from "node:module";
import { db } from "./db";
import { pushSubscriptions } from "./db/schema";
import { eq } from "drizzle-orm";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  symbol?: string;
}

function loadOptionalWebPush() {
  const runtimeLoader = new Function(
    "createRequireFn",
    "fromUrl",
    "specifier",
    "return createRequireFn(fromUrl)(specifier);"
  ) as (
    createRequireFn: typeof createRequire,
    fromUrl: string,
    specifier: string
  ) => unknown;

  return runtimeLoader(createRequire, import.meta.url, "web-push");
}

/**
 * Send push notifications to all of a user's subscribed devices.
 * Uses the Web Push protocol via the `web-push` npm package if available.
 * Install web-push with: npm install web-push
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let webpush: any;
  try {
    webpush = loadOptionalWebPush();
  } catch {
    return;
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL;

  if (!vapidPublicKey || !vapidPrivateKey || !vapidEmail) return;

  webpush.setVapidDetails(
    `mailto:${vapidEmail}`,
    vapidPublicKey,
    vapidPrivateKey
  );

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/dashboard",
    symbol: payload.symbol,
  });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        pushPayload
      );
    } catch (err) {
      // If subscription is expired/invalid, remove it
      if (err && typeof err === "object" && "statusCode" in err) {
        const statusCode = (err as { statusCode: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
        }
      }
    }
  }
}
