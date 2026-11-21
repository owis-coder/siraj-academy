// ============================================================
// خدمة استعادة الحسابات وإدارتها — منطق الأمان والمعاملات الذرية
// Account Management & Recovery Service (Dual-Admin Approval & Atomic Reset)
// ============================================================
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { appBaseUrl, hashToken } from "./authTokens";
import { sendMail } from "./mail";
import { audit } from "./audit";
import { badRequest, forbidden, notFound } from "./errors";
import {
  buildAdminPasswordRecoveryEmail,
  buildAlternativeEmailVerificationEmail,
  buildRecoveryCompletedEmail,
  buildOldEmailRecoverySecurityAlert,
  buildAccountSuspensionEmail,
  buildAccountReactivationEmail,
} from "./recoveryEmails";
import type { RecoveryVerificationMethod } from "@prisma/client";

export const RECOVERY_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 دقيقة

export interface UserRiskAssessment {
  isHighRisk: boolean;
  reasons: string[];
}

/**
 * تقييم مستوى خطورة الحساب لتحديد ضرورة الاعتماد المزدوج (Dual-Admin Approval)
 */
export async function assessUserRisk(userId: string): Promise<UserRiskAssessment> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      teacherProfile: {
        include: {
          offerings: { select: { id: true } },
          services: { select: { id: true } },
        },
      },
      orders: {
        where: { status: "PAID" },
        select: { id: true },
      },
    },
  });

  if (!user) {
    throw notFound("المستخدم غير موجود");
  }

  const reasons: string[] = [];

  // 1. حسابات المشرفين دائمًا عالية الخطورة
  if (user.role === "ADMIN") {
    reasons.push("الحساب يحمل صلاحية مدير نظام (ADMIN)");
  }

  // 2. حسابات المدرسين التي لديها مقررات أو خدمات أو طلبات نشطة
  if (user.role === "TEACHER" && user.teacherProfile) {
    const offeringCount = user.teacherProfile.offerings?.length || 0;
    const serviceCount = user.teacherProfile.services?.length || 0;
    if (offeringCount > 0 || serviceCount > 0) {
      reasons.push(`حساب مدرس نشط يمتلك ${offeringCount} مقرراً و ${serviceCount} خدمة`);
    }
  }

  // 3. الحسابات المعلقة
  if (user.status === "SUSPENDED") {
    reasons.push("الحساب موقوف إداريًا مسبقًا");
  }

  // 4. الحسابات التي عُدلت حديثًا خلال آخر 48 ساعة
  const hoursSinceUpdate = (Date.now() - user.updatedAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceUpdate < 48 && user.updatedAt.getTime() !== user.createdAt.getTime()) {
    reasons.push("تم تعديل إعدادات الحساب خلال الـ 48 ساعة الماضية");
  }

  return {
    isHighRisk: reasons.length > 0,
    reasons,
  };
}

/**
 * توليد رقم تتابعي مرجعي لطلبات الاستعادة بصيغة REC-YYYY-XXXXXX
 */
async function generateRecoveryNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.accountRecoveryRequest.count();
  const seq = String(count + 1).padStart(6, "0");
  return `REC-${year}-${seq}`;
}

export interface CreateAlternativeRecoveryInput {
  initiatorAdmin: { id: string; fullName: string; email: string };
  targetUserId: string;
  alternativeEmail: string;
  reason: string;
  verificationMethod: RecoveryVerificationMethod;
  verificationNotes?: string;
  evidenceRef?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * إنشاء طلب استعادة حساب بالبريد البديل
 */
export async function createAlternativeRecoveryRequest(input: CreateAlternativeRecoveryInput) {
  const {
    initiatorAdmin,
    targetUserId,
    alternativeEmail: rawAltEmail,
    reason,
    verificationMethod,
    verificationNotes,
    evidenceRef,
    ip,
    userAgent,
  } = input;

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!targetUser) {
    throw notFound("المستخدم المستهدف غير موجود");
  }

  const alternativeEmail = rawAltEmail.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(alternativeEmail)) {
    throw badRequest("صيغة البريد الإلكتروني البديل غير صحيحة");
  }

  if (alternativeEmail === targetUser.email.toLowerCase()) {
    throw badRequest("البريد البديل لا يمكن أن يتطابق مع البريد الأصلي للحساب");
  }

  // التحقق من عدم استخدام البريد البديل في حساب نشط آخر
  const existingUserWithEmail = await prisma.user.findFirst({
    where: { email: alternativeEmail, id: { not: targetUserId } },
  });
  if (existingUserWithEmail) {
    throw badRequest("البريد البديل مسجل بالفعل لحساب آخر في المنصة");
  }

  // تقييم المخاطر
  const risk = await assessUserRisk(targetUserId);
  const isHighRisk = risk.isHighRisk;
  const approvalRequired = isHighRisk; // الحسابات عالية الخطورة تتطلب اعتمادًا مزدوجًا إلزاميًا

  const recoveryNo = await generateRecoveryNumber();

  // إلغاء أي طلبات استعادة سابقة معلقة لنفس الحساب
  await prisma.accountRecoveryRequest.updateMany({
    where: {
      userId: targetUserId,
      status: { in: ["PENDING_APPROVAL", "APPROVED", "VERIFICATION_SENT"] },
    },
    data: { status: "CANCELLED" },
  });

  let tokenHash: string | null = null;
  let tokenExpiresAt: Date | null = null;
  let initialStatus: "PENDING_APPROVAL" | "VERIFICATION_SENT" = "PENDING_APPROVAL";
  let generatedRawToken: string | null = null;

  // إذا لم يكن عالي الخطورة ولم يتطلب اعتمادًا مزدوجًا، يتم إصدار رمز التحقق فورًا
  if (!approvalRequired) {
    generatedRawToken = crypto.randomBytes(32).toString("hex");
    tokenHash = hashToken(generatedRawToken);
    tokenExpiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MS);
    initialStatus = "VERIFICATION_SENT";
  }

  const recoveryRequest = await prisma.accountRecoveryRequest.create({
    data: {
      recoveryNo,
      userId: targetUserId,
      originalEmail: targetUser.email,
      alternativeEmail,
      reason,
      verificationMethod,
      verificationNotes: verificationNotes || null,
      evidenceRef: evidenceRef || null,
      isHighRisk,
      approvalRequired,
      status: initialStatus,
      tokenHash,
      tokenExpiresAt,
      initiatorId: initiatorAdmin.id,
      ipAddress: ip || null,
      userAgent: userAgent || null,
    },
  });

  // تسجيل العملية في سجل التدقيق
  await prisma.auditLog.create({
    data: {
      userId: initiatorAdmin.id,
      actorRole: "ADMIN",
      action: "ALTERNATIVE_RECOVERY_CREATED",
      category: "ACCOUNT_RECOVERY",
      result: "SUCCESS",
      targetType: "User",
      targetId: targetUserId,
      ip: ip || null,
      userAgent: userAgent || null,
      oldValues: { email: targetUser.email },
      newValues: {
        recoveryNo,
        alternativeEmail,
        isHighRisk,
        approvalRequired,
        verificationMethod,
        evidenceRef: evidenceRef || null,
      },
    },
  });

  // إذا كان جاهزًا للإرسال فورًا (حساب منخفض الخطورة)
  if (generatedRawToken && tokenExpiresAt) {
    const verifyUrl = `${appBaseUrl()}/recovery/verify?token=${generatedRawToken}`;
    const mail = buildAlternativeEmailVerificationEmail({
      fullName: targetUser.fullName,
      recoveryNo,
      verifyUrl,
      expiresMinutes: 30,
    });

    void sendMail({
      to: alternativeEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      type: "GENERAL",
      metadata: { recoveryNo, userId: targetUserId },
    });
  }

  return {
    recoveryRequest,
    risk,
    verificationSentDirectly: !approvalRequired,
  };
}

export interface ReviewRecoveryRequestInput {
  reviewerAdmin: { id: string; fullName: string; email: string };
  requestId: string;
  decision: "APPROVED" | "REJECTED";
  notes?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * مراجعة واعتماد طلب استعادة الحساب بواسطة مشرف ثانٍ (Dual-Admin Approval)
 */
export async function reviewRecoveryRequest(input: ReviewRecoveryRequestInput) {
  const { reviewerAdmin, requestId, decision, notes, ip, userAgent } = input;

  const request = await prisma.accountRecoveryRequest.findUnique({
    where: { id: requestId },
    include: {
      user: true,
      initiator: { select: { id: true, fullName: true, email: true } },
    },
  });

  if (!request) {
    throw notFound("طلب الاستعادة غير موجود");
  }

  if (request.status !== "PENDING_APPROVAL") {
    throw badRequest(`لا يمكن مراجعة الطلب لأن حالته الحالية هي: ${request.status}`);
  }

  // قاعدة أمان حرجة: المشرف الذي أنشأ الطلب لا يمكنه اعتماده ذاتيًا!
  if (request.initiatorId === reviewerAdmin.id) {
    throw forbidden("مخالفة أمنية للاعتماد المزدوج: لا يمكن للمشرف الذي أنشأ الطلب أن يعتمده بنفسه.");
  }

  if (decision === "REJECTED") {
    const updated = await prisma.$transaction(async (tx) => {
      const rec = await tx.accountRecoveryRequest.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          reviewerId: reviewerAdmin.id,
          reviewedAt: new Date(),
          reviewNotes: notes || "تم رفض الطلب بواسطة المشرف المعتمد",
        },
      });

      await tx.accountRecoveryApproval.create({
        data: {
          requestId,
          adminId: reviewerAdmin.id,
          decision: "REJECTED",
          notes: notes || null,
        },
      });

      return rec;
    });

    await prisma.auditLog.create({
      data: {
        userId: reviewerAdmin.id,
        actorRole: "ADMIN",
        action: "ALTERNATIVE_RECOVERY_REJECTED",
        category: "ACCOUNT_RECOVERY",
        result: "SUCCESS",
        targetType: "AccountRecoveryRequest",
        targetId: requestId,
        ip: ip || null,
        userAgent: userAgent || null,
        newValues: { reviewerNotes: notes || null },
      },
    });

    return { request: updated, decision: "REJECTED" };
  }

  // في حال الموافقة: توليد رمز التوثيق وإرسال رابط التفعيل إلى البريد البديل
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const tokenExpiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MS);

  const updated = await prisma.$transaction(async (tx) => {
    const rec = await tx.accountRecoveryRequest.update({
      where: { id: requestId },
      data: {
        status: "VERIFICATION_SENT",
        reviewerId: reviewerAdmin.id,
        reviewedAt: new Date(),
        reviewNotes: notes || "تم اعتماد الطلب وإرسال رابط التحقق",
        tokenHash,
        tokenExpiresAt,
      },
    });

    await tx.accountRecoveryApproval.create({
      data: {
        requestId,
        adminId: reviewerAdmin.id,
        decision: "APPROVED",
        notes: notes || null,
      },
    });

    return rec;
  });

  // تسجيل التدقيق
  await prisma.auditLog.create({
    data: {
      userId: reviewerAdmin.id,
      actorRole: "ADMIN",
      action: "ALTERNATIVE_RECOVERY_APPROVED",
      category: "ACCOUNT_RECOVERY",
      result: "SUCCESS",
      targetType: "AccountRecoveryRequest",
      targetId: requestId,
      ip: ip || null,
      userAgent: userAgent || null,
      newValues: { reviewerNotes: notes || null, tokenExpiresAt },
    },
  });

  // إرسال رابط التفعيل إلى البريد البديل
  const verifyUrl = `${appBaseUrl()}/recovery/verify?token=${rawToken}`;
  const mail = buildAlternativeEmailVerificationEmail({
    fullName: request.user.fullName,
    recoveryNo: request.recoveryNo,
    verifyUrl,
    expiresMinutes: 30,
  });

  void sendMail({
    to: request.alternativeEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    type: "GENERAL",
    metadata: { recoveryNo: request.recoveryNo, userId: request.userId },
  });

  return { request: updated, decision: "APPROVED" };
}

/**
 * فحص صلاحية رمز التحقق لعرض تفاصيله للمستخدم على الواجهة قبل إدخال كلمة المرور
 */
export async function getRecoveryTokenDetails(rawToken: string) {
  if (!rawToken || rawToken.length < 20) {
    throw badRequest("رمز التحقق غير صالح");
  }

  const tokenHash = hashToken(rawToken);
  const recoveryRequest = await prisma.accountRecoveryRequest.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, fullName: true, username: true },
      },
    },
  });

  if (!recoveryRequest) {
    throw notFound("رابط الاستعادة غير موجود أو تم استخدامه مسبقًا");
  }

  if (recoveryRequest.status !== "VERIFICATION_SENT" && recoveryRequest.status !== "APPROVED") {
    throw badRequest("تم إنهاء أو استهلاك طلب الاستعادة هذا مسبقًا");
  }

  if (!recoveryRequest.tokenExpiresAt || recoveryRequest.tokenExpiresAt.getTime() <= Date.now()) {
    throw badRequest("انتهت صلاحية رابط الاستعادة (30 دقيقة). يرجى مراجعة إدارة المنصة لإعادة إصداره");
  }

  // تمويه البريد الإلكتروني لحماية الخصوصية
  const maskedOriginal = recoveryRequest.originalEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3");
  const maskedAlt = recoveryRequest.alternativeEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3");

  return {
    valid: true,
    recoveryNo: recoveryRequest.recoveryNo,
    userFullName: recoveryRequest.user.fullName,
    username: recoveryRequest.user.username,
    maskedOriginalEmail: maskedOriginal,
    maskedAlternativeEmail: maskedAlt,
    expiresAt: recoveryRequest.tokenExpiresAt,
  };
}

export interface CompleteRecoveryInput {
  rawToken: string;
  newPassword: string;
  ip?: string;
  userAgent?: string;
}

/**
 * إكمال استعادة الحساب بالمعاملة الذرية (Atomic Transaction):
 * تحديث البريد الإلكتروني، تشفير كلمة المرور، زيادة إصدار الجلسة، إبطال الجلسات والرموز، وتسجيل التدقيق
 */
export async function completeAlternativeRecovery(input: CompleteRecoveryInput) {
  const { rawToken, newPassword, ip, userAgent } = input;

  if (!rawToken || rawToken.length < 20) {
    throw badRequest("رمز التحقق غير صالح");
  }

  if (!newPassword || newPassword.length < 8) {
    throw badRequest("يجب ألا تقل كلمة المرور الجديدة عن 8 خانات وتحتوي على أرقام وحروف");
  }

  const tokenHash = hashToken(rawToken);
  const recoveryRequest = await prisma.accountRecoveryRequest.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!recoveryRequest) {
    throw notFound("رابط الاستعادة غير موجود أو منتهي الصلاحية");
  }

  if (recoveryRequest.status !== "VERIFICATION_SENT" && recoveryRequest.status !== "APPROVED") {
    throw badRequest("طلب الاستعادة هذا غير صالح للإكمال أو تم استهلاكه بالفعل");
  }

  if (!recoveryRequest.tokenExpiresAt || recoveryRequest.tokenExpiresAt.getTime() <= Date.now()) {
    throw badRequest("انتهت صلاحية رابط الاستعادة. يرجى مراجعة الإدارة");
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  const now = new Date();

  // المعاملة الذرية الشاملة
  const result = await prisma.$transaction(async (tx) => {
    // 1. تحديث بيانات المستخدم (البريد الجديد، التوثيق، كلمة المرور الجديدة، وزيادة sessionVersion لإسقاط كافة الرموز السابقة)
    const updatedUser = await tx.user.update({
      where: { id: recoveryRequest.userId },
      data: {
        email: recoveryRequest.alternativeEmail,
        emailVerified: true,
        emailVerifiedAt: now,
        passwordHash: newPasswordHash,
        sessionVersion: { increment: 1 },
      },
    });

    // 2. إنهاء كافة الجلسات النشطة في جدول UserSession
    await tx.userSession.updateMany({
      where: { userId: recoveryRequest.userId, endedAt: null },
      data: {
        endedAt: now,
        endReason: "ACCOUNT_RECOVERY_COMPLETED",
      },
    });

    // 3. إبطال كافة رموز الأمان السابقة في AuthToken
    await tx.authToken.updateMany({
      where: { userId: recoveryRequest.userId, usedAt: null },
      data: { usedAt: now },
    });

    // 4. تحديث حالة طلب الاستعادة إلى مكتمل واستهلاك الرمز
    const completedRequest = await tx.accountRecoveryRequest.update({
      where: { id: recoveryRequest.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        completedIp: ip || null,
        tokenHash: null, // مسح التجزئة لمنع إعادة الاستخدام إطلاقًا
      },
    });

    // 5. تسجيل الحدث في سجل التدقيق غير القابل للتعديل
    await tx.auditLog.create({
      data: {
        userId: recoveryRequest.userId,
        actorRole: "USER",
        action: "ACCOUNT_RECOVERY_COMPLETED",
        category: "ACCOUNT_RECOVERY",
        result: "SUCCESS",
        targetType: "User",
        targetId: recoveryRequest.userId,
        ip: ip || null,
        userAgent: userAgent || null,
        oldValues: { email: recoveryRequest.originalEmail },
        newValues: {
          email: recoveryRequest.alternativeEmail,
          recoveryNo: recoveryRequest.recoveryNo,
          completedAt: now,
        },
      },
    });

    return { updatedUser, completedRequest };
  });

  // إرسال رسالة تأكيد للبريد الجديد وتنبيه أمني للبريد القديم بشكل آمن
  const completedMail = buildRecoveryCompletedEmail({
    fullName: result.updatedUser.fullName,
    alternativeEmail: result.updatedUser.email,
  });

  void sendMail({
    to: result.updatedUser.email,
    subject: completedMail.subject,
    html: completedMail.html,
    text: completedMail.text,
    type: "GENERAL",
    metadata: { recoveryNo: recoveryRequest.recoveryNo, userId: result.updatedUser.id },
  });

  // إرسال تنبيه أمني للبريد الأصلي (إن كان متاحًا وغير مسدود)
  try {
    const alertMail = buildOldEmailRecoverySecurityAlert({
      fullName: result.updatedUser.fullName,
      alternativeEmail: result.updatedUser.email,
    });
    void sendMail({
      to: recoveryRequest.originalEmail,
      subject: alertMail.subject,
      html: alertMail.html,
      text: alertMail.text,
      type: "GENERAL",
      metadata: { recoveryNo: recoveryRequest.recoveryNo, userId: result.updatedUser.id },
    });
  } catch (err) {
    console.warn("Could not notify original email:", err);
  }

  return {
    success: true,
    message: "تم اكتمال استعادة الحساب بنجاح، يمكنك الآن تسجيل الدخول ببريدك الجديد.",
  };
}

/**
 * إرسال رابط استعادة كلمة المرور عبر البريد الأصلي بواسطة المشرف
 */
export async function sendAdminPasswordRecovery(opts: {
  adminUser: { id: string; fullName: string };
  targetUserId: string;
  ip?: string;
  userAgent?: string;
}) {
  const { adminUser, targetUserId, ip, userAgent } = opts;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    throw notFound("المستخدم غير موجود");
  }

  // إبطال أي رموز سابقة لاستعادة كلمة المرور
  await prisma.authToken.updateMany({
    where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null },
    data: { usedAt: new Date() },
  });

  // إصدار رمز جديد وتخزين تجزئة SHA-256 فقط
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MS);

  await prisma.authToken.create({
    data: {
      userId: user.id,
      type: "PASSWORD_RESET",
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });

  // تسجيل العملية في سجل التدقيق
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      actorRole: "ADMIN",
      action: "ADMIN_TRIGGERED_PASSWORD_RESET",
      category: "ACCOUNT_RECOVERY",
      result: "SUCCESS",
      targetType: "User",
      targetId: user.id,
      ip: ip || null,
      userAgent: userAgent || null,
      newValues: { targetEmail: user.email, expiresAt },
    },
  });

  // إرسال البريد الثنائي
  const resetUrl = `${appBaseUrl()}/reset-password?token=${rawToken}`;
  const mail = buildAdminPasswordRecoveryEmail({
    fullName: user.fullName,
    resetUrl,
    expiresMinutes: 30,
  });

  await sendMail({
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    type: "GENERAL",
    metadata: { userId: user.id, action: "ADMIN_PASSWORD_RESET" },
  });

  return {
    success: true,
    message: `تم إرسال رابط استعادة كلمة المرور بنجاح إلى البريد الأصلي (${user.email})`,
    expiresAt,
  };
}

/**
 * تعليق حساب مستخدم إداريًا
 */
export async function suspendUserAccount(opts: {
  adminUser: { id: string; fullName: string };
  targetUserId: string;
  reason: string;
  ip?: string;
  userAgent?: string;
}) {
  const { adminUser, targetUserId, reason, ip, userAgent } = opts;

  if (adminUser.id === targetUserId) {
    throw forbidden("لا يمكنك تعليق حسابك الإداري الخاص");
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    throw notFound("المستخدم غير موجود");
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: {
        status: "SUSPENDED",
        sessionVersion: { increment: 1 }, // إسقاط فوري لكافة جلسات المستخدم
      },
    });

    await tx.userSession.updateMany({
      where: { userId: targetUserId, endedAt: null },
      data: {
        endedAt: now,
        endReason: `ADMIN_SUSPENDED: ${reason}`,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUser.id,
        actorRole: "ADMIN",
        action: "USER_SUSPENDED",
        category: "ACCOUNT",
        result: "SUCCESS",
        targetType: "User",
        targetId: targetUserId,
        ip: ip || null,
        userAgent: userAgent || null,
        oldValues: { status: user.status },
        newValues: { status: "SUSPENDED", reason },
      },
    });
  });

  // إرسال إشعار للمستخدم
  try {
    const mail = buildAccountSuspensionEmail({
      fullName: user.fullName,
      reason,
    });
    void sendMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      type: "GENERAL",
      metadata: { userId: user.id },
    });
  } catch (err) {
    console.warn("Could not send suspension email:", err);
  }

  return { success: true, message: "تم تعليق الحساب وإنهاء جميع جلساته النشطة بنجاح" };
}

/**
 * إعادة تفعيل حساب مستخدم
 */
export async function reactivateUserAccount(opts: {
  adminUser: { id: string; fullName: string };
  targetUserId: string;
  ip?: string;
  userAgent?: string;
}) {
  const { adminUser, targetUserId, ip, userAgent } = opts;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    throw notFound("المستخدم غير موجود");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: { status: "ACTIVE" },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUser.id,
        actorRole: "ADMIN",
        action: "USER_REACTIVATED",
        category: "ACCOUNT",
        result: "SUCCESS",
        targetType: "User",
        targetId: targetUserId,
        ip: ip || null,
        userAgent: userAgent || null,
        oldValues: { status: user.status },
        newValues: { status: "ACTIVE" },
      },
    });
  });

  try {
    const mail = buildAccountReactivationEmail({ fullName: user.fullName });
    void sendMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      type: "GENERAL",
      metadata: { userId: user.id },
    });
  } catch (err) {
    console.warn("Could not send reactivation email:", err);
  }

  return { success: true, message: "تمت إعادة تفعيل الحساب بنجاح" };
}

/**
 * إلغاء كافة الجلسات النشطة للمستخدم
 */
export async function revokeAllUserSessions(opts: {
  adminUser: { id: string; fullName: string };
  targetUserId: string;
  ip?: string;
  userAgent?: string;
}) {
  const { adminUser, targetUserId, ip, userAgent } = opts;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    throw notFound("المستخدم غير موجود");
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: { sessionVersion: { increment: 1 } },
    });

    await tx.userSession.updateMany({
      where: { userId: targetUserId, endedAt: null },
      data: {
        endedAt: now,
        endReason: "ADMIN_REVOKED_ALL_SESSIONS",
      },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUser.id,
        actorRole: "ADMIN",
        action: "USER_SESSIONS_REVOKED",
        category: "SECURITY",
        result: "SUCCESS",
        targetType: "User",
        targetId: targetUserId,
        ip: ip || null,
        userAgent: userAgent || null,
      },
    });
  });

  return { success: true, message: "تم إلغاء وإسقاط كافة الجلسات النشطة للمستخدم بنجاح" };
}
