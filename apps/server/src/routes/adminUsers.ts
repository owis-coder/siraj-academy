// ============================================================
// مسارات إدارة حسابات المستخدمين واستعادتها بلوحة الإدارة
// Admin User Account Management and Recovery API
// ============================================================
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { badRequest, forbidden, notFound } from "../lib/errors";
import {
  AdminPermissions,
  requireAdminPermission,
} from "../lib/adminPermissions";
import {
  assessUserRisk,
  createAlternativeRecoveryRequest,
  reviewRecoveryRequest,
  sendAdminPasswordRecovery,
  suspendUserAccount,
  reactivateUserAccount,
  revokeAllUserSessions,
} from "../lib/recoveryService";
import type { Role, UserStatus, RecoveryVerificationMethod } from "@prisma/client";

const router = Router();

// كافة مسارات هذا الملف تتطلب دور مدير (ADMIN) ومصادقة سليمة
router.use(requireAuth("ADMIN"));

// ---------- 1. إحصائيات سريعة لحسابات المستخدمين ----------
router.get(
  "/stats",
  requireAdminPermission(AdminPermissions.USERS_READ),
  asyncHandler(async (_req, res) => {
    const [
      totalUsers,
      studentsCount,
      teachersCount,
      adminsCount,
      activeCount,
      suspendedCount,
      unverifiedCount,
      pendingRecoveriesCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.user.count({ where: { role: "TEACHER" } }),
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "SUSPENDED" } }),
      prisma.user.count({ where: { emailVerified: false } }),
      prisma.accountRecoveryRequest.count({ where: { status: "PENDING_APPROVAL" } }),
    ]);

    res.json({
      data: {
        totalUsers,
        studentsCount,
        teachersCount,
        adminsCount,
        activeCount,
        suspendedCount,
        unverifiedCount,
        pendingRecoveriesCount,
      },
    });
  }),
);

// ---------- 2. قائمة المستخدمين مع البحث والتصفية ----------
router.get(
  "/",
  requireAdminPermission(AdminPermissions.USERS_READ),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const role = typeof req.query.role === "string" ? req.query.role : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const filter = typeof req.query.filter === "string" ? req.query.filter : "all";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    // البحث بالاسم الكامل، اسم المستخدم، البريد، أو المعرف
    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { id: { equals: q } },
      ];
    }

    // تصفية الدور
    if (role && ["STUDENT", "TEACHER", "ADMIN"].includes(role)) {
      where.role = role as Role;
    }

    // تصفية الحالة
    if (status && ["ACTIVE", "SUSPENDED", "PENDING"].includes(status)) {
      where.status = status as UserStatus;
    }

    // الفلاتر المحددة مسبقًا
    if (filter === "students") where.role = "STUDENT";
    else if (filter === "teachers") where.role = "TEACHER";
    else if (filter === "active") where.status = "ACTIVE";
    else if (filter === "suspended") where.status = "SUSPENDED";
    else if (filter === "unverified") where.emailVerified = false;
    else if (filter === "recent_modified") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      where.updatedAt = { gte: sevenDaysAgo };
    } else if (filter === "recovery_required") {
      where.targetRecoveries = {
        some: {
          status: { in: ["PENDING_APPROVAL", "APPROVED", "VERIFICATION_SENT"] },
        },
      };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullName: true,
          username: true,
          email: true,
          role: true,
          status: true,
          emailVerified: true,
          emailVerifiedAt: true,
          whatsapp: true,
          level: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              sessions: { where: { endedAt: null } },
              targetRecoveries: true,
            },
          },
          teacherProfile: {
            select: {
              id: true,
              degree: true,
              status: true,
            },
          },
        },
      }),
    ]);

    res.json({
      data: {
        items: users.map((u) => ({
          ...u,
          activeSessionsCount: u._count.sessions,
          recoveryRequestsCount: u._count.targetRecoveries,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }),
);

// ---------- 3. قائمة طلبات استعادة الحسابات بالبريد البديل ----------
router.get(
  "/recoveries",
  requireAdminPermission(AdminPermissions.USERS_READ),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [total, items] = await Promise.all([
      prisma.accountRecoveryRequest.count({ where }),
      prisma.accountRecoveryRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              email: true,
              role: true,
              status: true,
            },
          },
          initiator: {
            select: { id: true, fullName: true, username: true, email: true },
          },
          reviewer: {
            select: { id: true, fullName: true, username: true, email: true },
          },
          approvals: {
            include: {
              admin: { select: { id: true, fullName: true, username: true } },
            },
          },
        },
      }),
    ]);

    res.json({
      data: {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  }),
);

// ---------- 4. تفاصيل حساب مستخدم شاملة ----------
router.get(
  "/:id",
  requireAdminPermission(AdminPermissions.USERS_READ),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        university: { select: { id: true, name: true } },
        major: { select: { id: true, name: true } },
        teacherProfile: {
          include: {
            offerings: {
              select: { id: true, title: true, status: true, price: true },
              take: 5,
            },
            services: {
              select: { id: true, title: true, isActive: true, basePrice: true },
              take: 5,
            },
          },
        },
        sessions: {
          orderBy: { lastSeenAt: "desc" },
          take: 10,
        },
        targetRecoveries: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            initiator: { select: { id: true, fullName: true } },
            reviewer: { select: { id: true, fullName: true } },
          },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 15,
        },
      },
    });

    if (!user) {
      throw notFound("المستخدم غير موجود");
    }

    const risk = await assessUserRisk(id);

    // سجل التدقيق الموجه لهذا المستخدم (سواء كان هو الفاعل أو الهدف)
    const targetAuditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [{ targetId: id }, { userId: id }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified,
          emailVerifiedAt: user.emailVerifiedAt,
          whatsapp: user.whatsapp,
          level: user.level,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          sessionVersion: user.sessionVersion,
          adminPermissions: user.adminPermissions,
          university: user.university,
          major: user.major,
          teacherProfile: user.teacherProfile,
          sessions: user.sessions,
          recoveries: user.targetRecoveries,
          risk,
          auditLogs: targetAuditLogs,
        },
      },
    });
  }),
);

// ---------- 5. تعديل بيانات الملف الشخصي للمستخدم ----------
router.patch(
  "/:id/profile",
  requireAdminPermission(AdminPermissions.USERS_UPDATE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { fullName, whatsapp, level, bio } = req.body as {
      fullName?: string;
      whatsapp?: string;
      level?: string;
      bio?: string;
    };

    const existing = await prisma.user.findUnique({
      where: { id },
      include: { teacherProfile: true },
    });
    if (!existing) throw notFound("المستخدم غير موجود");

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          fullName: fullName?.trim() || existing.fullName,
          whatsapp: whatsapp !== undefined ? whatsapp.trim() || null : existing.whatsapp,
          level: level !== undefined ? level.trim() || null : existing.level,
        },
      });

      if (bio !== undefined && existing.teacherProfile) {
        await tx.teacherProfile.update({
          where: { userId: id },
          data: { bio: bio.trim() },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actorRole: "ADMIN",
          action: "USER_PROFILE_UPDATED",
          category: "ACCOUNT",
          result: "SUCCESS",
          targetType: "User",
          targetId: id,
          ip: req.ip || null,
          userAgent: req.get("user-agent") || null,
          oldValues: {
            fullName: existing.fullName,
            whatsapp: existing.whatsapp,
            level: existing.level,
          },
          newValues: {
            fullName: user.fullName,
            whatsapp: user.whatsapp,
            level: user.level,
          },
        },
      });

      return user;
    });

    res.json({
      data: updated,
      message: "تم تحديث الملف الشخصي للمستخدم بنجاح",
    });
  }),
);

// ---------- 6. تعديل اسم المستخدم مع التحقق من الفرادة ----------
router.patch(
  "/:id/username",
  requireAdminPermission(AdminPermissions.USERS_UPDATE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { username: rawUsername } = req.body as { username?: string };

    if (!rawUsername) throw badRequest("اسم المستخدم الجديد مطلوب");
    const username = rawUsername.trim().toLowerCase();

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      throw badRequest("يجب أن يتكون اسم المستخدم من 3 إلى 30 حرفًا أو رقمًا باللغة الإنجليزية");
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound("المستخدم غير موجود");

    const duplicate = await prisma.user.findFirst({
      where: { username, id: { not: id } },
    });
    if (duplicate) {
      throw badRequest("اسم المستخدم هذا محجوز بالفعل لمستخدم آخر");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { username },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actorRole: "ADMIN",
          action: "USERNAME_CHANGED",
          category: "ACCOUNT",
          result: "SUCCESS",
          targetType: "User",
          targetId: id,
          ip: req.ip || null,
          userAgent: req.get("user-agent") || null,
          oldValues: { username: existing.username },
          newValues: { username },
        },
      });

      return user;
    });

    res.json({
      data: { id: updated.id, username: updated.username },
      message: "تم تغيير اسم المستخدم بنجاح",
    });
  }),
);

// ---------- 7. تعديل البريد الإلكتروني المباشر (مع سبب إداري) ----------
router.patch(
  "/:id/email",
  requireAdminPermission(AdminPermissions.USERS_UPDATE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { email: rawEmail, reason } = req.body as { email?: string; reason?: string };

    if (!rawEmail) throw badRequest("البريد الإلكتروني الجديد مطلوب");
    if (!reason || reason.trim().length < 5) {
      throw badRequest("يجب كتابة سبب إداري واضح لتعديل البريد الإلكتروني مباشرة");
    }

    const email = rawEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw badRequest("صيغة البريد الإلكتروني غير صحيحة");
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound("المستخدم غير موجود");

    const duplicate = await prisma.user.findFirst({
      where: { email, id: { not: id } },
    });
    if (duplicate) {
      throw badRequest("البريد الإلكتروني هذا مستخدم لحساب آخر بالفعل");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          email,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          sessionVersion: { increment: 1 }, // إسقاط الجلسات للتحوط الأمني
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actorRole: "ADMIN",
          action: "EMAIL_CHANGED_DIRECT",
          category: "ACCOUNT",
          result: "SUCCESS",
          targetType: "User",
          targetId: id,
          ip: req.ip || null,
          userAgent: req.get("user-agent") || null,
          oldValues: { email: existing.email },
          newValues: { email, reason },
        },
      });

      return user;
    });

    res.json({
      data: { id: updated.id, email: updated.email },
      message: "تم تحديث البريد الإلكتروني بنجاح وتسجيل العملية في سجل التدقيق",
    });
  }),
);

// ---------- 8. تعليق حساب المستخدم ----------
router.post(
  "/:id/suspend",
  requireAdminPermission(AdminPermissions.USERS_SUSPEND),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!reason || reason.trim().length < 5) {
      throw badRequest("يجب توضيح سبب تعليق الحساب (5 أحرف على الأقل)");
    }

    const result = await suspendUserAccount({
      adminUser: { id: req.user!.id, fullName: req.user!.fullName },
      targetUserId: id,
      reason: reason.trim(),
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ data: result });
  }),
);

// ---------- 9. إعادة تفعيل حساب المستخدم ----------
router.post(
  "/:id/reactivate",
  requireAdminPermission(AdminPermissions.USERS_REACTIVATE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await reactivateUserAccount({
      adminUser: { id: req.user!.id, fullName: req.user!.fullName },
      targetUserId: id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ data: result });
  }),
);

// ---------- 10. إلغاء كافة الجلسات النشطة للمستخدم ----------
router.post(
  "/:id/revoke-sessions",
  requireAdminPermission(AdminPermissions.USERS_SESSIONS_REVOKE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await revokeAllUserSessions({
      adminUser: { id: req.user!.id, fullName: req.user!.fullName },
      targetUserId: id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ data: result });
  }),
);

// ---------- 11. إرسال رابط استعادة كلمة المرور عبر البريد الأصلي ----------
router.post(
  "/:id/send-recovery-email",
  requireAdminPermission(AdminPermissions.USERS_PASSWORD_RECOVERY),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await sendAdminPasswordRecovery({
      adminUser: { id: req.user!.id, fullName: req.user!.fullName },
      targetUserId: id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ data: result });
  }),
);

// ---------- 12. بدء إجراء استعادة الحساب بالبريد البديل (فقدان البريد الأصلي) ----------
router.post(
  "/:id/alternative-recovery",
  requireAdminPermission(AdminPermissions.USERS_EMAIL_RECOVERY),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      alternativeEmail,
      reason,
      verificationMethod,
      verificationNotes,
      evidenceRef,
    } = req.body as {
      alternativeEmail?: string;
      reason?: string;
      verificationMethod?: RecoveryVerificationMethod;
      verificationNotes?: string;
      evidenceRef?: string;
    };

    if (!alternativeEmail) throw badRequest("البريد الإلكتروني البديل مطلوب");
    if (!reason || reason.trim().length < 5) {
      throw badRequest("سبب فقدان الوصول للبريد الأصلي مطلوب");
    }
    if (!verificationMethod) {
      throw badRequest("طريقة التحقق من الهوية مطلوبة");
    }

    const result = await createAlternativeRecoveryRequest({
      initiatorAdmin: {
        id: req.user!.id,
        fullName: req.user!.fullName,
        email: req.user!.email,
      },
      targetUserId: id,
      alternativeEmail,
      reason: reason.trim(),
      verificationMethod,
      verificationNotes: verificationNotes?.trim(),
      evidenceRef: evidenceRef?.trim(),
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({
      data: result,
      message: result.verificationSentDirectly
        ? "تم إنشاء طلب الاستعادة وإرسال رابط التفعيل إلى البريد البديل فورًا"
        : "تم تسجيل طلب الاستعادة بنجاح، ويتطلب اعتمادًا إضافيًا من مشرف آخر نظرًا لمستوى الخطورة",
    });
  }),
);

// ---------- 13. مراجعة واعتماد طلب الاستعادة بواسطة مشرف ثانٍ (Dual-Admin Approval) ----------
router.post(
  "/recoveries/:id/review",
  requireAdminPermission(AdminPermissions.USERS_RECOVERY_APPROVE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { decision, notes } = req.body as {
      decision?: "APPROVED" | "REJECTED";
      notes?: string;
    };

    if (!decision || !["APPROVED", "REJECTED"].includes(decision)) {
      throw badRequest("قرار المراجعة مطلوب (APPROVED أو REJECTED)");
    }

    const result = await reviewRecoveryRequest({
      reviewerAdmin: {
        id: req.user!.id,
        fullName: req.user!.fullName,
        email: req.user!.email,
      },
      requestId: id,
      decision,
      notes: notes?.trim(),
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({
      data: result,
      message:
        decision === "APPROVED"
          ? "تم اعتماد الطلب وإرسال رابط تفعيل الاستعادة إلى البريد البديل بنجاح"
          : "تم رفض طلب الاستعادة بنجاح",
    });
  }),
);

// ---------- 14. تغيير دور المستخدم (STUDENT <-> TEACHER <-> ADMIN) مع حماية صريحة ----------
router.post(
  "/:id/role",
  requireAdminPermission(AdminPermissions.USERS_ROLES_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role: newRole, confirm } = req.body as {
      role?: Role;
      confirm?: boolean;
    };

    if (!newRole || !["STUDENT", "TEACHER", "ADMIN"].includes(newRole)) {
      throw badRequest("الدور الجديد غير صالح");
    }

    if (!confirm) {
      throw badRequest("يجب تأكيد تغيير دور الحساب بشكل صريح");
    }

    // منع المشرف من تجريد نفسه من صلاحية الإدارة أو تعديل دوره
    if (req.user!.id === id) {
      throw forbidden("لا يمكنك تعديل صلاحيات أو دور حسابك الإداري بنفسك");
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: { teacherProfile: true },
    });
    if (!user) throw notFound("المستخدم غير موجود");

    const updated = await prisma.$transaction(async (tx) => {
      // إذا كان الترقية لمدرس ولا يوجد ملف مدرس، يتم إنشاؤه تلقائيًا بحالة APPROVED
      if (newRole === "TEACHER" && !user.teacherProfile) {
        await tx.teacherProfile.create({
          data: {
            userId: id,
            degree: "محاضر أكاديمي",
            bio: "مدرس معتمد في أكاديمية سراج",
            specialties: ["مقررات جامعية"],
            status: "APPROVED",
          },
        });
      }

      const resUser = await tx.user.update({
        where: { id },
        data: {
          role: newRole,
          sessionVersion: { increment: 1 }, // إسقاط الجلسات لتطبيق الصلاحيات فورًا
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actorRole: "ADMIN",
          action: "USER_ROLE_CHANGED",
          category: "SECURITY",
          result: "SUCCESS",
          targetType: "User",
          targetId: id,
          ip: req.ip || null,
          userAgent: req.get("user-agent") || null,
          oldValues: { role: user.role },
          newValues: { role: newRole },
        },
      });

      return resUser;
    });

    res.json({
      data: { id: updated.id, role: updated.role },
      message: `تم تحديث دور المستخدم بنجاح إلى: ${newRole}`,
    });
  }),
);

export default router;
