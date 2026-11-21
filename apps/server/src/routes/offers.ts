import { Router } from "express";
import { prisma } from "../lib/prisma";
import { nextOrderNo } from "../lib/orderNo";
import { notifyUsers, notifyAdmins } from "../lib/notify";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { audit } from "../lib/audit";
import { z } from "zod";

const router = Router();

/**
 * دورة العروض المركزية:
 *   المدرس → الإدارة (PENDING / NEEDS_REVISION)
 *   الإدارة تقارن وتختار → APPROVED (عرض واحد فقط يُعرض على الطالب)
 *   الطالب يؤكد العرض المعتمد → Order + TEACHER_SELECTED
 *
 * لا يصل أي عرض إلى الطالب مباشرة، ولا تُنشأ غرفة محادثة بين الطالب والمدرس.
 */

const approveSchema = z
  .object({
    approvedPrice: z.coerce.number().min(0).max(100000).optional(),
    adminNote: z.string().trim().max(1000).optional(),
  })
  .strict();

const decisionSchema = z.object({ note: z.string().trim().max(1000).optional() }).strict();

/** اعتماد عرض (قرار الإدارة) — يُلغي بقية العروض ويُرسل العرض للطالب */
router.post(
  "/:id/approve",
  requireAuth("ADMIN"),
  parseBody(approveSchema),
  asyncHandler(async (req, res) => {
    const { approvedPrice, adminNote } = req.body as { approvedPrice?: number; adminNote?: string };
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: {
        request: true,
        teacher: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });
    if (!offer) throw notFound("العرض غير موجود");
    if (!["PENDING", "NEEDS_REVISION"].includes(offer.status)) {
      throw badRequest("لا يمكن اعتماد عرض في حالته الحالية");
    }
    if (!["OPEN", "PENDING_REVIEW"].includes(offer.request.status)) {
      throw badRequest("الطلب لم يعد قابلًا لاعتماد عرض");
    }

    const finalPrice = approvedPrice ?? offer.price;

    const result = await prisma.$transaction(async (tx) => {
      // عرض واحد فقط يصل للطالب
      await tx.offer.updateMany({
        where: { requestId: offer.requestId, id: { not: offer.id } },
        data: { status: "REJECTED", adminNote: "اختارت الإدارة عرضًا آخر لهذا الطلب." },
      });
      const approved = await tx.offer.update({
        where: { id: offer.id },
        data: {
          status: "APPROVED",
          approvedPrice: finalPrice,
          adminNote,
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
        },
      });
      await tx.explainRequest.update({
        where: { id: offer.requestId },
        data: { status: "TEACHER_SELECTED" },
      });
      return approved;
    });

    await notifyUsers({
      userIds: [offer.request.studentId],
      title: "عرض معتمد من الإدارة",
      body: `اعتمدت الإدارة عرضًا لطلبك «${offer.request.courseTitle}» بسعر ${finalPrice} ريال ومدة ${offer.timelineDays ?? "—"} يوم. راجع التفاصيل وأكّد الطلب.`,
      link: `/requests/${offer.requestId}`,
      type: "OFFER_APPROVED_FOR_STUDENT",
      email: {
        subject: "عرض معتمد على طلب شرحك في أكاديمية سراج",
        text: `اعتمدت الإدارة عرضًا لطلبك «${offer.request.courseTitle}» بسعر ${finalPrice} ريال. سجّل الدخول لمراجعة العرض وتأكيد الطلب.`,
      },
    });

    await notifyUsers({
      userIds: [offer.teacher.userId],
      title: "اعتمدت الإدارة عرضك",
      body: `اعتُمد عرضك على «${offer.request.courseTitle}» بسعر ${finalPrice} ريال. سيُعرض على الطالب، ولا تتواصل معه مباشرة.`,
      type: "OFFER_APPROVED",
    });

    await notifyAdmins({
      title: "اعتماد عرض نهائي",
      body: `اعتُمد عرض ${offer.teacher.user.fullName} على «${offer.request.courseTitle}» بسعر ${finalPrice} ريال.`,
      link: `/admin/offers?requestId=${offer.requestId}`,
      type: "OFFER_APPROVED",
    });

    await audit({
      req,
      userId: req.user!.id,
      actorRole: req.user!.role,
      action: "OFFER_APPROVE",
      category: "REQUEST",
      targetType: "Offer",
      targetId: offer.id,
      newValues: { approvedPrice: finalPrice, requestId: offer.requestId, adminNote },
    });

    res.json({
      data: result,
      message: "اعتُمد العرض وأُرسل إلى الطالب. لا تتواصل مع الطالب خارج المنصة.",
    });
  }),
);

/** طلب تعديل العرض من المدرس (دون كشفه للطالب) */
router.post(
  "/:id/request-changes",
  requireAuth("ADMIN"),
  parseBody(decisionSchema),
  asyncHandler(async (req, res) => {
    const note = (req.body as { note?: string }).note?.trim();
    if (!note || note.length < 3) throw badRequest("اكتب ملاحظة واضحة للمدرس (3 أحرف على الأقل)");
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: { request: { select: { courseTitle: true } }, teacher: { select: { userId: true } } },
    });
    if (!offer) throw notFound("العرض غير موجود");
    if (!["PENDING", "APPROVED"].includes(offer.status)) {
      throw badRequest("لا يمكن طلب تعديل عرض في حالته الحالية");
    }

    const updated = await prisma.offer.update({
      where: { id: offer.id },
      data: { status: "NEEDS_REVISION", adminNote: note, reviewedById: req.user!.id, reviewedAt: new Date() },
    });
    await notifyUsers({
      userIds: [offer.teacher.userId],
      title: "الإدارة تطلب تعديل عرضك",
      body: `على طلب «${offer.request.courseTitle}»: ${note}`,
      link: "/teacher/requests",
      type: "OFFER_NEEDS_REVISION",
    });
    res.json({ data: updated });
  }),
);

/** رفض عرض (قرار الإدارة) */
router.post(
  "/:id/reject",
  requireAuth("ADMIN"),
  parseBody(decisionSchema),
  asyncHandler(async (req, res) => {
    const note = (req.body as { note?: string }).note?.trim();
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: { request: { select: { courseTitle: true } }, teacher: { select: { userId: true } } },
    });
    if (!offer) throw notFound("العرض غير موجود");
    if (offer.status === "REJECTED") throw badRequest("العرض مرفوض مسبقًا");

    const updated = await prisma.offer.update({
      where: { id: offer.id },
      data: { status: "REJECTED", adminNote: note, reviewedById: req.user!.id, reviewedAt: new Date() },
    });
    await notifyUsers({
      userIds: [offer.teacher.userId],
      title: "لم يُختر عرضك",
      body: note ? `على طلب «${offer.request.courseTitle}»: ${note}` : `لم يُختر عرضك على «${offer.request.courseTitle}».`,
      type: "OFFER_REJECTED",
    });
    res.json({ data: updated });
  }),
);

/** توافق خلفي: /accept أصبح قرار الإدارة فقط (كان سابقًا للطالب) */
router.post(
  "/:id/accept",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    res.status(410).json({
      message: "اختيار العرض قرار إداري. استخدم /offers/:id/approve لاعتماد العرض وإرساله للطالب.",
    });
  }),
);

/**
 * تأكيد الطالب للعرض المعتمد الوحيد — يُنشئ طلب الدفع.
 * لا يمكن للطالب تأكيد عرض غير معتمد من الإدارة.
 */
router.post(
  "/:id/confirm",
  requireAuth("STUDENT"),
  asyncHandler(async (req, res) => {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: {
        request: true,
        teacher: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });
    if (!offer) throw notFound("العرض غير موجود");
    if (offer.request.studentId !== req.user!.id) throw forbidden("هذا الطلب ليس لك");
    if (offer.status !== "APPROVED") throw forbidden("لا يمكن تأكيد عرض لم تعتمده الإدارة");

    const finalPrice = offer.approvedPrice ?? offer.price;

    const existing = await prisma.order.findFirst({
      where: { studentId: req.user!.id, targetType: "OFFER", targetId: offer.id, status: "AWAITING_PAYMENT" },
    });
    if (existing) {
      return res.json({
        data: { order: existing, message: "لديك طلب دفع معلّق لهذا العرض؛ أكمل الخطوات وارفع السند." },
      });
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.offer.updateMany({
        where: { requestId: offer.requestId, id: { not: offer.id } },
        data: { status: "REJECTED" },
      });
      await tx.offer.update({ where: { id: offer.id }, data: { status: "ACCEPTED" } });
      await tx.explainRequest.update({
        where: { id: offer.requestId },
        data: { status: "TEACHER_SELECTED" },
      });
      const orderNo = await nextOrderNo();
      return tx.order.create({
        data: {
          orderNo,
          studentId: req.user!.id,
          targetType: "OFFER",
          targetId: offer.id,
          amount: finalPrice,
          title: offer.request.courseTitle,
          status: "AWAITING_PAYMENT",
          providerId: offer.teacherId,
          notes: offer.timelineDays ? `مدة التنفيذ المتفق عليها: ${offer.timelineDays} يوم` : undefined,
        },
      });
    });

    await notifyUsers({
      userIds: [offer.teacher.userId],
      title: "أكّد الطالب العرض المعتمد",
      body: `أكّد الطالب العرض على «${offer.request.courseTitle}». التنسيق عبر الإدارة فقط.`,
      link: "/teacher/requests",
      type: "OFFER_CONFIRMED",
    });

    res.json({
      data: { order, message: "أُنشئ طلب الدفع. التنسيق والمتابعة تتم عبر الإدارة فقط." },
    });
  }),
);

/** تفاصيل عرض: الإدارة أو صاحب العرض فقط (لا منافس حتى) */
router.get(
  "/:id",
  requireAuth("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: {
        request: { select: { id: true, courseTitle: true, status: true } },
        teacher: { include: { user: { select: { fullName: true, username: true } } } },
      },
    });
    if (!offer) throw notFound("العرض غير موجود");
    if (req.user!.role === "TEACHER" && offer.teacher.userId !== req.user!.id) {
      throw forbidden("ليس لديك صلاحية عرض هذا العرض");
    }
    res.json({ data: offer });
  }),
);

/** عروض طلب معيّن — الإدارة فقط */
router.get(
  "/",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const requestId = typeof req.query.requestId === "string" ? req.query.requestId : undefined;
    const offers = await prisma.offer.findMany({
      where: requestId ? { requestId } : {},
      include: {
        request: { select: { id: true, courseTitle: true, status: true } },
        teacher: { include: { user: { select: { fullName: true, username: true } } } },
      },
      orderBy: [{ status: "asc" }, { price: "asc" }],
      take: 200,
    });
    res.json({ data: offers, meta: { total: offers.length } });
  }),
);

/** سحب عرض (المدرس صاحبه قبل قرار الإدارة) */
router.post(
  "/:id/withdraw",
  requireAuth("TEACHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!offer) throw notFound("العرض غير موجود");
    if (offer.teacherId !== profile.id) throw forbidden("يمكن لصاحب العرض سحبه فقط");
    if (!["PENDING", "NEEDS_REVISION"].includes(offer.status)) {
      throw badRequest("لا يمكن سحب عرض بعد اعتماده أو رفضه");
    }

    const updated = await prisma.offer.update({ where: { id: offer.id }, data: { status: "REJECTED" } });
    res.json({ data: updated });
  }),
);

export default router;
