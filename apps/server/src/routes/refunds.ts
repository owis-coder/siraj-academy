import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { pageMeta, skipTake } from "../validation/common";
import { badRequest, notFound, forbidden } from "../lib/errors";
import {
  checkRefundEligibility,
  submitRefundRequest,
  reviewRefundRequest,
  executeRefundTransfer,
} from "../lib/refundService";

const router = Router();

// Validation Schemas
const submitRefundSchema = z.object({
  orderId: z.string().min(1, "معرف الطلب مطلوب"),
  amountRequested: z.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  reason: z.string().trim().min(3, "سبب الاسترداد يجب ألا يقل عن 3 أحرف").max(1000),
  notes: z.string().trim().max(1000).optional(),
  attachments: z.array(z.string()).optional(),
  bankName: z.string().trim().optional(),
  iban: z.string().trim().optional(),
  accountHolderName: z.string().trim().optional(),
});

const reviewRefundSchema = z.object({
  decision: z.enum(["APPROVED", "PARTIALLY_APPROVED", "REJECTED", "NEEDS_INFORMATION"]),
  amountApproved: z.number().positive().optional(),
  adminNotes: z.string().trim().max(1000).optional(),
  rejectionReason: z.string().trim().max(1000).optional(),
});

const executeRefundSchema = z.object({
  transferProofUrl: z.string().trim().min(1, "رابط إشعار التحويل البنكي مطلوب"),
  transferReferenceNo: z.string().trim().min(1, "الرقم المرجعي للحوالة مطلوب"),
  transferredAt: z.string().optional(),
  adminNotes: z.string().trim().max(1000).optional(),
});

// ---------- مسارات الطالب (Student) ----------

// 1. قائمة الطلبات المؤهلة للاسترداد للطالب
router.get(
  "/eligible",
  requireAuth("STUDENT"),
  asyncHandler(async (req, res) => {
    const studentId = req.user!.id;
    const paidOrders = await prisma.order.findMany({
      where: {
        studentId,
        status: "PAID",
      },
      orderBy: { createdAt: "desc" },
      include: {
        payments: { where: { status: "APPROVED" } },
        refundRequests: true,
      },
    });

    const eligibleList = [];
    for (const order of paidOrders) {
      const eligibility = await checkRefundEligibility(order.id, studentId);
      if (eligibility.isEligible) {
        eligibleList.push({
          id: order.id,
          orderNo: order.orderNo,
          title: order.title,
          amount: order.amount,
          targetType: order.targetType,
          maxRefundable: eligibility.maxRefundable,
          alreadyRefunded: eligibility.alreadyRefunded,
          paidAt: order.payments[0]?.paidAt || order.createdAt,
        });
      }
    }

    res.json({ data: eligibleList });
  })
);

// 2. فحص أهلية طلب محدد
router.get(
  "/check/:orderId",
  requireAuth("STUDENT"),
  asyncHandler(async (req, res) => {
    const eligibility = await checkRefundEligibility(req.params.orderId, req.user!.id);
    res.json({ data: eligibility });
  })
);

// 3. تقديم طلب استرداد
router.post(
  "/",
  requireAuth("STUDENT"),
  parseBody(submitRefundSchema),
  asyncHandler(async (req, res) => {
    const refund = await submitRefundRequest(req.user!.id, req.body);
    res.status(201).json({
      data: refund,
      message: "تم تقديم طلب الاسترداد بنجاح وهو قيد المراجعة الإدارية",
    });
  })
);

// 4. سجل طلبات استرداد الطالب
router.get(
  "/mine",
  requireAuth("STUDENT"),
  asyncHandler(async (req, res) => {
    const refunds = await prisma.refundRequest.findMany({
      where: { studentId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        order: { select: { id: true, orderNo: true, title: true, amount: true, targetType: true } },
      },
    });

    res.json({ data: refunds });
  })
);

// 5. إلغاء طلب استرداد معلق من قِبل الطالب
router.patch(
  "/:id/cancel",
  requireAuth("STUDENT"),
  asyncHandler(async (req, res) => {
    const refund = await prisma.refundRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!refund) throw notFound("طلب الاسترداد غير موجود");
    if (refund.studentId !== req.user!.id) throw forbidden("لا تملك صلاحية تعديل هذا الطلب");
    if (refund.status !== "PENDING") {
      throw badRequest("لا يمكن إلغاء طلب تم البدء في مراجعته أو اعتماده");
    }

    const cancelled = await prisma.refundRequest.update({
      where: { id: refund.id },
      data: { status: "CANCELLED" },
    });

    res.json({ data: cancelled, message: "تم إلغاء طلب الاسترداد بنجاح" });
  })
);

// ---------- مسارات الإدارة (Admin) ----------

// 6. قائمة جميع طلبات الاسترداد للإدارة مع الفلاتر
router.get(
  "/admin/all",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const status = req.query.status as string;

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const [total, items] = await Promise.all([
      prisma.refundRequest.count({ where: where as never }),
      prisma.refundRequest.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { id: true, fullName: true, username: true, email: true, whatsapp: true } },
          order: { select: { id: true, orderNo: true, title: true, amount: true, targetType: true } },
          reviewer: { select: { id: true, fullName: true, username: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);

    res.json({ data: items, meta: pageMeta(total, page, limit) });
  })
);

// 7. مراجعة طلب الاسترداد (اعتماد كلي/جزئي أو رفض)
router.patch(
  "/admin/:id/review",
  requireAuth("ADMIN"),
  parseBody(reviewRefundSchema),
  asyncHandler(async (req, res) => {
    const updated = await reviewRefundRequest(req.params.id, req.user!.id, req.body);
    res.json({ data: updated, message: "تمت مراجعة طلب الاسترداد بنجاح" });
  })
);

// 8. تنفيذ التحويل البنكي الفعلي للاسترداد ورفع الإشعار
router.post(
  "/admin/:id/execute",
  requireAuth("ADMIN"),
  parseBody(executeRefundSchema),
  asyncHandler(async (req, res) => {
    const executed = await executeRefundTransfer(req.params.id, req.user!.id, {
      transferProofUrl: req.body.transferProofUrl,
      transferReferenceNo: req.body.transferReferenceNo,
      transferredAt: req.body.transferredAt ? new Date(req.body.transferredAt) : undefined,
      adminNotes: req.body.adminNotes,
    });
    res.json({
      data: executed,
      message: "تم توثيق تنفيذ الحوالة البنكية المستردة بنجاح وسحب الصلاحية الأكاديمية للطالب",
    });
  })
);

// 9. تفاصيل طلب استرداد محدد
router.get(
  "/:id",
  requireAuth("STUDENT", "ADMIN"),
  asyncHandler(async (req, res) => {
    const refund = await prisma.refundRequest.findUnique({
      where: { id: req.params.id },
      include: {
        student: { select: { id: true, fullName: true, username: true, email: true } },
        order: { select: { id: true, orderNo: true, title: true, amount: true, targetType: true } },
        reviewer: { select: { id: true, fullName: true } },
      },
    });

    if (!refund) throw notFound("طلب الاسترداد غير موجود");
    if (req.user!.role === "STUDENT" && refund.studentId !== req.user!.id) {
      throw forbidden("لا تملك صلاحية عرض هذا الطلب");
    }

    res.json({ data: refund });
  })
);

export default router;
