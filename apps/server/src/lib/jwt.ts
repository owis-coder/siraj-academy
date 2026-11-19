import jwt, { type SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== "production" ? "siraj-dev-secret-change-me" : "");
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

if (!JWT_SECRET) {
  // نُبقي الخطأ واضحًا عند الإقلاع بدل فشل صامت لاحقًا
  throw new Error("JWT_SECRET غير معرّف في ملف .env");
}

export interface TokenPayload {
  sub: string;
  role: Role;
  /** معرّف الجلسة المسجّلة (سجل الأجهزة) — لا يحمل أي سر */
  sid?: string;
  /** نسخة جلسات المستخدم — زيادة الرقم تُبطل كل الرموز القديمة */
  sv?: number;
  /** نوع التذكرة لتمييز التذاكر المؤقتة عن رموز الجلسة العادية */
  tokenType?: "access" | "mfa_pending";
  /** معرّف فريد للتذكرة لمنع تشابه الرموز الصادرة في نفس الثانية */
  jti?: string;
}

export function signToken(
  userId: string,
  role: Role,
  opts: { sid?: string; sv?: number; tokenType?: "access" | "mfa_pending"; expiresIn?: string | number; jti?: string } = {},
): string {
  const payload: Record<string, unknown> = {
    sub: userId,
    role,
    ...(opts.sid ? { sid: opts.sid } : {}),
    sv: opts.sv ?? 0,
    tokenType: opts.tokenType ?? "access",
    ...(opts.jti ? { jti: opts.jti } : {}),
  };

  const signOpts: SignOptions = {
    expiresIn: (opts.expiresIn ?? JWT_EXPIRES_IN) as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, JWT_SECRET as string, signOpts);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string);
    if (typeof decoded === "object" && decoded !== null && "sub" in decoded && "role" in decoded) {
      return decoded as TokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = "sid";
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 يومًا
