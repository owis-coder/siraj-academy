import { Router } from "express";
import { prisma } from "../lib/prisma";
import { nextOrderNo } from "../lib/orderNo";
import { notifyUsers } from "../lib/notify";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// قبول عرض (طالب صاحب الطلب فقط):
// 1) الطلب يجب أن يكون OPEN
// 2) العرض يجب أن يكون PENDING
// 3) إغلاق بقية العروض (REJECTED)
// 4) الطلب -> TEACHER_SELECTED
// 5) طلب = Order (AWAITING_PAYMENT) بمبلغ العرض
// 6) فتح غرفة محادثة من نوع ORDER بين الطالب والمدرس
// 7) إشعار المدرس
router.post(
  "/:id/accept",
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
    if (offer.request.studentId !== req.user!.id) throw forbidden("قبول العرض متاح لصاحب الطلب فقط");
    if (offer.request.status !== "OPEN") throw badRequest("لا يمكن قبول عروض على طلب غير مفتوح");
    if (offer.status !== "PENDING") throw badRequest("العرض لم يعد متاحًا للاختيار");

    const result = await prisma.$transaction(async (tx) => {
      // إغلاق بقية العروض الأخرى على نفس الطلب
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
      const order = await tx.order.create({
        data: {
          orderNo,
          studentId: req.user!.id,
          targetType: "OFFER",
          targetId: offer.id,
          amount: offer.price,
          title: offer.request.courseTitle,
          status: "AWAITING_PAYMENT",
          providerId: offer.teacherId,
          notes: offer.timelineDays ? `مدة التنفيذ المتفق عليها: ${offer.timelineDays} يوم` : undefined,
        },
      });

      // غرفة محادثة مرتبطة بالطلب بين الطالب والمدرس
      const room = await tx.chatRoom.create({
        data: {
          type: "ORDER",
          orderId: order.id,
          title: `طلب: ${offer.request.courseTitle}`,
          participants: {
            create: [
              { userId: req.user!.id, role: "MEMBER" },
              { userId: offer.teacher.user.id, role: "MEMBER" },
            ],
          },
        },
      });

      return { offer, order, room };
    });

    await notifyUsers({
      userIds: [offer.teacher.userId],
      title: "تم اختيار عرضك",
      body: `اختار الطالب عرضك على "${offer.request.courseTitle}". أنشئ حساب دفع عبر التحويل البنكي وبدأت المحادثة.`,
      link: `/orders/${result.order.id}`,
      type: "OFFER_ACCEPTED",
      email: {
        subject: "تم اختيار عرضك في أكاديمية سراج",
        text: `تم اختيار عرضك على الطلب "${offer.request.courseTitle}" بسعر ${offer.price} ريال. حان وقت التنفيذ.`,
      },
    });

    res.json({
      data: {
        order: result.order,
        chatRoomId: result.room.id,
        message: "تم قبول العرض وأُنشئ طلب دفع (تحويل بنكي) وفتحت محادثة مع المدرس.",
      },
    });
  }),
);

// عرض منشأة للاختبار (إدارة): تفاصيل عرض
router.get(
  "/:id",
  requireAuth("ADMIN", "TEACHER"),
  asyncHandler(async (req, res) => {
    const offer = await prisma.offer.findUnique({
      where: { id: req.params.id },
      include: {
        request: { select: { id: true, courseTitle: true, status: true, studentId: true } },
        teacher: { include: { user: { select: { fullName: true, username: true } } } },
      },
    });
    if (!offer) throw notFound("العرض غير موجود");

    // المدرس يرى عروضه فقط، والإدارة كل شيء
    if (req.user!.role === "TEACHER" && offer.teacher.userId !== req.user!.id) {
      throw forbidden("ليس لديك صلاحية عرض هذا العرض");
    }
    res.json({ data: offer });
  }),
);

// سحب عرض (المدرس صاحبه، وإن كان PENDING) — اكتمال دورة العروض
router.post(
  "/:id/withdraw",
  requireAuth("TEACHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!offer) throw notFound("العرض غير موجود");
    if (offer.teacherId !== profile.id) throw forbidden("يمكن لصاحب العرض سحبه فقط");
    if (offer.status !== "PENDING") throw badRequest("لا يمكن سحب عرض تم قبوله أو رفضه");

    const updated = await prisma.offer.update({ where: { id: offer.id }, data: { status: "REJECTED" } });
    res.json({ data: updated });
  }),
);

export default router;
