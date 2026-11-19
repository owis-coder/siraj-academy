import { sendMail, type MailResult } from "./mail";
import { getSetting } from "./settings";

export interface AdminNotifyOptions {
  subject: string;
  text: string;
  html?: string;
  type?: "REGISTRATION" | "CUSTOM_REQUEST" | "GENERAL";
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  forceResend?: boolean;
}

export async function getAdminNotificationEmail(): Promise<string> {
  const fromDb = await getSetting("admin_notification_email");
  if (fromDb && fromDb.trim()) return fromDb.trim();
  if (process.env.ADMIN_NOTIFICATION_EMAIL && process.env.ADMIN_NOTIFICATION_EMAIL.trim()) {
    return process.env.ADMIN_NOTIFICATION_EMAIL.trim();
  }
  return "owisowis821@gmail.com";
}

export async function sendAdminNotificationEmail(
  arg1: string | AdminNotifyOptions,
  arg2?: string,
  arg3?: string,
): Promise<MailResult> {
  try {
    const to = await getAdminNotificationEmail();
    if (!to) return { delivered: false, error: "No admin recipient configured" };

    if (typeof arg1 === "string") {
      return await sendMail({
        to,
        subject: arg1,
        text: arg2 || "",
        html: arg3,
      });
    }

    return await sendMail({
      to,
      subject: arg1.subject,
      text: arg1.text,
      html: arg1.html,
      type: arg1.type,
      metadata: arg1.metadata,
      idempotencyKey: arg1.idempotencyKey,
      forceResend: arg1.forceResend,
    });
  } catch (err: any) {
    console.error("[ADMIN_NOTIFY] تعذر إرسال الإشعار للإدارة:", err?.message || err);
    return { delivered: false, error: err?.message || String(err) };
  }
}
