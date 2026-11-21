import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { hashPassword, comparePassword } from "../lib/password";
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE, verifyToken, signOAuthTicket, verifyOAuthTicket } from "../lib/jwt";
import { verifyGoogleIdToken } from "../lib/googleAuth";
import { sendMail } from "../lib/mail";
import { notifyAdmins } from "../lib/notify";
import { sendAdminNotificationEmail } from "../lib/adminNotify";
import { buildRegistrationNotification } from "../lib/emailTemplates";
import { triggerUsersExcelSync } from "../lib/excelUsers";
import { conflict, forbidden, notFound, unauthorized, badRequest, HttpError } from "../lib/errors";
import { requireAuth, sanitizeUser } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { audit, clientIp, clientUserAgent } from "../lib/audit";
import { appBaseUrl, consumeToken, findValidToken, issueToken, revokeTokens } from "../lib/authTokens";
import { rateLimit } from "../lib/rateLimit";
import { totpService } from "../lib/totp";
import { totpCipher } from "../lib/totpCipher";
import { passwordService } from "../lib/passwordSecurity";
import { securityMonitor } from "../lib/securityMonitor";
import { getTrustedClientIp } from "../lib/ipShield";
import { requireCaptcha } from "../middleware/captcha";
import { getSecuritySettings } from "../lib/securitySettings";
import { securityCache } from "../lib/redis";
import { ensureUserSupportRoom } from "../lib/supportChat";
import {
  studentRegisterSchema,
  teacherRegisterSchema,
  completeOAuthSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  usernameRule,
} from "../validation/auth";
import { confirmEmailChangeSchema } from "../validation/account";
import { Role } from "@prisma/client";

const router = Router();
const APP_BASE_URL = appBaseUrl();

// خيارات كوكي الجلسة: HttpOnly + secure في الإنتاج (SameSite=None في الإنتاج للسماح بالربط بين Vercel و Render)
function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    secure: isProd,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
}

/** ينشئ سجل جلسة/جهاز ويصدر كوكي موقّعًا مربوطًا برقم نسخة الجلسات */
async function startSession(
  req: Parameters<typeof clientIp>[0],
  res: { cookie: (name: string, value: string, opts: ReturnType<typeof cookieOptions>) => unknown },
  user: { id: string; role: Role; sessionVersion: number },
) {
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      userAgent: clientUserAgent(req) ?? null,
      ip: clientIp(req) ?? null,
    },
  });
  const token = signToken(user.id, user.role, { sid: session.id, sv: user.sessionVersion });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  return session;
}

/** إبطال كل الجلسات: زيادة النسخة تُسقط كل الرموز القائمة فورًا */
async function revokeAllSessions(userId: string, reason: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } }),
    prisma.userSession.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: new Date(), endReason: reason },
    }),
  ]);
}

/** البريد الإلكتروني يُقارَن دون حساسية لحالة الأحرف */
function findByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

function findByUsername(username: string) {
  return prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
}

/** يمنع تكرار اسم المستخدم/البريد مع كشف اسم الحقل المأخوذ فقط */
async function assertFreeCredentials(username: string, email: string, ignoreUserId?: string): Promise<void> {
  const usernameTaken = await findByUsername(username);
  if (usernameTaken && usernameTaken.id !== ignoreUserId) throw conflict("اسم المستخدم مستخدم مسبقًا — اختر اسمًا آخر");
  const emailTaken = await findByEmail(email);
  if (emailTaken && emailTaken.id !== ignoreUserId) throw conflict("البريد الإلكتروني مسجل مسبقًا");
}

/** يميّز خطأ القيد الفريد (تسجيل متزامن) ويحوّله لرسالة واضحة */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/** إشعار أمني نصي (لا يحتوي أي كلمة مرور أو رمز) */
async function sendSecurityNotice(to: string, subject: string, text: string): Promise<void> {
  try {
    await sendMail({ to, subject, text, type: "GENERAL" });
  } catch (err) {
    console.warn("[AUTH] تعذر إرسال الإشعار الأمني:", (err as Error)?.name);
  }
}

/* ============================================================
   توثيق البريد الإلكتروني الحالي — بزر واحد:
   - يُستخدم البريد المسجّل في الحساب تلقائيًا (لا يُقبل بريد آخر).
   - رمز عشوائي قوي يُخزَّن كتجزئة SHA-256 فقط (AuthToken).
   - صلاحية 30 دقيقة، استخدام مرة واحدة، وطلب جديد يلغي السابق.
   - لا يُطلب رمز يدوي ولا كلمة مرور.
   ============================================================ */

const VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;

/** يصدر رمز توثيق للبريد الحالي ويرسل الرابط — دون حدّ معدل (للتسجيل) */
async function issueEmailVerification(user: {
  id: string;
  email: string;
  fullName: string;
}): Promise<{ expiresAt: Date }> {
  const { raw, expiresAt } = await issueToken(user.id, "EMAIL_VERIFY", {
    newEmail: user.email.toLowerCase(),
  });
  const link = `${APP_BASE_URL}/verify-email?token=${raw}`;

  await sendMail({
    to: user.email,
    subject: "تفعيل حسابك في أكاديمية سراج",
    text:
      `مرحبًا ${user.fullName}!\n\n` +
      `اضغط الرابط التالي لتوثيق بريدك الإلكتروني (${user.email}). الرابط صالح لمدة 30 دقيقة ويُستخدم مرة واحدة:\n${link}\n\n` +
      `إن لم تطلب ذلك فتجاهل الرسالة، ولن يتغير شيء في حسابك.`,
    html:
      `<div dir="rtl" style="font-family:system-ui,Segoe UI,Tahoma,sans-serif;line-height:1.9">` +
      `<p>مرحبًا ${user.fullName}!</p>` +
      `<p>اضغط الزر التالي لتوثيق بريدك الإلكتروني <strong>${user.email}</strong>. الرابط صالح لمدة 30 دقيقة ويُستخدم مرة واحدة.</p>` +
      `<p><a href="${link}" style="display:inline-block;background:#C9964B;color:#201D1A;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">توثيق البريد الإلكتروني</a></p>` +
      `<p style="color:#666;font-size:12px">إن لم تطلب ذلك فتجاهل الرسالة، ولن يتغير شيء في حسابك.</p>` +
      `</div>`,
    type: "GENERAL",
    metadata: { userId: user.id, kind: "EMAIL_VERIFY" },
  });

  return { expiresAt };
}

/** طلب رابط توثيق جديد مع حدّ معدل: 60 ثانية بين الطلبات و5 في الساعة */
async function requestVerificationLink(user: {
  id: string;
  email: string;
  fullName: string;
}): Promise<{ expiresAt: Date }> {
  const hourly = rateLimit(`email-verify:${user.id}`, 5, 60 * 60 * 1000);
  if (!hourly.ok) {
    throw new HttpError(
      429,
      "طلبات كثيرة لرابط التوثيق. حاول بعد قليل.",
      "RATE_LIMITED",
      { retryAfterSec: hourly.retryAfterSec },
    );
  }

  const latest = await prisma.authToken.findFirst({
    where: { userId: user.id, type: "EMAIL_VERIFY" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < VERIFY_RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil(
      (VERIFY_RESEND_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime())) / 1000,
    );
    throw new HttpError(429, "يرجى الانتظار قبل طلب رابط جديد.", "RATE_LIMITED", {
      retryAfterSec: waitSec,
    });
  }

  return issueEmailVerification(user);
}

// ---------- تسجيل طالب ----------
router.post(
  "/register/student",
  requireCaptcha("REGISTER"),
  parseBody(studentRegisterSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    try {
      await assertFreeCredentials(data.username, data.email);
    } catch (err) {
      await audit({
        req,
        action: "REGISTER",
        category: "AUTH",
        result: "FAILURE",
        reason: (err as Error).message,
        newValues: { username: data.username, role: "STUDENT" },
      });
      throw err;
    }

    let user;
    try {
      user = await prisma.user.create({
        data: {
          fullName: data.fullName,
          username: data.username,
          email: data.email.toLowerCase(),
          passwordHash: await hashPassword(data.password),
          whatsapp: data.whatsapp ?? null,
          role: Role.STUDENT,
          status: "ACTIVE",
          level: data.level?.trim() || null,
          emailVerified: false,
          universityId: data.universityId,
          majorId: data.majorId,
        },
      });
    } catch (err) {
      // تسجيل متزامن بنفس الاسم/البريد: القيد الفريد في قاعدة البيانات هو الحكم النهائي
      if (isUniqueViolation(err)) {
        await audit({
          req,
          action: "REGISTER",
          category: "AUTH",
          result: "FAILURE",
          reason: "اسم مستخدم أو بريد مكرر (تسجيل متزامن)",
          newValues: { username: data.username, role: "STUDENT" },
        });
        const taken = await findByUsername(data.username);
        throw conflict(taken ? "اسم المستخدم مستخدم مسبقًا — اختر اسمًا آخر" : "البريد الإلكتروني مسجل مسبقًا");
      }
      throw err;
    }

    void ensureUserSupportRoom(user).catch(() => {});

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "REGISTER",
      category: "AUTH",
      targetType: "User",
      targetId: user.id,
      newValues: { username: user.username, role: user.role },
    });

    // تحديث سجل Excel التلقائي في الخلفية بدون تعطيل عملية التسجيل
    triggerUsersExcelSync();

    // إشعار الإدارة بتسجيل مستخدم جديد
    try {
      const uni = user.universityId ? await prisma.university.findUnique({ where: { id: user.universityId }, select: { name: true } }) : null;
      const maj = user.majorId ? await prisma.major.findUnique({ where: { id: user.majorId }, select: { name: true } }) : null;
      const notif = buildRegistrationNotification({
        role: "STUDENT",
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        whatsapp: user.whatsapp,
        universityName: uni?.name || null,
        majorName: maj?.name || null,
        level: user.level,
        createdAt: user.createdAt,
        status: user.status,
      });

      void sendAdminNotificationEmail({
        subject: notif.subject,
        text: notif.text,
        html: notif.html,
        type: "REGISTRATION",
        metadata: { userId: user.id, username: user.username, role: user.role },
        idempotencyKey: `register-student-${user.id}`,
      });
    } catch (e) {
      console.error("[AUTH] failed to notify admin on student registration", e);
    }

    // رابط توثيق مُجزّأ (30 دقيقة، استخدام مرة واحدة) — لا يُخزَّن الرمز نفسه
    try {
      await issueEmailVerification(user);
    } catch (err) {
      console.error("[AUTH] تعذر إرسال رابط التوثيق:", (err as Error)?.name);
    }

    await startSession(req, res, user);
    res.status(201).json({
      data: {
        user: sanitizeUser(user),
        message: "تم إنشاء الحساب. راجع بريدك لتفعيله (يمكنك استخدام الموقع قبل التفعيل).",
      },
    });
  }),
);

// ---------- تسجيل مدرس (يبدأ PENDING حتى موافقة الإدارة) ----------
router.post(
  "/register/teacher",
  requireCaptcha("REGISTER"),
  parseBody(teacherRegisterSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    try {
      await assertFreeCredentials(data.username, data.email);
    } catch (err) {
      await audit({
        req,
        action: "REGISTER",
        category: "AUTH",
        result: "FAILURE",
        reason: (err as Error).message,
        newValues: { username: data.username, role: "TEACHER" },
      });
      throw err;
    }

    let user;
    try {
      user = await prisma.user.create({
        data: {
          fullName: data.fullName,
          username: data.username,
          email: data.email.toLowerCase(),
          passwordHash: await hashPassword(data.password),
          whatsapp: data.whatsapp ?? null,
          role: Role.TEACHER,
          status: "ACTIVE",
          emailVerified: false,
          universityId: data.universityId,
          majorId: data.majorId,
          level: data.level?.trim() || null,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        await audit({
          req,
          action: "REGISTER",
          category: "AUTH",
          result: "FAILURE",
          reason: "اسم مستخدم أو بريد مكرر (تسجيل متزامن)",
          newValues: { username: data.username, role: "TEACHER" },
        });
        const taken = await findByUsername(data.username);
        throw conflict(taken ? "اسم المستخدم مستخدم مسبقًا — اختر اسمًا آخر" : "البريد الإلكتروني مسجل مسبقًا");
      }
      throw err;
    }

    const profile = await prisma.teacherProfile.create({
      data: {
        userId: user.id,
        degree: data.degree,
        bio: data.bio,
        specialties: data.specialties,
        universitiesText: data.universitiesText,
        docsUrl: data.docsUrl,
        status: "PENDING",
      },
    });

    void ensureUserSupportRoom(user).catch(() => {});

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "REGISTER",
      category: "AUTH",
      targetType: "User",
      targetId: user.id,
      newValues: { username: user.username, role: user.role, teacherStatus: profile.status },
    });

    // تحديث سجل Excel التلقائي في الخلفية
    triggerUsersExcelSync();

    await notifyAdmins({
      title: "مدرس جديد بانتظار المراجعة",
      body: `${user.fullName} أرسل طلب انضمام كمدرس.`,
      link: "/admin/teachers?status=PENDING",
      type: "TEACHER_PENDING",
    });

    try {
      const notif = buildRegistrationNotification({
        role: "TEACHER",
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        whatsapp: user.whatsapp,
        universityName: data.universitiesText || null,
        majorName: (data.specialties || []).join("، ") || null,
        createdAt: user.createdAt,
        status: user.status,
        teacherApprovalStatus: profile.status,
      });

      void sendAdminNotificationEmail({
        subject: notif.subject,
        text: notif.text,
        html: notif.html,
        type: "REGISTRATION",
        metadata: { userId: user.id, username: user.username, role: user.role },
        idempotencyKey: `register-teacher-${user.id}`,
      });
    } catch (e) {
      console.error("[AUTH] failed to notify admin on teacher registration", e);
    }

    // رابط توثيق مُجزّأ (30 دقيقة، استخدام مرة واحدة)
    try {
      await issueEmailVerification(user);
    } catch (err) {
      console.error("[AUTH] تعذر إرسال رابط التوثيق:", (err as Error)?.name);
    }

    await startSession(req, res, user);
    res.status(201).json({
      data: {
        user: sanitizeUser(user),
        teacherProfile: { id: profile.id, status: profile.status },
        message: "تم إنشاء حساب المدرس، وسيُفعّل بعد مراجعة الإدارة.",
      },
    });
  }),
);

// ---------- المصادقة الموثوقة عبر Google Identity Services ----------
router.post(
  "/google",
  asyncHandler(async (req, res) => {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken || typeof idToken !== "string") {
      throw badRequest("رمز هوية Google مطلوب.");
    }

    const verified = await verifyGoogleIdToken(idToken);

    // 1) فحص ما إذا كانت هوية Google مسجلة ومرتبطة بحساب موجود مسبقًا
    const existingOAuth = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerSubjectId: {
          provider: "google",
          providerSubjectId: verified.sub,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingOAuth && existingOAuth.user) {
      const user = existingOAuth.user;

      if (user.status === "SUSPENDED") {
        throw forbidden("الحساب موقوف. يرجى التواصل مع الإدارة.");
      }

      // تحديث وقت آخر استخدام للهوية
      await prisma.oAuthAccount.update({
        where: { id: existingOAuth.id },
        data: { lastUsedAt: new Date(), email: verified.email },
      });

      const session = await startSession(req, res, user);

      await audit({
        req,
        userId: user.id,
        action: "LOGIN",
        category: "AUTH",
        result: "SUCCESS",
        newValues: { method: "GOOGLE_OAUTH", providerSubjectId: verified.sub },
      });

      return res.json({
        data: {
          status: "LOGGED_IN",
          user: sanitizeUser(user),
          session: { id: session.id },
        },
        message: "تم تسجيل الدخول بنجاح عبر حساب Google.",
      });
    }

    // 2) إذا لم تكن الهوية مربوطة: هل يوجد مستخدم مسجل مسبقًا بهذا البريد؟
    const existingUserByEmail = await prisma.user.findUnique({
      where: { email: verified.email },
    });

    if (existingUserByEmail) {
      await audit({
        req,
        action: "LOGIN",
        category: "AUTH",
        result: "FAILURE",
        reason: "محاولة دخول بـ Google لبريد موجود مسبقًا غير مربوط",
        newValues: { email: verified.email, provider: "google" },
      });

      return res.status(200).json({
        data: {
          status: "ACCOUNT_EXISTS",
          email: verified.email,
        },
        message:
          "يوجد حساب مسجل بهذا البريد مسبقًا. يرجى تسجيل الدخول أولاً بكلمة المرور الخاصة بك لإتمام ربط حساب Google بأمان.",
      });
    }

    // 3) مستخدم جديد تمامًا — نصدر تذكرة تسجيل مؤقتة موقّعة ومحمية من التلاعب
    const registrationTicket = signOAuthTicket({
      provider: "google",
      providerSubjectId: verified.sub,
      email: verified.email,
      name: verified.name,
      avatarUrl: verified.picture,
    });

    await audit({
      req,
      action: "REGISTER",
      category: "AUTH",
      result: "SUCCESS",
      reason: "تم التحقق من هوية Google وبانتظار استكمال البيانات",
      newValues: { email: verified.email, provider: "google" },
    });

    return res.status(200).json({
      data: {
        status: "NEEDS_COMPLETION",
        registrationTicket,
        email: verified.email,
        fullName: verified.name || "",
        avatarUrl: verified.picture || null,
      },
      message: "تم التحقق من حساب Google بنجاح. يرجى استكمال بيانات التسجيل.",
    });
  }),
);

// ---------- استكمال بيانات التسجيل لحسابات OAuth (Google) ----------
// لا تتطلب كابتشا إضافية لأن هوية المستخدم وبشريته تم التحقق منها رسميًا وتوقيعها عبر Google OAuth
router.post(
  "/register/complete-oauth",
  parseBody(completeOAuthSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;

    // 1) فحص التذكرة الموقّعة واستخراج البريد والهوية الموثقة منها حصرًا (Zero-Trust)
    const ticket = verifyOAuthTicket(data.registrationTicket);
    if (!ticket) {
      throw unauthorized("تذكرة التسجيل منتهية الصلاحية أو غير صالحة. يرجى إعادة تسجيل الدخول عبر Google.");
    }

    const verifiedEmail = ticket.email.toLowerCase().trim();

    // 2) التأكد من عدم استخدام اسم المستخدم أو البريد مسبقًا
    try {
      await assertFreeCredentials(data.username, verifiedEmail);
    } catch (err) {
      await audit({
        req,
        action: "REGISTER",
        category: "AUTH",
        result: "FAILURE",
        reason: (err as Error).message,
        newValues: { username: data.username, provider: ticket.provider },
      });
      throw err;
    }

    const isTeacher = data.role === "TEACHER";
    let user;

    try {
      user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            fullName: data.fullName.trim(),
            username: data.username.trim(),
            email: verifiedEmail, // البريد الموثق من تذكرة Google المشفرة
            passwordHash: await hashPassword(data.password),
            whatsapp: data.whatsapp ?? null,
            role: isTeacher ? Role.TEACHER : Role.STUDENT,
            status: "ACTIVE",
            emailVerified: true, // موثق رسميًا من Google
            emailVerifiedAt: new Date(),
            universityId: data.universityId || null,
            majorId: data.majorId || null,
            level: data.level?.trim() || null,
          },
        });

        // ربط هوية OAuth
        await tx.oAuthAccount.create({
          data: {
            userId: newUser.id,
            provider: ticket.provider,
            providerSubjectId: ticket.providerSubjectId,
            email: verifiedEmail,
          },
        });

        if (isTeacher) {
          await tx.teacherProfile.create({
            data: {
              userId: newUser.id,
              degree: data.degree || "بكالوريوس",
              bio: data.bio || `مدرس مسجل عبر ${ticket.provider}`,
              specialties: data.specialties && data.specialties.length > 0 ? data.specialties : ["عام"],
              status: "PENDING",
            },
          });
        }

        return newUser;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict("اسم المستخدم أو البريد الإلكتروني مستخدم مسبقًا.");
      }
      throw err;
    }

    triggerUsersExcelSync();
    void ensureUserSupportRoom(user).catch(() => {});

    await audit({
      req,
      userId: user.id,
      action: "REGISTER",
      category: "AUTH",
      result: "SUCCESS",
      newValues: { method: "GOOGLE_OAUTH", providerSubjectId: ticket.providerSubjectId },
    });

    if (isTeacher) {
      await notifyAdmins({
        title: "مدرس جديد بانتظار المراجعة (Google)",
        body: `${user.fullName} سجل عبر Google وبانتظار المراجعة.`,
        link: "/admin/teachers?status=PENDING",
        type: "TEACHER_PENDING",
      });
    }

    const session = await startSession(req, res, user);

    return res.status(201).json({
      data: {
        user: sanitizeUser(user),
        session: { id: session.id },
        message: isTeacher
          ? "تم إنشاء حساب المدرس بنجاح عبر Google، وسيتم تفعيله بعد مراجعة الإدارة."
          : "تم إنشاء حسابك وتوثيقه بنجاح عبر Google.",
      },
    });
  }),
);

// ---------- الدخول (بريد أو اسم مستخدم — دون حساسية لحالة الأحرف) ----------
router.post(
  "/login",
  requireCaptcha("LOGIN"),
  parseBody(loginSchema),
  asyncHandler(async (req, res) => {
    const rawIdentifier = req.body.identifier.trim();
    const identifier = rawIdentifier.toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: "insensitive" } },
          { username: { equals: rawIdentifier, mode: "insensitive" } },
        ],
      },
      include: { teacherProfile: { select: { id: true, status: true } } },
    });

    const passwordOk = user ? await comparePassword(req.body.password, user.passwordHash) : false;

    if (!user || !passwordOk) {
      void securityMonitor.recordFailedLogin(getTrustedClientIp(req), rawIdentifier);
      // سبب الفشل عام: لا نكشف إن كان الحساب موجودًا أم لا
      await audit({
        req,
        userId: user?.id ?? null,
        actorRole: user?.role ?? null,
        action: "LOGIN",
        category: "AUTH",
        result: "FAILURE",
        reason: "بيانات دخول غير صحيحة",
      });
      throw unauthorized("بيانات الدخول غير صحيحة");
    }
    if (user.status === "SUSPENDED") {
      await audit({
        req,
        userId: user.id,
        actorRole: user.role,
        action: "LOGIN",
        category: "AUTH",
        result: "FAILURE",
        reason: "حساب معلّق",
      });
      throw forbidden("تم تعليق حسابك، راجع الإدارة");
    }

    // ترقية تلقائية لتجزئة كلمة المرور إلى 12 جولة إذا كانت قديمة
    void passwordService.verifyAndUpgrade(req.body.password, user.passwordHash, user.id);

    // إذا كانت المصادقة الثنائية مفعّلة على الحساب، نطلب رمز TOTP قبل إصدار كوكي الجلسة
    if (user.totpEnabled) {
      // تذكرة MFA مؤقتة صالحة لمدة 5 دقائق فقط مع Claim مخصص ومعرف فريد jti
      const mfaTicket = signToken(user.id, user.role, {
        sid: "mfa_pending",
        tokenType: "mfa_pending",
        expiresIn: "5m",
        jti: crypto.randomUUID(),
      });
      return res.json({
        data: {
          requireMfa: true,
          mfaTicket,
          message: "الحساب محمي بالمصادقة الثنائية (TOTP) — أدخل الرمز المكون من 6 أرقام لإكمال الدخول.",
        },
      });
    }

    await startSession(req, res, user);
    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "LOGIN",
      category: "AUTH",
      targetType: "User",
      targetId: user.id,
    });

    res.json({ data: { user: sanitizeUser(user), message: "تم تسجيل الدخول بنجاح" } });
  }),
);

// ---------- التحقق من رمز المصادقة الثنائية وإكمال تسجيل الدخول ----------
router.post(
  "/mfa/verify",
  asyncHandler(async (req, res) => {
    const { mfaTicket, code } = req.body as { mfaTicket?: string; code?: string };
    if (!mfaTicket || !code) {
      throw badRequest("رمز التحقق أو تذكرة المصادقة مفقود.");
    }

    const payload = verifyToken(mfaTicket);
    if (!payload || payload.sid !== "mfa_pending" || payload.tokenType !== "mfa_pending") {
      throw unauthorized("تذكرة المصادقة الثنائية غير صالحة أو منتهية. أعد تسجيل الدخول.");
    }

    // 1) فحص استهلاك التذكرة مرة واحدة فقط (Single-Use via Atomic Cache)
    const ticketHash = crypto.createHash("sha256").update(mfaTicket).digest("hex");
    const ticketUsedKey = `mfa:ticket:used:${ticketHash}`;
    const alreadyConsumed = await securityCache.get(ticketUsedKey);
    if (alreadyConsumed) {
      throw unauthorized("تذكرة المصادقة الثنائية استُخدمت مسبقًا. أعد تسجيل الدخول.");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { teacherProfile: { select: { id: true, status: true } } },
    });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw unauthorized("المصادقة الثنائية غير مفعّلة لهذا الحساب.");
    }

    // فك تشفير سر TOTP في الذاكرة لحظة الفحص (يدعم الصيغ المشفرة والقديمة بشفافية)
    const plainSecret = totpCipher.decrypt(user.totpSecret);
    if (!plainSecret) {
      throw unauthorized("تعذر فك تشفير بيانات المصادقة الثنائية لهذا الحساب.");
    }

    // 2) فحص رمز TOTP المكون من 6 أرقام
    let valid = totpService.verify(code, plainSecret);

    // إذا كان الرمز سليمًا، نمنع هجوم إعادة استخدامه ضمن نافذة الـ 90 ثانية (Replay prevention)
    if (valid) {
      const otpReplayKey = `mfa:otp:used:${user.id}:${code.trim()}`;
      const otpUsed = await securityCache.get(otpReplayKey);
      if (otpUsed) {
        valid = false;
      } else {
        await securityCache.set(otpReplayKey, "1", 90);
      }
    }

    // 3) فحص رموز الاسترجاع الاحتياطية لمرة واحدة إن لم يطابق الرمز
    if (!valid && user.totpBackupCodes) {
      const backupCheck = totpService.consumeBackupCode(code, user.totpBackupCodes);
      if (backupCheck.valid) {
        valid = true;
        await prisma.user.update({
          where: { id: user.id },
          data: { totpBackupCodes: backupCheck.remainingHashedJson },
        });
        await audit({
          req,
          userId: user.id,
          actorRole: user.role,
          action: "MFA_BACKUP_CODE_USED",
          category: "SECURITY",
          result: "SUCCESS",
        });
      }
    }

    if (!valid) {
      void securityMonitor.recordFailedLogin(getTrustedClientIp(req), user.username);
      await audit({
        req,
        userId: user.id,
        actorRole: user.role,
        action: "MFA_VERIFY",
        category: "SECURITY",
        result: "FAILURE",
        reason: "رمز تحقق ثنائي غير صحيح أو مستخدم مسبقًا",
      });
      throw unauthorized("رمز التحقق غير صحيح أو منتهي الصلاحية.");
    }

    // 4) استهلاك التذكرة ذريًا فور نجاح التحقق (Atomic Single-Use Reservation via SET NX)
    // لا نسمح بالانتقال إلى خطوة إصدار جلسة المستخدم قبل نجاح الاستهلاك الذري.
    // وفي حال وصول طلبين متزامنين بنفس التذكرة والرمز، ينجح طلب واحد فقط ويُرفض الآخر فورًا.
    const ticketReserved = await securityCache.setNX(ticketUsedKey, "1", 600);
    if (!ticketReserved) {
      throw unauthorized("تذكرة المصادقة الثنائية استُخدمت مسبقًا. أعد تسجيل الدخول.");
    }

    // ترقية شفافة: إذا كان السر في قاعدة البيانات لا يزال غير مشفر بالصيغة الحديثة، نشفره ونحدثه الآن
    if (!totpCipher.isEncrypted(user.totpSecret)) {
      try {
        const encryptedSecret = totpCipher.encrypt(plainSecret);
        await prisma.user.update({
          where: { id: user.id },
          data: { totpSecret: encryptedSecret },
        });
      } catch (e) {
        console.warn("[MFA] تعذر ترقية تشفير سر TOTP تلقائيًا:", (e as Error).message);
      }
    }

    await startSession(req, res, user);
    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "LOGIN",
      category: "AUTH",
      result: "SUCCESS",
      reason: "دخول ناجح مع التحقق الثنائي MFA",
    });

    res.json({ data: { user: sanitizeUser(user), message: "تم تسجيل الدخول بنجاح" } });
  }),
);

// ---------- إعداد المصادقة الثنائية (توليد المفتاح ورابط QR) ----------
router.post(
  "/mfa/setup",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("المستخدم غير موجود");

    const setup = totpService.generateSecret(user.email, "Siraj Academy");
    res.json({ data: setup });
  }),
);

// ---------- تفعيل المصادقة الثنائية بعد التحقق من الرمز ----------
router.post(
  "/mfa/enable",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { secret, code } = req.body as { secret?: string; code?: string };
    if (!secret || !code) {
      throw badRequest("مفتاح السر ورمز التحقق مطلوبان لتفعيل المصادقة الثنائية.");
    }

    const valid = totpService.verify(code, secret);
    if (!valid) {
      throw badRequest("رمز التحقق غير صحيح. تأكد من إدخال الرمز الظاهر في تطبيق المصادقة حاليًا.");
    }

    const { plainCodes, hashedCodesJson } = totpService.generateBackupCodes(8);

    // تشفير المفتاح السري باستخدام AES-256-GCM قبل الحفظ في قاعدة البيانات
    const encryptedSecret = totpCipher.encrypt(secret);

    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        totpSecret: encryptedSecret,
        totpEnabled: true,
        totpBackupCodes: hashedCodesJson,
      },
    });

    await audit({
      req,
      userId: req.user!.id,
      actorRole: req.user!.role,
      action: "MFA_ENABLED",
      category: "SECURITY",
      result: "SUCCESS",
    });

    res.json({
      data: {
        enabled: true,
        backupCodes: plainCodes,
        message: "تم تفعيل المصادقة الثنائية (TOTP) بنجاح. احفظ رموز الاسترجاع الاحتياطية في مكان آمن.",
      },
    });
  }),
);

// ---------- إلغاء تفعيل المصادقة الثنائية ----------
router.post(
  "/mfa/disable",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { password, code } = req.body as { password?: string; code?: string };
    if (!password) {
      throw badRequest("كلمة المرور الحالية مطلوبة لإلغاء المصادقة الثنائية.");
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("المستخدم غير موجود");

    const pwOk = await comparePassword(password, user.passwordHash);
    if (!pwOk) {
      throw unauthorized("كلمة المرور الحالية غير صحيحة.");
    }

    if (user.totpEnabled && user.totpSecret && code) {
      const plainSecret = totpCipher.decrypt(user.totpSecret) || user.totpSecret;
      const valid = totpService.verify(code, plainSecret);
      if (!valid) {
        throw badRequest("رمز التحقق الثنائي غير صحيح.");
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: null,
        totpEnabled: false,
        totpBackupCodes: null,
      },
    });

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "MFA_DISABLED",
      category: "SECURITY",
      result: "SUCCESS",
    });

    res.json({ data: { enabled: false, message: "تم إلغاء تفعيل المصادقة الثنائية." } });
  }),
);

// ---------- الخروج ----------
router.post("/logout", (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;

  const done = () => {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    res.json({ data: { message: "تم تسجيل الخروج" } });
  };

  if (payload?.sid) {
    prisma.userSession
      .updateMany({ where: { id: payload.sid, endedAt: null }, data: { endedAt: new Date(), endReason: "تسجيل خروج" } })
      .catch(() => undefined)
      .finally(() => {
        void audit({
          req,
          userId: payload.sub,
          actorRole: payload.role,
          action: "LOGOUT",
          category: "AUTH",
          targetType: "UserSession",
          targetId: payload.sid,
        });
        done();
      });
    return;
  }

  void audit({ req, action: "LOGOUT", category: "AUTH", result: "FAILURE", reason: "جلسة غير صالحة" });
  done();
});

// ---------- بياناتي ----------
router.get(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        teacherProfile: true,
        university: { select: { id: true, name: true, slug: true } },
        major: { select: { id: true, name: true } },
      },
    });
    if (!user) throw notFound("المستخدم غير موجود");

    // آخر نشاط للجلسة الحالية (كل 5 دقائق على الأكثر لتقليل الكتابة)
    const sid = req.tokenPayload?.sid;
    if (sid) {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000);
      void prisma.userSession
        .updateMany({ where: { id: sid, endedAt: null, lastSeenAt: { lt: cutoff } }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }

    // لا نعيد كلمة المرور المشفرة ولا توكن التحقق
    const { passwordHash: _p, emailVerificationToken: _t, ...safeUser } = user;
    res.json({ data: { user: safeUser } });
  }),
);

// ---------- إعدادات التحقق البشري العامة (Google reCAPTCHA Config) ----------
router.get(
  "/captcha-config",
  asyncHandler(async (_req, res) => {
    const isProduction = process.env.NODE_ENV === "production";
    const secSettings = await getSecuritySettings();
    const siteKey = process.env.RECAPTCHA_SITE_KEY || "";
    res.json({
      data: {
        enabled: isProduction || secSettings.recaptchaEnabled,
        siteKey,
        mode: secSettings.recaptchaMode || "v2",
      },
    });
  }),
);

// ---------- فحص توفّر اسم المستخدم مباشرة (أثناء الكتابة في التسجيل) ----------
// عام بلا تسجيل دخول، ولا يكشف أكثر من توفّر الاسم. محمي بمحدد المعدل في app.ts.
router.get(
  "/username-availability",
  asyncHandler(async (req, res) => {
    const raw = typeof req.query.username === "string" ? req.query.username : "";
    const parsed = usernameRule.safeParse(raw);
    if (!parsed.success) {
      return res.json({
        data: {
          username: raw,
          valid: false,
          available: false,
          reason: parsed.error.issues[0]?.message ?? "اسم المستخدم غير صالح",
        },
      });
    }

    // استعلام فوري فائق السرعة يطلب فقط المعرف دون جلب سجل المستخدم كاملاً
    const taken = await prisma.user.findFirst({
      where: { username: { equals: parsed.data, mode: "insensitive" } },
      select: { id: true },
    });

    res.json({
      data: {
        username: parsed.data,
        valid: true,
        available: !taken,
        reason: taken ? "اسم المستخدم مستخدم مسبقًا — اختر اسمًا آخر" : null,
      },
    });
  }),
);

// ---------- توثيق البريد الإلكتروني (زر واحد) ----------
// يرسل رابطًا إلى البريد المسجّل نفسه؛ لا يُقبل بريد بديل ولا رمز يدوي.
router.post(
  "/email/verify-request",
  requireAuth(),
  asyncHandler(async (req, res) => {
    if (req.user!.emailVerified) {
      return res.json({ data: { emailVerified: true, message: "البريد الإلكتروني موثّق بالفعل" } });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, fullName: true },
    });
    if (!user) throw notFound("المستخدم غير موجود");

    let expiresAt: Date;
    try {
      ({ expiresAt } = await requestVerificationLink(user));
    } catch (err) {
      await audit({
        req,
        userId: user.id,
        actorRole: req.user!.role,
        action: "EMAIL_VERIFICATION_REQUESTED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "تم رفض الطلب (حد معدل)",
        targetType: "User",
        targetId: user.id,
      });
      throw err;
    }

    await audit({
      req,
      userId: user.id,
      actorRole: req.user!.role,
      action: "EMAIL_VERIFICATION_REQUESTED",
      category: "SECURITY",
      targetType: "User",
      targetId: user.id,
      // البريد المستهدف معلوم للمستخدم، ولا يُسجَّل الرمز إطلاقًا
      newValues: { email: user.email, expiresAt: expiresAt.toISOString() },
    });

    res.json({
      data: {
        emailVerified: false,
        message: "تم إرسال رابط التوثيق إلى بريدك الإلكتروني. يرجى التحقق من صندوق الوارد أو الرسائل غير المرغوب فيها.",
      },
    });
  }),
);

// مسار قديم للتوافق: نفس السلوك (زر واحد، بريد الحساب نفسه)
router.post(
  "/resend-verification",
  requireAuth(),
  asyncHandler(async (req, res) => {
    if (req.user!.emailVerified) {
      return res.json({ data: { message: "البريد مفعّل مسبقًا" } });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, fullName: true },
    });
    if (!user) throw notFound("المستخدم غير موجود");

    await requestVerificationLink(user);
    await audit({
      req,
      userId: user.id,
      actorRole: req.user!.role,
      action: "EMAIL_VERIFICATION_RESENT",
      category: "SECURITY",
      targetType: "User",
      targetId: user.id,
      newValues: { email: user.email },
    });
    res.json({
      data: { message: "تم إرسال رابط التوثيق إلى بريدك الإلكتروني. يرجى التحقق من صندوق الوارد أو الرسائل غير المرغوب فيها." },
    });
  }),
);

// ---------- تأكيد التوثيق من الرابط ----------
router.post(
  "/verify-email",
  parseBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const invalid = badRequest("رابط التوثيق غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.");
    const record = await findValidToken(req.body.token, "EMAIL_VERIFY");
    if (!record) {
      await audit({
        req,
        action: "EMAIL_VERIFIED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "رابط غير صالح أو منتهي أو مستخدم مسبقًا",
      });
      throw invalid;
    }

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      await consumeToken(record.id);
      throw invalid;
    }

    // لا يُوثَّق إلا البريد المرتبط بالطلب وقت إصداره (يمنع توثيق عنوان آخر)
    if (!record.newEmail || record.newEmail.toLowerCase() !== user.email.toLowerCase()) {
      await consumeToken(record.id);
      await audit({
        req,
        userId: user.id,
        actorRole: user.role,
        action: "EMAIL_VERIFIED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "البريد المرتبط بالطلب لا يطابق بريد الحساب",
        targetType: "User",
        targetId: user.id,
      });
      throw invalid;
    }

    if (user.emailVerified) {
      await consumeToken(record.id);
      return res.json({ data: { emailVerified: true, message: "البريد الإلكتروني موثّق بالفعل" } });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true,  emailVerificationToken: null },
    });
    // استخدام مرة واحدة: يُستهلك الرمز وتُلغى بقية رموز التوثيق
    await consumeToken(record.id);
    await revokeTokens(user.id, "EMAIL_VERIFY");

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "EMAIL_VERIFIED",
      category: "SECURITY",
      targetType: "User",
      targetId: user.id,
      newValues: { email: user.email, verified: true },
    });

    res.json({ data: { emailVerified: true, message: "تم تفعيل البريد الإلكتروني بنجاح" } });
  }),
);

// ============================================================
// استعادة كلمة المرور
// ============================================================

// طلب رابط الاستعادة — الاستجابة عامة دائمًا (لا تكشف وجود البريد)
router.post(
  "/forgot-password",
  requireCaptcha("FORGOT_PASSWORD"),
  parseBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const email = req.body.email as string;
    const generic = {
      data: {
        message: "إذا كان البريد مسجلًا في المنصة فسيصلك رابط لإعادة تعيين كلمة المرور خلال دقائق. تحقق أيضًا من مجلد الرسائل غير المرغوبة.",
      },
    };

    const user = await findByEmail(email);
    if (!user) {
      await audit({
        req,
        action: "PASSWORD_RESET_REQUEST",
        category: "SECURITY",
        result: "FAILURE",
        reason: "بريد غير مسجل (لم يُرسل رابط)",
      });
      return res.json(generic);
    }

    const { raw, expiresAt } = await issueToken(user.id, "PASSWORD_RESET");
    const link = `${APP_BASE_URL}/reset-password?token=${raw}`;

    const mail = await sendMail({
      to: user.email,
      subject: "إعادة تعيين كلمة المرور — أكاديمية سراج",
      text:
        `مرحبًا ${user.fullName}،\n\n` +
        `طلبنا إعادة تعيين كلمة المرور لحسابك. الرابط صالح لمدة 30 دقيقة ويُستخدم مرة واحدة فقط:\n${link}\n\n` +
        `إن لم تطلب ذلك فتجاهل الرسالة؛ لن يتغير شيء في حسابك. لا تشارك هذا الرابط مع أي شخص.`,
      type: "GENERAL",
    });

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "PASSWORD_RESET_REQUEST",
      category: "SECURITY",
      targetType: "User",
      targetId: user.id,
      result: "SUCCESS",
      // الرمز وكلمة المرور لا يُسجَّلان إطلاقًا
      newValues: { expiresAt: expiresAt.toISOString(), delivery: mail.delivered ? "SENT" : mail.simulated ? "SIMULATED" : "FAILED" },
    });

    res.json(generic);
  }),
);

// تعيين كلمة مرور جديدة عبر رمز لمرة واحدة
router.post(
  "/reset-password",
  parseBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };

    const record = await findValidToken(token, "PASSWORD_RESET");
    if (!record) {
      await audit({
        req,
        action: "PASSWORD_RESET_COMPLETED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "رابط غير صالح أو منتهي أو مستخدم مسبقًا",
      });
      throw badRequest("رابط الاستعادة غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.");
    }

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      await audit({
        req,
        action: "PASSWORD_RESET_COMPLETED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "المستخدم غير موجود",
      });
      throw badRequest("رابط الاستعادة غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
    });
    // استهلاك الرمز وإبطال كل الرموز الأخرى + إنهاء كل الجلسات القائمة
    await consumeToken(record.id);
    await revokeTokens(user.id, "PASSWORD_RESET");
    await prisma.userSession.updateMany({
      where: { userId: user.id, endedAt: null },
      data: { endedAt: new Date(), endReason: "تغيير كلمة المرور عبر الاستعادة" },
    });

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "PASSWORD_RESET_COMPLETED",
      category: "SECURITY",
      targetType: "User",
      targetId: user.id,
      newValues: { method: "رابط الاستعادة", sessionsRevoked: true },
    });

    await sendSecurityNotice(
      user.email,
      "تم تغيير كلمة المرور — أكاديمية سراج",
      `مرحبًا ${user.fullName}،\n\nتم تعيين كلمة مرور جديدة لحسابك عبر رابط الاستعادة، وأُنهيت كل الجلسات السابقة.\nإذا لم تكن أنت من قام بذلك، تواصل مع الإدارة فورًا.`,
    );

    res.json({ data: { message: "تم تعيين كلمة المرور الجديدة. يمكنك تسجيل الدخول الآن." } });
  }),
);

// تأكيد تغيير البريد من رابط التحقق المرسل للبريد الجديد
router.post(
  "/email-change/confirm",
  parseBody(confirmEmailChangeSchema),
  asyncHandler(async (req, res) => {
    const record = await findValidToken(req.body.token, "EMAIL_CHANGE");
    if (!record || !record.newEmail) {
      await audit({
        req,
        action: "EMAIL_CHANGE_CONFIRMED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "رابط غير صالح أو منتهي أو مستخدم مسبقًا",
      });
      throw badRequest("رابط تأكيد البريد غير صالح أو منتهي الصلاحية. اطلب تغييرًا جديدًا.");
    }

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      await audit({
        req,
        action: "EMAIL_CHANGE_CONFIRMED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "المستخدم غير موجود",
      });
      throw badRequest("رابط تأكيد البريد غير صالح أو منتهي الصلاحية.");
    }

    const newEmail = record.newEmail.toLowerCase();
    // قد يكون البريد حُجز من حساب آخر بعد إصدار الرابط
    const taken = await prisma.user.findFirst({
      where: { email: { equals: newEmail, mode: "insensitive" }, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) {
      await consumeToken(record.id);
      await audit({
        req,
        userId: user.id,
        actorRole: user.role,
        action: "EMAIL_CHANGE_CONFIRMED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "البريد الجديد مستخدم من حساب آخر",
        targetType: "User",
        targetId: user.id,
      });
      throw conflict("البريد الإلكتروني الجديد مستخدم من حساب آخر");
    }

    const oldEmail = user.email;
    await prisma.user.update({
      where: { id: user.id },
      // البريد الجديد يُعتمد فقط بعد إتمام التحقق من رابطه
      data: { email: newEmail, pendingEmail: null, emailVerified: true, sessionVersion: { increment: 1 } },
    });
    await consumeToken(record.id);
    await revokeTokens(user.id, "EMAIL_CHANGE");
    await prisma.userSession.updateMany({
      where: { userId: user.id, endedAt: null },
      data: { endedAt: new Date(), endReason: "تغيير البريد الإلكتروني" },
    });

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "EMAIL_CHANGE_CONFIRMED",
      category: "SECURITY",
      targetType: "User",
      targetId: user.id,
      oldValues: { email: oldEmail },
      newValues: { email: newEmail, verified: true },
    });

    // إشعار أمني للبريد الجديد والقديم (بدون أي بيانات حساسة)
    await sendSecurityNotice(
      newEmail,
      "تم تأكيد بريدك الإلكتروني — أكاديمية سراج",
      `تم ربط هذا البريد بحسابك في أكاديمية سراج بنجاح. التغيير السابق: ${oldEmail}.`,
    );
    await sendSecurityNotice(
      oldEmail,
      "تم تغيير بريد حسابك — أكاديمية سراج",
      `مرحبًا ${user.fullName}،\n\nتم تغيير البريد الإلكتروني لحسابك إلى ${newEmail} بعد التحقق منه، وأُنهيت جلساتك السابقة.\nإذا لم تكن أنت من قام بذلك، تواصل مع الإدارة فورًا.`,
    );

    res.json({ data: { message: "تم تأكيد بريدك الإلكتروني الجديد. سجّل الدخول من جديد بالبريد الجديد." } });
  }),
);

// ---------- بيانات الجلسات (لصاحب الحساب فقط) — تُستخدم من صفحة الإعدادات ----------
router.get(
  "/sessions",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const sessions = await prisma.userSession.findMany({
      where: { userId: req.user!.id },
      orderBy: { lastSeenAt: "desc" },
      take: 30,
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        endedAt: true,
        endReason: true,
        userAgent: true,
        ip: true,
      },
    });
    res.json({
      data: sessions,
      meta: { currentSessionId: req.tokenPayload?.sid ?? null },
    });
  }),
);

export default router;
