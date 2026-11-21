import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { pageMeta, skipTake } from "../validation/common";
import { badRequest, notFound, forbidden } from "../lib/errors";
import {
  getTeacherWalletSummary,
  addTeacherPayoutMethod,
  submitWithdrawalRequest,
  reviewWithdrawalRequest,
  executeWithdrawalTransfer,
} from "../lib/teacherWalletService";

const router = Router();

// Validation Schemas
const addPayoutMethodSchema = z.object({
  bankName: z.string().trim().min(2, "اسم البنك مطلوب"),
  accountHolderName: z.string().trim().min(3, "اسم صاحب الحساب مطلوب"),
  iban: z.string().trim().min(15, "رقم الآيبان غير صالح"),
  isDefault: z.boolean().optional(),
});

const submitWithdrawalSchema = z.object({
  amount: z.number().positive("مبلغ السحب يجب أن يكون أكبر من صفر"),
  payoutMethodId: z.string().min(1, "وسيلة السحب مطلوبة"),
  adminNotes: z.string().trim().max(1000).optional(),
});

const reviewWithdrawalSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  adminNotes: z.string().trim().max(1000).optional(),
  rejectionReason: z.string().trim().max(1000).optional(),
});

const executeWithdrawalSchema = z.object({
  transferProofUrl: z.string().trim().min(1, "رابط إشعار التحويل مطلوب"),
  transferReferenceNo: z.string().trim().min(1, "الرقم المرجعي للحوالة مطلوب"),
  transferredAt: z.string().optional(),
  adminNotes: z.string().trim().max(1000).optional(),
});

// ---------- مسارات المدرس (Teacher) ----------

// 1. كشف حساب المحفظة والأرصدة
router.get(
  "/teacher/wallet",
  requireAuth("TEACHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.id },
    });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const summary = await getTeacherWalletSummary(profile.id);
    res.json({ data: summary });
  })
);

// 2. وسائل السحب البنكية المحفوظة
router.get(
  "/teacher/payout-methods",
  requireAuth("TEACHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.id },
    });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const methods = await prisma.teacherPayoutMethod.findMany({
      where: { teacherId: profile.id },
      orderBy: { isDefault: "desc" },
      select: {
        id: true,
        bankName: true,
        accountHolderName: true,
        ibanMasked: true,
        isDefault: true,
        isVerified: true,
        createdAt: true,
      },
    });

    res.json({ data: methods });
  })
);

// 3. إضافة وسيلة سحب جديدة
router.post(
  "/teacher/payout-methods",
  requireAuth("TEACHER"),
  parseBody(addPayoutMethodSchema),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.id },
    });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const method = await addTeacherPayoutMethod(profile.id, req.body);
    res.status(201).json({ data: method, message: "تمت إضافة وسيلة السحب بنجاح" });
  })
);

// 4. تقديم طلب سحب جديد مع حجز الرصيد
router.post(
  "/teacher/withdraw",
  requireAuth("TEACHER"),
  parseBody(submitWithdrawalSchema),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.id },
    });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const withdrawal = await submitWithdrawalRequest(profile.id, req.body);
    res.status(201).json({
      data: withdrawal,
      message: "تم تقديم طلب السحب وحجز الرصيد بنجاح، بانتظار التحويل المالي",
    });
  })
);

// 5. سجل طلبات السحب الخاصة بالمدرس
router.get(
  "/teacher/history",
  requireAuth("TEACHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.id },
    });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const items = await prisma.teacherWithdrawal.findMany({
      where: { teacherId: profile.id },
      orderBy: { createdAt: "desc" },
      include: {
        payoutMethod: {
          select: { bankName: true, accountHolderName: true, ibanMasked: true },
        },
      },
    });

    res.json({ data: items });
  })
);

// ---------- مسارات الإدارة (Admin) ----------

// 6. قائمة جميع طلبات السحب للإدارة
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
      prisma.teacherWithdrawal.count({ where: where as never }),
      prisma.teacherWithdrawal.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: {
          teacher: {
            include: {
              user: { select: { id: true, fullName: true, username: true, email: true, whatsapp: true } },
            },
          },
          payoutMethod: true,
          reviewer: { select: { id: true, fullName: true, username: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);

    res.json({ data: items, meta: pageMeta(total, page, limit) });
  })
);

// 7. مراجعة طلب السحب من الإدارة (اعتماد أو رفض مع تحرير الرصيد)
router.patch(
  "/admin/:id/review",
  requireAuth("ADMIN"),
  parseBody(reviewWithdrawalSchema),
  asyncHandler(async (req, res) => {
    const updated = await reviewWithdrawalRequest(req.params.id, req.user!.id, req.body);
    res.json({ data: updated, message: "تمت مراجعة طلب السحب بنجاح" });
  })
);

// 8. تنفيذ صرف الحوالة البنكية للمدرس
router.post(
  "/admin/:id/execute",
  requireAuth("ADMIN"),
  parseBody(executeWithdrawalSchema),
  asyncHandler(async (req, res) => {
    const executed = await executeWithdrawalTransfer(req.params.id, req.user!.id, {
      transferProofUrl: req.body.transferProofUrl,
      transferReferenceNo: req.body.transferReferenceNo,
      transferredAt: req.body.transferredAt ? new Date(req.body.transferredAt) : undefined,
      adminNotes: req.body.adminNotes,
    });
    res.json({ data: executed, message: "تم توثيق تنفيذ حوالة السحب البنكية بنجاح" });
  })
);

// 9. تفاصيل طلب سحب محدد
router.get(
  "/:id",
  requireAuth("TEACHER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const withdrawal = await prisma.teacherWithdrawal.findUnique({
      where: { id: req.params.id },
      include: {
        teacher: { include: { user: { select: { fullName: true, email: true } } } },
        payoutMethod: true,
        reviewer: { select: { fullName: true } },
      },
    });

    if (!withdrawal) throw notFound("طلب السحب غير موجود");
    if (req.user!.role === "TEACHER") {
      const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
      if (withdrawal.teacherId !== profile?.id) {
        throw forbidden("لا تملك صلاحية عرض هذا الطلب");
      }
    }

    res.json({ data: withdrawal });
  })
);

export default router;
