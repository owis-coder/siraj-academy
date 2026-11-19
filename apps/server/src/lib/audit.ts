// ============================================================
// سجل التدقيق — كتابة موحدة للأحداث الأمنية والوظيفية المهمة.
// قواعد صارمة: لا كلمات مرور، ولا رموز استعادة، ولا جلسات، ولا مفاتيح API،
// ولا محتوى رسائل خاصة. القيم الحساسة تُحجب تلقائيًا قبل الكتابة.
// ============================================================
import type { Request } from "express";
import { prisma } from "./prisma";

/** الحقول التي لا يجوز تسجيل قيمتها إطلاقًا (تُستبدل بعلامة حجب) */
const SENSITIVE_KEYS = [
  "password",
  "passwordHash",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "tokenhash",
  "resettoken",
  "emailverificationtoken",
  "secret",
  "apikey",
  "api_key",
  "cookie",
  "authorization",
  "sessionid",
  "sid",
];

const REDACTED = "[محجوب]";

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEYS.some((s) => k.includes(s.replace(/[_-]/g, "")));
}

/** يحجب أي قيمة حساسة داخل كائن قبل تخزينه في سجل التدقيق */
export function redact(values: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  if (!values) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
    } else if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      out[key] = redact(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return req.ip?.slice(0, 64) ?? undefined;
}

export function clientUserAgent(req: Request): string | undefined {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 400) : undefined;
}

export function requestIdOf(req: Request): string | undefined {
  const id = (req as Request & { id?: string }).id;
  return id ? String(id).slice(0, 80) : undefined;
}

export interface AuditInput {
  req?: Request;
  userId?: string | null;
  actorRole?: string | null;
  action: string;
  category?: "AUTH" | "ACCOUNT" | "SECURITY" | "REQUEST" | "ADMIN";
  result?: "SUCCESS" | "FAILURE";
  reason?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

/**
 * يكتب حدثًا في سجل التدقيق. لا يرمي أي خطأ أبدًا حتى لا يُعطّل العملية الأصلية،
 * لكنه يطبع تحذيرًا عامًا دون أي قيمة حساسة.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const validUserId =
      input.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.userId)
        ? input.userId
        : null;

    await prisma.auditLog.create({
      data: {
        userId: validUserId,
        actorRole: input.actorRole ?? (input.userId && !validUserId ? input.userId : null),
        action: input.action,
        category: input.category ?? "ACCOUNT",
        result: input.result ?? "SUCCESS",
        reason: input.reason ? String(input.reason).slice(0, 300) : null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ip: input.req ? clientIp(input.req) ?? null : null,
        userAgent: input.req ? clientUserAgent(input.req) ?? null : null,
        requestId: input.req ? requestIdOf(input.req) ?? null : null,
        oldValues: (redact(input.oldValues) ?? undefined) as never,
        newValues: (redact(input.newValues) ?? undefined) as never,
      },
    });
  } catch (err) {
    console.warn("[AUDIT] تعذر تسجيل الحدث (لن تُعطَّل العملية):", (err as Error)?.name ?? "خطأ");
  }
}
