import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { hashPassword, comparePassword } from "../lib/password";
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from "../lib/jwt";
import { sendMail } from "../lib/mail";
import { triggerUsersExcelSync } from "../lib/excelUsers";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { audit } from "../lib/audit";
import { appBaseUrl, issueToken, revokeTokens } from "../lib/authTokens";
import { multerSingle, uploadAvatar, UPLOAD_ROOT } from "../middleware/upload";
import {
  changeEmailSchema,
  updateProfileSchema,
  updateUsernameSchema,
  changePasswordSchema,
} from "../validation/account";
import { Role } from "@prisma/client";

const router = Router();
const APP_BASE_URL = appBaseUrl();

// كل مسارات المستخدمين تتطلب جلسة صالحة
router.use(requireAuth());

/** شكل المستخدم الآمن (لا كلمة مرور ولا رموز) */
function safeUser<T extends object>(user: T): Omit<T, "passwordHash" | "emailVerificationToken"> {
  const clone: Record<string, unknown> = { ...(user as Record<string, unknown>) };
  delete clone.passwordHash;
  delete clone.emailVerificationToken;
  return clone as Omit<T, "passwordHash" | "emailVerificationToken">;
}

function cookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function byUsernameInsensitive(username: string) {
  return prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
}

function byEmailInsensitive(email: string, ignoreUserId?: string) {
  return prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(ignoreUserId ? { id: { not: ignoreUserId } } : {}),
    },
  });
}

async function sendSecurityNotice(to: string, subject: string, text: string): Promise<void> {
  try {
    await sendMail({ to, subject, text, type: "GENERAL" });
  } catch (err) {
    console.warn("[USERS] تعذر إرسال الإشعار الأمني:", (err as Error)?.name);
  }
}

/** يجلب ملف المستخدم الحالي كاملًا (للمالك فقط) */
router.get(
  "/me",
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

    const [requestsCount, customRequestsCount, enrollmentsCount] = await Promise.all([
      prisma.explainRequest.count({ where: { studentId: user.id } }),
      prisma.customServiceRequest.count({ where: { userId: user.id } }),
      prisma.enrollment.count({ where: { userId: user.id } }),
    ]);

    res.json({
      data: {
        user: safeUser(user),
        stats: {
          explainRequests: requestsCount,
          customRequests: customRequestsCount,
          enrollments: enrollmentsCount,
        },
      },
    });
  }),
);

// ---------- تحديث البيانات الأساسية (الاسم، الجوال، الجامعة، التخصص، المستوى) ----------
const updateProfile = asyncHandler(async (req, res) => {
  const data = req.body as {
    fullName?: string;
    whatsapp?: string | null;
    universityId?: string | null;
    majorId?: string | null;
    level?: string | null;
  };

  const current = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, fullName: true, whatsapp: true, universityId: true, majorId: true, level: true },
  });
  if (!current) throw notFound("المستخدم غير موجود");

  const updated = await prisma.user.update({
    where: { id: current.id },
    data: {
      ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
      ...(data.whatsapp !== undefined ? { whatsapp: data.whatsapp } : {}),
      // التخصص يتبع الجامعة: تحديث الجامعة يعيد ضبط التخصص معها
      ...(data.universityId !== undefined
        ? { universityId: data.universityId, majorId: data.majorId ?? null }
        : data.majorId !== undefined
          ? { majorId: data.majorId }
          : {}),
      ...(data.level !== undefined ? { level: data.level } : {}),
    },
    select: { id: true, fullName: true, whatsapp: true, universityId: true, majorId: true, level: true },
  });

  await audit({
    req,
    userId: current.id,
    actorRole: req.user!.role,
    action: data.fullName !== undefined && data.fullName !== current.fullName ? "PROFILE_NAME_UPDATE" : "PROFILE_UPDATE",
    category: "ACCOUNT",
    targetType: "User",
    targetId: current.id,
    oldValues: {
      fullName: current.fullName,
      whatsapp: current.whatsapp,
      universityId: current.universityId,
      majorId: current.majorId,
      level: current.level,
    },
    newValues: {
      fullName: updated.fullName,
      whatsapp: updated.whatsapp,
      universityId: updated.universityId,
      majorId: updated.majorId,
      level: updated.level,
    },
  });

  triggerUsersExcelSync();
  res.json({ data: safeUser(updated), message: "تم حفظ التعديلات" });
});

router.patch("/me", parseBody(updateProfileSchema), updateProfile);

/** المسار القديم يبقى للتوافق، لكنه مقيّد بصاحب الحساب فقط ولا يغيّر كلمة المرور */
router.patch(
  "/:id",
  parseBody(updateProfileSchema),
  asyncHandler(async (req, res, next) => {
    if (req.params.id !== req.user!.id) {
      await audit({
        req,
        userId: req.user!.id,
        actorRole: req.user!.role,
        action: "PROFILE_UPDATE_OTHER_DENIED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "محاولة تعديل حساب مستخدم آخر",
        targetType: "User",
        targetId: req.params.id,
      });
      throw forbidden("لا يمكنك تعديل بيانات حساب آخر");
    }
    return updateProfile(req, res, next);
  }),
);

// ---------- تغيير اسم المستخدم (فريد دون حساسية لحالة الأحرف) ----------
router.patch(
  "/me/username",
  parseBody(updateUsernameSchema),
  asyncHandler(async (req, res) => {
    const newUsername = (req.body as { username: string }).username;
    const current = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, username: true, role: true },
    });
    if (!current) throw notFound("المستخدم غير موجود");

    if (newUsername.toLowerCase() === current.username.toLowerCase()) {
      return res.json({ data: { username: current.username }, message: "اسم المستخدم لم يتغير" });
    }

    const taken = await byUsernameInsensitive(newUsername);
    if (taken) {
      await audit({
        req,
        userId: current.id,
        actorRole: current.role,
        action: "USERNAME_CHANGE",
        category: "ACCOUNT",
        result: "FAILURE",
        reason: "اسم المستخدم مستخدم مسبقًا",
        targetType: "User",
        targetId: current.id,
        oldValues: { username: current.username },
        newValues: { username: newUsername },
      });
      throw conflict("اسم المستخدم مستخدم مسبقًا — اختر اسمًا آخر");
    }

    try {
      await prisma.user.update({ where: { id: current.id }, data: { username: newUsername } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        await audit({
          req,
          userId: current.id,
          actorRole: current.role,
          action: "USERNAME_CHANGE",
          category: "ACCOUNT",
          result: "FAILURE",
          reason: "اسم المستخدم مستخدم مسبقًا (قيد قاعدة البيانات)",
          targetType: "User",
          targetId: current.id,
          oldValues: { username: current.username },
          newValues: { username: newUsername },
        });
        throw conflict("اسم المستخدم مستخدم مسبقًا — اختر اسمًا آخر");
      }
      throw err;
    }

    await audit({
      req,
      userId: current.id,
      actorRole: current.role,
      action: "USERNAME_CHANGE",
      category: "ACCOUNT",
      targetType: "User",
      targetId: current.id,
      oldValues: { username: current.username },
      newValues: { username: newUsername, uniquenessChecked: true },
    });

    triggerUsersExcelSync();
    res.json({ data: { username: newUsername }, message: "تم تحديث اسم المستخدم" });
  }),
);

// ---------- طلب تغيير البريد الإلكتروني (يتطلب كلمة المرور الحالية + تحقق من البريد الجديد) ----------
router.patch(
  "/me/email",
  parseBody(changeEmailSchema),
  asyncHandler(async (req, res) => {
    const { newEmail, currentPassword } = req.body as { newEmail: string; currentPassword: string };

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("المستخدم غير موجود");

    if (!(await comparePassword(currentPassword, user.passwordHash))) {
      await audit({
        req,
        userId: user.id,
        actorRole: user.role,
        action: "EMAIL_CHANGE_REQUESTED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "كلمة المرور الحالية غير صحيحة",
        targetType: "User",
        targetId: user.id,
      });
      throw unauthorized("كلمة المرور الحالية غير صحيحة");
    }

    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      throw badRequest("البريد الجديد مطابق لبريدك الحالي");
    }

    const taken = await byEmailInsensitive(newEmail, user.id);
    if (taken) {
      await audit({
        req,
        userId: user.id,
        actorRole: user.role,
        action: "EMAIL_CHANGE_REQUESTED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "البريد الجديد مستخدم مسبقًا",
        targetType: "User",
        targetId: user.id,
        oldValues: { email: user.email },
        newValues: { email: newEmail },
      });
      throw conflict("البريد الإلكتروني مستخدم مسبقًا");
    }

    // البريد الجديد لا يُعتمد الآن — فقط يُحفظ كطلب معلّق حتى تأكيد الرابط
    await prisma.user.update({ where: { id: user.id }, data: { pendingEmail: newEmail } });
    const { raw, expiresAt } = await issueToken(user.id, "EMAIL_CHANGE", { newEmail });

    const link = `${APP_BASE_URL}/confirm-email-change?token=${raw}`;
    const mail = await sendMail({
      to: newEmail,
      subject: "تأكيد بريدك الإلكتروني الجديد — أكاديمية سراج",
      text:
        `مرحبًا ${user.fullName}،\n\n` +
        `طلبنا تغيير بريد حسابك إلى هذا العنوان. أكّد الرابط خلال 30 دقيقة (يُستخدم مرة واحدة):\n${link}\n\n` +
        `إن لم تطلب ذلك فتجاهل الرسالة، وسيبقى بريدك الحالي كما هو.`,
      type: "GENERAL",
    });

    // إشعار أمني للبريد القديم دون أي بيانات حساسة
    await sendSecurityNotice(
      user.email,
      "طلب تغيير بريد حسابك — أكاديمية سراج",
      `مرحبًا ${user.fullName}،\n\nورد طلب لتغيير بريد حسابك إلى ${newEmail}. لن يتغير البريد إلا بعد تأكيد الرابط المرسل إلى العنوان الجديد.\nإذا لم تكن أنت من طلبه، غيّر كلمة مرورك وتواصل مع الإدارة.`,
    );

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "EMAIL_CHANGE_REQUESTED",
      category: "SECURITY",
      targetType: "User",
      targetId: user.id,
      oldValues: { email: user.email },
      newValues: {
        pendingEmail: newEmail,
        expiresAt: expiresAt.toISOString(),
        delivery: mail.delivered ? "SENT" : mail.simulated ? "SIMULATED" : "FAILED",
        verified: false,
      },
    });

    res.json({
      data: {
        pendingEmail: newEmail,
        message: "أرسلنا رابط تأكيد إلى البريد الجديد. لن يتغير بريدك إلا بعد فتح الرابط خلال 30 دقيقة.",
      },
    });
  }),
);

// ---------- تغيير كلمة المرور (يتطلب الحالية، ويُبطل الجلسات الأخرى) ----------
router.post(
  "/me/password",
  parseBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("المستخدم غير موجود");

    if (!(await comparePassword(currentPassword, user.passwordHash))) {
      await audit({
        req,
        userId: user.id,
        actorRole: user.role,
        action: "PASSWORD_CHANGE",
        category: "SECURITY",
        result: "FAILURE",
        reason: "كلمة المرور الحالية غير صحيحة",
        targetType: "User",
        targetId: user.id,
      });
      throw unauthorized("كلمة المرور الحالية غير صحيحة");
    }

    const newHash = await hashPassword(newPassword);
    const currentSid = req.tokenPayload?.sid ?? null;
    const nextVersion = user.sessionVersion + 1;

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, sessionVersion: nextVersion },
    });
    await revokeTokens(user.id, "PASSWORD_RESET");
    // إلغاء كل الجلسات الأخرى، مع إبقاء الجلسة الحالية عبر إصدار رمز جديد
    await prisma.userSession.updateMany({
      where: { userId: user.id, endedAt: null, ...(currentSid ? { id: { not: currentSid } } : {}) },
      data: { endedAt: new Date(), endReason: "تغيير كلمة المرور" },
    });

    res.cookie(COOKIE_NAME, signToken(user.id, user.role, { sid: currentSid ?? undefined, sv: nextVersion }), cookieOptions());

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "PASSWORD_CHANGE",
      category: "SECURITY",
      targetType: "User",
      targetId: user.id,
      // لا تُسجَّل كلمة المرور القديمة أو الجديدة — فقط وقوع التغيير وطريقته
      newValues: { method: "إعدادات الحساب", otherSessionsRevoked: true, changedAt: new Date().toISOString() },
    });

    await sendSecurityNotice(
      user.email,
      "تم تغيير كلمة مرور حسابك — أكاديمية سراج",
      `مرحبًا ${user.fullName}،\n\nتم تغيير كلمة المرور من صفحة إعدادات الحساب، وأُنهيت الجلسات الأخرى. إذا لم تكن أنت من قام بذلك، تواصل مع الإدارة فورًا.`,
    );

    res.json({ data: { message: "تم تغيير كلمة المرور، وأُنهيت الجلسات الأخرى." } });
  }),
);

// ---------- صورة الملف الشخصي ----------
function removeAvatarFile(avatarUrl: string | null | undefined, userId: string): void {
  if (!avatarUrl) return;
  const prefix = "/uploads/";
  if (!avatarUrl.startsWith(prefix)) return;
  const name = path.basename(avatarUrl.slice(prefix.length));
  // الأمان: لا يُحذف إلا ملف يحمل بادئة معرّف المستخدم وداخل مجلد الرفع
  if (!name.startsWith(`${userId}-`)) return;
  const absolute = path.resolve(UPLOAD_ROOT, name);
  if (!absolute.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return;
  try {
    fs.unlinkSync(absolute);
  } catch {
    /* الملف قد يكون محذوفًا مسبقًا */
  }
}

router.post(
  "/me/avatar",
  multerSingle("avatar", uploadAvatar, "3 ميجابايت"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("أرفق صورة في الحقل avatar");

    const userId = req.user!.id;
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    const avatarUrl = `/uploads/${req.file.filename}`;

    await prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    removeAvatarFile(before?.avatarUrl, userId);

    await audit({
      req,
      userId,
      actorRole: req.user!.role,
      action: "AVATAR_UPLOAD",
      category: "ACCOUNT",
      targetType: "User",
      targetId: userId,
      oldValues: { avatarUrl: before?.avatarUrl ?? null },
      newValues: { avatarUrl, mimetype: req.file.mimetype, size: req.file.size },
    });

    res.status(201).json({ data: { avatarUrl }, message: "تم تحديث الصورة الشخصية" });
  }),
);

router.delete(
  "/me/avatar",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    removeAvatarFile(before?.avatarUrl, userId);

    await audit({
      req,
      userId,
      actorRole: req.user!.role,
      action: "AVATAR_REMOVE",
      category: "ACCOUNT",
      targetType: "User",
      targetId: userId,
      oldValues: { avatarUrl: before?.avatarUrl ?? null },
      newValues: { avatarUrl: null },
    });

    res.json({ data: { avatarUrl: null }, message: "تمت إزالة الصورة والعودة للصورة الافتراضية" });
  }),
);

// ---------- سجل الأجهزة والجلسات ----------
router.get(
  "/me/sessions",
  asyncHandler(async (req, res) => {
    const sessions = await prisma.userSession.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ endedAt: "asc" }, { lastSeenAt: "desc" }],
      take: 40,
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true, endedAt: true, endReason: true },
    });
    res.json({
      data: sessions,
      meta: {
        currentSessionId: req.tokenPayload?.sid ?? null,
      },
    });
  }),
);

// تسجيل الخروج من كل الأجهزة (يُنهي الجلسة الحالية أيضًا)
router.post(
  "/me/sessions/logout-all",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    const ended = await prisma.userSession.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: new Date(), endReason: "تسجيل خروج من جميع الأجهزة" },
    });
    res.clearCookie(COOKIE_NAME, { path: "/" });

    await audit({
      req,
      userId,
      actorRole: req.user!.role,
      action: "LOGOUT_ALL_DEVICES",
      category: "SECURITY",
      targetType: "User",
      targetId: userId,
      newValues: { endedSessions: ended.count },
    });

    res.json({ data: { message: "تم تسجيل الخروج من جميع الأجهزة. سجّل الدخول من جديد." } });
  }),
);

// إلغاء جلسة محددة (لصاحبها فقط)
router.delete(
  "/me/sessions/:id",
  asyncHandler(async (req, res) => {
    const session = await prisma.userSession.findUnique({ where: { id: req.params.id } });
    if (!session || session.userId !== req.user!.id) throw notFound("الجلسة غير موجودة");

    await prisma.userSession.updateMany({
      where: { id: session.id, endedAt: null },
      data: { endedAt: new Date(), endReason: "إلغاء يدوي من صاحب الحساب" },
    });

    await audit({
      req,
      userId: req.user!.id,
      actorRole: req.user!.role,
      action: "SESSION_REVOKED",
      category: "SECURITY",
      targetType: "UserSession",
      targetId: session.id,
    });

    res.json({ data: { message: "تم إنهاء الجلسة المحددة" } });
  }),
);

// ---------- قراءة ملف شخص (بيانات عامة فقط) ----------
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { university: { select: { name: true } }, major: { select: { name: true } } },
    });
    if (!user) throw notFound("المستخدم غير موجود");
    const isSelf = req.user!.id === user.id;
    const isAdmin = req.user!.role === Role.ADMIN;

    if (!isSelf && !isAdmin) {
      return res.json({
        data: {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          role: user.role,
          avatarUrl: user.avatarUrl,
          university: user.university,
        },
      });
    }

    const [requestsCount, customRequestsCount, enrollmentsCount] = await Promise.all([
      prisma.explainRequest.count({ where: { studentId: user.id } }),
      prisma.customServiceRequest.count({ where: { userId: user.id } }),
      prisma.enrollment.count({ where: { userId: user.id } }),
    ]);

    res.json({
      data: {
        ...safeUser(user),
        stats: { explainRequests: requestsCount, customRequests: customRequestsCount, enrollments: enrollmentsCount },
      },
    });
  }),
);

export default router;
