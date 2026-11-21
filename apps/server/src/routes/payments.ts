import { Router } from "express";
import { prisma } from "../lib/prisma";
import { notifyUsers } from "../lib/notify";
import { badRequest, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { pageMeta, skipTake } from "../validation/common";
import { reviewPaymentSchema, paymentListSchema } from "../validation/orders";
import { recordJournalEntry } from "../lib/ledgerService";
import { recordTeacherEarningForOrder } from "../lib/teacherWalletService";

const router = Router();

// ---------- قائمة المدفوعات (إدارة) ----------
router.get(
  "/",
  requireAuth("ADMIN"),
  parseQuery(paymentListSchema),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };
    const where = status ? { status: status as never } : {};

    const [total, items] = await Promise.all([
      prisma.payment.count({ where: where as never }),
      prisma.payment.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: {
          order: {
            select: {
              id: true, orderNo: true, amount: true, title: true, status: true, targetType: true, targetId: true,
              student: { select: { id: true, fullName: true, username: true, whatsapp: true } },
            },
          },
        },
        ...skipTake(page, limit),
      }),
    ]);

    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);

// ---------- مراجعة سند (إدارة): APPROVED يمنح الوصول / REJECTED يرفض الطلب ----------
// ⚠️ لا نجاح تلقائي عند الإرسال؛ هذا هو المسار الوحيد لاعتماد الدفع.
router.post(
  "/:id/review",
  requireAuth("ADMIN"),
  parseBody(reviewPaymentSchema),
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        order: {
          include: {
            provider: { include: { user: { select: { id: true, email: true } } } },
            student: { select: { id: true, email: true, fullName: true } },
          },
        },
      },
    });
    if (!payment) throw notFound("عملية الدفع غير موجودة");
    if (payment.status !== "UNDER_REVIEW") throw badRequest("تمت مراجعة هذا السند مسبقًا");

    const { decision, note } = req.body as { decision: "APPROVED" | "REJECTED"; note?: string };

    if (decision === "APPROVED") {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "APPROVED",
            reviewerId: req.user!.id,
            reviewNote: note,
            paidAt: new Date(),
          },
        });
        // الطلب يصبح PAID
        await tx.order.update({ where: { id: payment.orderId }, data: { status: "PAID" } });

        // تسجيل قيد الإيداع البنكي الأولي في دفتر الأستاذ المزدوج
        await recordJournalEntry(
          {
            type: "PAYMENT_DEPOSIT",
            narrativeAr: `إيداع دفعة بنكية معتمدة للطلب ${payment.order.orderNo} بمبلغ ${payment.order.amount} ريال`,
            narrativeEn: `Deposit for approved payment of order ${payment.order.orderNo}`,
            referenceType: "PAYMENT",
            referenceId: payment.id,
            createdById: req.user!.id,
            currency: "SAR",
            lines: [
              { accountCode: "1010", entryType: "DEBIT", amount: payment.order.amount, userId: payment.order.studentId },
              { accountCode: "2010", entryType: "CREDIT", amount: payment.order.amount, userId: payment.order.studentId },
            ],
          },
          tx
        );

        // تسجيل استحقاق المدرس وتثبيت نسبة العمولة اللحظية (Snapshot) إن كان للطلب مدرس
        if (payment.order.providerId) {
          await recordTeacherEarningForOrder(payment.orderId, tx);
        }
      });

      // منح الوصول حسب نوع الهدف (خارج المعاملة لكن ذري)
      await grantAccess(payment.orderId);

      // إشعارات الطالب + المزوّد (إن وجد)
      await notifyUsers({
        userIds: [payment.order.studentId],
        title: "تم اعتماد الدفعة",
        body: `اعتُمد سند الطلب ${payment.order.orderNo}. فُتح لك الوصول، أهلاً بك!`,
        link: `/orders/${payment.orderId}`,
        type: "PAYMENT_APPROVED",
      });
      if (payment.order.provider) {
        await notifyUsers({
          userIds: [payment.order.provider.userId],
          title: "دفعة جديدة معتمدة لصالحك",
          body: `اعتُمد سند طلب ${payment.order.orderNo} بمبلغ ${payment.order.amount} ريال.`,
          link: `/orders/${payment.orderId}`,
          type: "PAYMENT_APPROVED",
        });
      }
      await notifyUsers({
        userIds: [req.user!.id],
        title: "اعتمدت سندًا",
        body: `الطلب ${payment.order.orderNo}.`,
        type: "PAYMENT_REVIEWED",
      });

      return res.json({
        data: { message: "اعتُمد السند وتحقق الدفع؛ فُتح الوصول وأُرسلت الإشعارات." },
      });
    }

    // REJECTED: السند مرفوض + الطلب REJECTED + إلغاء حجوزات جلسات معلقة
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REJECTED", reviewerId: req.user!.id, reviewNote: note },
      });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: "REJECTED" } });
      await tx.liveBooking.updateMany({
        where: { orderId: payment.orderId },
        data: { status: "CANCELLED" },
      });
    });

    await notifyUsers({
      userIds: [payment.order.studentId],
      title: "لم يُعتمد السند",
      body: note
        ? `سبب الإدارة: ${note}`
        : `لم يُعتمد سند الطلب ${payment.order.orderNo}؛ راجع زملاء الدفع مع الإدارة.`,
      type: "PAYMENT_REJECTED",
    });

    res.json({ data: { message: "رُفض السند وأُلغي الطلب وأُرسل إشعار للطالب." } });
  }),
);

// منح الوصول بعد اعتماد الدفع
async function grantAccess(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { provider: true },
  });
  if (!order) return;

  switch (order.targetType) {
    case "OFFERING": {
      if (!order.targetId) return;
      // الاشتراك (Enrollment) — مصدر تحت العربة مرئي للمشترك
      await prisma.enrollment.upsert({
        where: { userId_offeringId: { userId: order.studentId, offeringId: order.targetId } },
        update: {},
        create: { userId: order.studentId, offeringId: order.targetId },
      });
      break;
    }
    case "OFFER": {
      if (!order.targetId) return;
      // اكتمال تدفق العرض: يغلق طلب الشرح
      const offer = await prisma.offer.findUnique({ where: { id: order.targetId }, select: { requestId: true } });
      if (offer) {
        await prisma.explainRequest.updateMany({
          where: { id: offer.requestId, status: "TEACHER_SELECTED" },
          data: { status: "CLOSED" },
        });
      }
      break;
    }
    case "CUSTOM": {
      // حجوزات الجلسات المباشرة تبقى مؤكدة (أُنشئت مع الطلب)
      break;
    }
    case "SERVICE":
    default:
      // الخدمة تُคمل بمجرد PAID — لا كيان إضافي
      break;
  }
}

// إيرادات المدرس موضوعة في مسار /teacher/earnings — انظر routes/teacher.ts

export default router;
