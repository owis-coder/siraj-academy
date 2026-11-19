// ============================================================
// رموز أمان لمرة واحدة (استعادة كلمة المرور / تأكيد تغيير البريد).
// - الرمز العشوائي يُرسل للمستخدم فقط، ويُخزَّن في قاعدة البيانات كتجزئة SHA-256.
// - الصلاحية 30 دقيقة، ويُستهلك مرة واحدة، وطلب رمز جديد يلغي كل الرموز السابقة.
// ============================================================
import crypto from "crypto";
import type { AuthTokenType } from "@prisma/client";
import { prisma } from "./prisma";

export const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 دقيقة

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface IssuedToken {
  raw: string;
  expiresAt: Date;
}

/** يصدر رمزًا جديدًا ويلغي أي رمز سابق غير مستخدم من النوع نفسه */
export async function issueToken(
  userId: string,
  type: AuthTokenType,
  options: { newEmail?: string | null; ttlMs?: number } = {},
): Promise<IssuedToken> {
  // إلغاء الرموز السابقة (تُعلَّم كمستخدمة لتبقى أثرًا للمراجعة ولا تعمل)
  await prisma.authToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (options.ttlMs ?? TOKEN_TTL_MS));

  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(raw),
      newEmail: options.newEmail ?? null,
      expiresAt,
    },
  });

  return { raw, expiresAt };
}

/**
 * يتحقق من رمز: موجود بنوعه، غير مستخدم، غير منتهي.
 * يعيد السجل أو null — دون أي تفاصيل تكشف السبب للمستخدم.
 */
export async function findValidToken(rawToken: string, type: AuthTokenType) {
  if (!rawToken || rawToken.length < 20) return null;
  const record = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record) return null;
  if (record.type !== type) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  return record;
}

/** يستهلك الرمز (مرة واحدة فقط) — يُستدعى بعد نجاح العملية */
export async function consumeToken(id: string): Promise<void> {
  await prisma.authToken.update({ where: { id }, data: { usedAt: new Date() } });
}

/** إبطال كل رموز نوع معين لمستخدم (مثلاً عند تغيير كلمة المرور) */
export async function revokeTokens(userId: string, type?: AuthTokenType): Promise<void> {
  await prisma.authToken.updateMany({
    where: { userId, usedAt: null, ...(type ? { type } : {}) },
    data: { usedAt: new Date() },
  });
}

/** رابط الواجهة الأساسي — لا يُثبَّت عنوان الإنتاج داخل الكود */
export function appBaseUrl(): string {
  const base = process.env.APP_BASE_URL || process.env.CLIENT_URL || "http://localhost:5173";
  return base.replace(/\/+$/, "");
}
