import { unauthorized, badRequest } from "./errors";

export interface GoogleVerifiedUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified: boolean;
}

/**
 * التحقق الأمني الموثوق من هوية Google عبر رمز ID Token الصادر من Google Identity Services
 * يفحص التوقيع والجهة المصدرة والمستلم وتاريخ الصلاحية والبريد الموثق.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleVerifiedUser> {
  const token = (idToken || "").trim();
  if (!token) {
    throw badRequest("رمز هوية Google مفقود.");
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();

  // فحص أولي لشكل الـ JWT (ثلاثة أجزاء مفصولة بنقاط)
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw badRequest("رمز هوية Google ذو صيغة غير صالحة.");
  }

  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000), // 10 ثوانٍ كحد أقصى للطلب
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn("[google-auth] فشل التحقق من Google tokeninfo:", response.status, errBody);
      throw unauthorized("رمز هوية Google غير صالح أو منتهي الصلاحية.");
    }

    const payload = (await response.json()) as {
      iss?: string;
      sub?: string;
      aud?: string;
      azp?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      picture?: string;
      exp?: string | number;
    };

    // 1) التحقق من الجهة المصدرة (Issuer)
    const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      throw unauthorized("جهة إصدار رمز Google غير صالحة.");
    }

    // 2) التحقق من الجمهور (Audience) عند توفر GOOGLE_CLIENT_ID
    if (clientId) {
      if (payload.aud !== clientId && payload.azp !== clientId) {
        throw unauthorized("رمز هوية Google مخصص لعميل آخر (Audience Mismatch).");
      }
    } else if (process.env.NODE_ENV === "production") {
      throw unauthorized("GOOGLE_CLIENT_ID غير معرّف في بيئة الإنتاج.");
    }

    // 3) التحقق من صلاحية الوقت (Expiration)
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = Number(payload.exp || 0);
    if (!expSec || expSec < nowSec) {
      throw unauthorized("رمز هوية Google منتهي الصلاحية.");
    }

    // 4) التحقق من معرّف المستخدم الثابت (Subject)
    if (!payload.sub || typeof payload.sub !== "string") {
      throw unauthorized("معرّف هوية Google غير صالح.");
    }

    // 5) التحقق من وجود البريد الإلكتروني وتوثيقه رسميًا من Google
    if (!payload.email || typeof payload.email !== "string") {
      throw unauthorized("حساب Google لا يتضمن بريدًا إلكترونيًا.");
    }

    const isEmailVerified = payload.email_verified === true || payload.email_verified === "true";
    if (!isEmailVerified) {
      throw unauthorized("البريد الإلكتروني في حساب Google غير موثق رسميًا من Google.");
    }

    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: payload.name?.trim(),
      picture: payload.picture?.trim(),
      emailVerified: true,
    };
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 401 || (err as { status?: number }).status === 400) {
      throw err;
    }
    console.error("[google-auth] خطأ غير متوقع أثناء فحص رمز Google:", err);
    throw unauthorized("تعذر التحقق من هوية Google حاليًا. يرجى المحاولة لاحقًا.");
  }
}
