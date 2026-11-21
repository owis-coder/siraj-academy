import { Router } from "express";
import { prisma } from "../lib/prisma";
import { notifyUsers } from "../lib/notify";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth, requireApprovedTeacher, optionalAuth } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { pageMeta, skipTake, paginationSchema } from "../validation/common";
import { createAdSchema, updateAdSchema, adDecisionSchema } from "../validation/ads";
import { reviewContent } from "../lib/moderationLog";
import type { AdStatus } from "@prisma/client";

const router = Router();

// اعتماد حالة الإعلان في إنتقالات مراقبة من الخادم:
// DRAFT -> PENDING_REVIEW (تقديم) -> APPROVED | REJECTED
// أي تعديل على APPROVED يعيده تلقائيًا إلى PENDING_REVIEW
// REJECTED يُخفى عن العموم؛ HIDDEN/EXPIRED مباشرة من الإدارة
function canTransition(from: AdStatus, decision: "APPROVED" | "REJECTED" | "HIDDEN" | "EXPIRED"): boolean {
  if (decision === "APPROVED" || decision === "REJECTED") return from === "PENDING_REVIEW";
  if (decision === "HIDDEN") return from === "APPROVED" || from === "REJECTED" || from === "DRAFT" || from === "PENDING_REVIEW";
  if (decision === "EXPIRED") return true;
  return false;
}

// ---------- إنشاء إعلان (مدرس مفعّل) — DRAFT ----------
router.post(
  "/",
  requireApprovedTeacher(),
  parseBody(createAdSchema),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    await reviewContent({
      entityType: "AD",
      contentOwnerId: req.user!.id,
      fields: { title: req.body.title, body: req.body.body, linkUrl: req.body.linkUrl },
    });

    const ad = await prisma.ad.create({
      data: {
        teacherId: profile.id,
        title: req.body.title,
        body: req.body.body,
        imageUrl: req.body.imageUrl,
        linkUrl: req.body.linkUrl,
        status: "DRAFT",
      },
    });
    res.status(201).json({
      data: ad,
      message: "أُنشئ الإعلان كمسودة؛ قدّمه للمراجعة عبر submit لتظهر للاعتماد.",
    });
  }),
);

// ---------- تقديم إعلان للمراجعة (DRAFT -> PENDING_REVIEW) ----------
router.post(
  "/:id/submit",
  requireApprovedTeacher(),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");
    const ad = await prisma.ad.findUnique({ where: { id: req.params.id } });
    if (!ad) throw notFound("الإعلان غير موجود");
    if (ad.teacherId !== profile.id) throw forbidden("ليست لك");
    if (ad.status !== "DRAFT") throw badRequest("يمكن تقديم إعلان مسودة فقط");

    const updated = await prisma.ad.update({ where: { id: ad.id }, data: { status: "PENDING_REVIEW" } });
    res.json({ data: updated, message: "قُدّم الإعلان وانتظر قرار الإدارة." });
  }),
);

// ---------- تعديل إعلان ----------
// قاعدة الأمانة المفروضة على الخادم: تعديل إعلان APPROVED يعيده إلى PENDING_REVIEW
router.patch(
  "/:id",
  requireApprovedTeacher(),
  parseBody(updateAdSchema),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");
    const ad = await prisma.ad.findUnique({ where: { id: req.params.id } });
    if (!ad) throw notFound("الإعلان غير موجود");
    if (ad.teacherId !== profile.id) throw forbidden("ليست لك");
    if (ad.status === "REJECTED" || ad.status === "HIDDEN" || ad.status === "EXPIRED") {
      throw badRequest("لا يمكن تعديل هذا الإعلان بوضعه الحالي؛ أنشئ إعلانًا جديدًا أو راجع الإدارة");
    }

    const data = req.body as { title?: string; body?: string; imageUrl?: string; linkUrl?: string };
    await reviewContent({
      entityType: "AD",
      entityId: ad.id,
      contentOwnerId: req.user!.id,
      fields: { title: data.title, body: data.body, linkUrl: data.linkUrl },
    });
    const wasApproved = ad.status === "APPROVED";

    const updated = await prisma.ad.update({
      where: { id: ad.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
        ...(data.linkUrl !== undefined ? { linkUrl: data.linkUrl } : {}),
        // تعديل جوهري على معتمد -> يُعاد إلى المراجعة
        ...(wasApproved ? { status: "PENDING_REVIEW" as const } : {}),
      },
    });

    res.json({
      data: updated,
      message: wasApproved ? "تم تعديل الإعلان وأُعاد إلى المراجعة قبل النشر من جديد." : "تم تعديل الإعلان.",
    });
  }),
);

// ---------- قرار الإدارة ----------
router.post(
  "/:id/admin",
  requireAuth("ADMIN"),
  parseBody(adDecisionSchema),
  asyncHandler(async (req, res) => {
    const ad = await prisma.ad.findUnique({
      where: { id: req.params.id },
      include: { teacher: { include: { user: { select: { id: true } } } } },
    });
    if (!ad) throw notFound("الإعلان غير موجود");

    const { decision, note } = req.body as { decision: "APPROVED" | "REJECTED" | "HIDDEN" | "EXPIRED"; note?: string };
    if (ad.status === decision) throw badRequest("الإعلان بهذه الحالة بالفعل");
    if (decision !== "EXPIRED" && !canTransition(ad.status, decision)) {
      throw badRequest(`انتقال غير مسموح من ${ad.status} إلى ${decision}`);
    }

    const updated = await prisma.ad.update({
      where: { id: ad.id },
      data: { status: decision, reviewerNote: note },
    });

    // إشعار المدرس بالقرار
    await notifyUsers({
      userIds: [ad.teacher.user.id],
      title:
        decision === "APPROVED" ? "اعتُمد إعلانك"
        : decision === "REJECTED" ? "رُفض إعلانك"
        : decision === "HIDDEN" ? "أُخفي إعلانك"
        : "انتهت صلاحية إعلانك",
      body: note ? `ملاحظة الإدارة: ${note}` : undefined,
      type: "AD_".concat(decision),
    });

    res.json({ data: updated, message: `تم تطبيق قرار الإدارة: ${decision}` });
  }),
);

// ---------- قائمة الإعلانات ----------
// عموم: APPROVED فقط (الظاهرة)
// مدرس: mine=1 لعرض إعلاناته كلها
router.get(
  "/",
  optionalAuth(),
  parseQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const { page, limit, q } = req.query as unknown as { page: number; limit: number; q: string };
    const isMine = req.query.mine === "1" || req.query.mine === "true";

    if (isMine) {
      const user = req.user;
      if (!user || user.role !== "TEACHER") throw forbidden("خيار mine متاح للمدرسين");
      const profile = await prisma.teacherProfile.findUnique({ where: { userId: user.id } });
      if (!profile) throw notFound("ملف المدرس غير موجود");

      const where: Record<string, unknown> = {
        teacherId: profile.id,
        ...(q ? { OR: [{ title: { contains: q } }, { body: { contains: q } }] } : {}),
      };
      const [total, items] = await Promise.all([
        prisma.ad.count({ where: where as never }),
        prisma.ad.findMany({ where: where as never, orderBy: { updatedAt: "desc" }, ...skipTake(page, limit) }),
      ]);
      return res.json({ data: items, meta: pageMeta(total, page, limit) });
    }

    const where: Record<string, unknown> = {
      status: "APPROVED",
      ...(q ? { OR: [{ title: { contains: q } }, { body: { contains: q } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.ad.count({ where: where as never }),
      prisma.ad.findMany({
        where: where as never,
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, body: true, imageUrl: true, linkUrl: true, updatedAt: true },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);

export default router;
