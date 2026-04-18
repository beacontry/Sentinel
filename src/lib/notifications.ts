import { db } from "./db";
import { discordWebhooks, users } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { sendDiscordWebhook, signalStrengthValue } from "./discord";
import type { AnalysisResult } from "@/types";

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

  // Push notifications (if configured)
  try {
    const { sendPushToUser } = await import("./push");
    await sendPushToUser(userId, payload).catch(() => {});
  } catch {
    // Push module may not be available
  }

  // Email (if configured)
  try {
    const [user] = await db
      .select({ emailNotifications: users.emailNotifications, notificationEmail: users.notificationEmail })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.emailNotifications && user?.notificationEmail) {
      const { sendAlertEmail } = await import("./email");
      await sendAlertEmail(user.notificationEmail, payload.title, payload.body).catch(() => {});
    }
  } catch {
    // Email module may not be available or columns don't exist yet
  }
}
