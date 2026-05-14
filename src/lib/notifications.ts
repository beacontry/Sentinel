import { db } from "./db";
import { discordWebhooks, users } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { sendDiscordWebhook, signalStrengthValue } from "./discord";
import { createRouteLogger } from "./logger";
import type { AnalysisResult } from "@/types";

const logger = createRouteLogger("notifications");

interface NotificationPayload {
  title: string;
  body: string;
  symbol?: string;
  signal?: string;
  url?: string;
}

/**
 * Send notifications to all enabled channels for a user.
 * Currently supports: Discord webhooks.
 * Future: push notifications, email.
 */
export async function sendNotification(
  userId: string,
  payload: NotificationPayload,
  analysisResult?: AnalysisResult
): Promise<void> {
  // Discord webhooks
  if (analysisResult) {
    const strength = signalStrengthValue(analysisResult.signal);
    const webhooks = await db
      .select()
      .from(discordWebhooks)
      .where(
        and(
          eq(discordWebhooks.userId, userId),
          eq(discordWebhooks.enabled, true)
        )
      );

    for (const wh of webhooks) {
      if (strength < wh.minSignalStrength) continue;
      const whSymbols = wh.symbols as string[];
      if (whSymbols.length > 0 && payload.symbol && !whSymbols.includes(payload.symbol)) continue;

      sendDiscordWebhook(wh.webhookUrl, analysisResult).catch(() => {
        // Best-effort delivery
      });
    }
  }

  // Push notifications (if configured). Best-effort — push relies on
  // browser subscriptions that can expire; one user's stale subscription
  // shouldn't break the notify pipeline for everyone else.
  try {
    const { sendPushToUser } = await import("./push");
    await sendPushToUser(userId, payload).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ userId, err: msg }, "Push notification failed (subscription expired?)");
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, err: msg }, "Push module unavailable — skipping push");
  }

  // Email (if configured). Same best-effort policy — Resend rate limits,
  // bounced addresses, or a missing API key shouldn't break the caller.
  try {
    const [user] = await db
      .select({ emailNotifications: users.emailNotifications, notificationEmail: users.notificationEmail })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.emailNotifications && user?.notificationEmail) {
      const { sendAlertEmail } = await import("./email");
      await sendAlertEmail(user.notificationEmail, payload.title, payload.body).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ userId, err: msg }, "Email notification failed");
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, err: msg }, "Email path failed — skipping email");
  }
}
