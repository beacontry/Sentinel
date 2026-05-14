/**
 * Email sender module.
 * Supports Resend (managed) or falls back to logging.
 * Configure via RESEND_API_KEY and EMAIL_FROM env vars.
 */

import { createRouteLogger } from "./logger";

const log = createRouteLogger("email");

interface EmailResult {
  success: boolean;
  error?: string;
}

export async function sendAlertEmail(
  to: string,
  subject: string,
  body: string
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Beacontry <hello@beacontry.com>";

  if (!apiKey) {
    log.info({ to, subject }, "Email not configured, would send");
    return { success: false, error: "Email not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Beacontry: ${subject}`,
        html: buildEmailHtml(subject, body),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      log.error({ err }, "Send failed");
      return { success: false, error: "Send failed" };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Send error");
    return { success: false, error: message };
  }
}

export async function sendInviteEmail(
  to: string,
  signupUrl: string
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Beacontry <hello@beacontry.com>";

  if (!apiKey) {
    log.info({ to, signupUrl }, "Email not configured, would send invite");
    return { success: false, error: "Email not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "You're invited to Beacontry",
        html: buildInviteEmailHtml(signupUrl),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      log.error({ err }, "Invite email send failed");
      return { success: false, error: "Send failed" };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Invite email send error");
    return { success: false, error: message };
  }
}

function buildInviteEmailHtml(signupUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#0a0e17;font-family:'Helvetica Neue',Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
        <div style="background:#111827;border-radius:12px;border:1px solid #1e293b;padding:32px;">
          <div style="margin-bottom:24px;">
            <span style="color:#10b981;font-size:20px;font-weight:bold;">Beacontry</span>
          </div>
          <h2 style="color:#f8fafc;margin:0 0 16px;font-size:18px;">You're invited to Beacontry</h2>
          <p style="color:#94a3b8;margin:0 0 24px;line-height:1.6;font-size:14px;">
            You've been invited to join Beacontry, an automated trading intelligence platform.
            Click below to create your account. This invite expires in 7 days.
          </p>
          <a href="${signupUrl}"
             style="display:inline-block;background:#10b981;color:#fff;padding:12px 28px;
                    border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
            Create Your Account
          </a>
          <p style="color:#64748b;font-size:12px;margin-top:20px;line-height:1.5;">
            If the button doesn't work, copy this link:<br/>
            <span style="color:#94a3b8;word-break:break-all;">${signupUrl}</span>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function buildEmailHtml(subject: string, body: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#0a0e17;font-family:'Helvetica Neue',Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
        <div style="background:#111827;border-radius:12px;border:1px solid #1e293b;padding:32px;">
          <div style="margin-bottom:24px;">
            <span style="color:#3b82f6;font-size:20px;font-weight:bold;">Beacontry</span>
          </div>
          <h2 style="color:#f8fafc;margin:0 0 16px;font-size:18px;">${subject}</h2>
          <p style="color:#94a3b8;margin:0 0 24px;line-height:1.6;font-size:14px;">${body}</p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard"
             style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 24px;
                    border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">
            Open Dashboard
          </a>
        </div>
        <p style="color:#64748b;font-size:12px;margin-top:16px;text-align:center;">
          You're receiving this because you enabled email alerts in Beacontry.
        </p>
      </div>
    </body>
    </html>
  `;
}
