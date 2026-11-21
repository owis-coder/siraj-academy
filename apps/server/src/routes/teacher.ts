import { Router } from "express";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { getCommissionRate } from "../lib/settings";
import { notifyAdmins } from "../lib/notify";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { UPLOAD_ROOT } from "../middleware/upload";
import { docsUrlRule } from "../validation/auth";

const router = Router();

// إيراداتي (مدرس): مجموع الطلبات المدفوعة لصالحه بعد التحقق من سندات معتمدة فقط
// ثم يُخصم منهاَن نسبة عمولة المنصة من الإعدادات (commission_rate)
router.get(
  "/earnings",
  requireAuth("TEACHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const [approvedPayments, commissionRate] = await Promise.all([
      prisma.payment.findMany({
        where: { status: "APPROVED", order: { providerId: profile.id } },
        select: { orderId: true, paidAt: true },
        orderBy: { createdAt: "desc" },
      }),
      getCommissionRate(),
    ]);

    const orderIds = [...new Set(approvedPayments.map((p) => p.orderId))];
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, orderNo: true, amount: true, title: true, targetType: true, updatedAt: true },
    });

    const gross = orders.reduce((sum: number, o) => sum + o.amount, 0);
    const dues = Math.round(gross * (1 - commissionRate) * 100) / 100;

    res.json({
      data: {
        gross,
        commissionRate,
        dues,
        ordersCount: orders.length,
        breakdown: orders.map((o) => ({
          ...o,
          paidAt: approvedPayments.find((p) => p.orderId === o.id)?.paidAt ?? null,
        })),
      },
    });
  }),
);

// لوحة المدرس: نظرة عامة على ملفه ونشاطه الحقيقي
router.get(
  "/dashboard",
  requireAuth("TEACHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.id },
      include: { user: { select: { fullName: true, username: true, email: true } } },
    });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const [offeringsPublished, offeringsDrafts, offersPending, offersAccepted, liveUpcoming, adsActive] =
      await Promise.all([
        prisma.courseOffering.count({ where: { teacherId: profile.id, status: "PUBLISHED" } }),
        prisma.courseOffering.count({ where: { teacherId: profile.id, status: "DRAFT" } }),
        prisma.offer.count({ where: { teacherId: profile.id, status: "PENDING" } }),
        prisma.offer.count({ where: { teacherId: profile.id, status: "ACCEPTED" } }),
        prisma.liveSession.count({ where: { teacherId: profile.id, startsAt: { gte: new Date() } } }),
        prisma.ad.count({ where: { teacherId: profile.id, status: { in: ["DRAFT", "PENDING_REVIEW", "APPROVED"] } } }),
      ]);

    res.json({
      data: {
        profile: {
          id: profile.id,
          status: profile.status,
          degree: profile.degree,
          bio: profile.bio,
          specialties: profile.specialties,
          user: profile.user,
        },
        stats: {
          offeringsPublished,
          offeringsDrafts,
          offersPending,
          offersAccepted,
          liveUpcoming,
          adsActive,
        },
      },
    });
  }),
);

// ---------- ملفي المهني (قراءة/تحديث ذاتي) ----------
router.get(
  "/profile",
  requireAuth("TEACHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        user: {
          select: { id: true, fullName: true, username: true, email: true, whatsapp: true, emailVerified: true },
        },
      },
    });
    if (!profile) throw notFound("ملف المدرس غير موجود");
    res.json({ data: profile });
  }),
);

const teacherProfileUpdateSchema = z
  .object({
    fullName: z.string().min(3).max(120).optional(),
    whatsapp: z.string().min(5).max(30).optional(),
    degree: z.string().min(2).max(200).optional(),
    bio: z.string().max(2000).optional(),
    specialties: z.string().max(500).optional(),
    universitiesText: z.string().max(300).optional(),
  })
  .strict();

// ---------- مستندات التحقق (رفع داخلي أو رابط خارجي) ----------
// الملف الداخلي يجب أن يكون من رفع المدرس نفسه، ويبقى محميًا في /uploads
// (لا يقرأه إلا صاحبه والإدارة عبر routes/files.ts).
const verificationDocsSchema = z.object({ docsUrl: docsUrlRule.nullable() }).strict();

router.patch(
  "/verification-docs",
  requireAuth("TEACHER"),
  parseBody(verificationDocsSchema),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const docsUrl = (req.body as { docsUrl: string | null }).docsUrl;
    if (docsUrl && docsUrl.startsWith("/uploads/")) {
      const name = path.basename(docsUrl);
      if (name !== docsUrl.slice("/uploads/".length) || !name.startsWith(`${req.user!.id}-`)) {
        throw forbidden("يمكنك إرفاق ملف من رفعك أنت فقط");
      }
      const absolute = path.resolve(UPLOAD_ROOT, name);
      if (!absolute.startsWith(path.resolve(UPLOAD_ROOT) + path.sep) || !fs.existsSync(absolute)) {
        throw badRequest("الملف غير موجود — أعد رفعه ثم احفظ المستندات");
      }
    }

    await prisma.teacherProfile.update({ where: { id: profile.id }, data: { docsUrl } });
    await notifyAdmins({
      title: "مستندات تحقق مدرس",
      body: `${req.user!.fullName} أرفق/حدّث مستندات التحقق (${docsUrl ?? "بلا مستند"}).`,
      link: "/admin/teachers",
      type: "TEACHER_DOCS",
    });

    res.json({ data: { docsUrl }, message: "حُفظت مستندات التحقق، وستراها الإدارة عند المراجعة." });
  }),
);

router.patch(
  "/profile",
  requireAuth("TEACHER"),
  parseBody(teacherProfileUpdateSchema),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const { fullName, whatsapp, ...rest } = req.body;
    // specialties تصل كسطر نصي وتُفصل إلى مصفوفة (فواصل: , أو ،)
    const profileData = {
      ...rest,
      ...(rest.specialties !== undefined
        ? {
            specialties: rest.specialties
              .split(/[,،]/)
              .map((s: string) => s.trim())
              .filter(Boolean),
          }
        : {}),
    };
    // تعديل الاسم/الواتساب على User، والبقية على TeacherProfile
    // (وثائق التحقق تظل بإدارة الإدارة فقط)
    const [user, updated] = await prisma.$transaction([
      fullName || whatsapp
        ? prisma.user.update({
            where: { id: req.user!.id },
            data: { ...(fullName ? { fullName } : {}), ...(whatsapp ? { whatsapp } : {}) },
          })
        : prisma.user.findUnique({ where: { id: req.user!.id } }),
      prisma.teacherProfile.update({ where: { id: profile.id }, data: profileData }),
    ]);

    res.json({ data: { user, profile: updated } });
  }),
);

export default router;
