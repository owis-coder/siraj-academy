import { Router } from "express";
import { prisma } from "../lib/prisma";
import { getSettings } from "../lib/settings";
import { notifyAdmins, notifyUsers } from "../lib/notify";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { pageMeta, skipTake } from "../validation/common";
import { multerSingle, uploadReceipt } from "../middleware/upload";
import type { Order } from "@prisma/client";

const router = Router();

// وصول الطلب: صاحبه أو الإدارة أو المدرس المستفيد
async function loadOrderWithAccess(orderId: string, user: NonNullable<import("express").Request["user"]>) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      student: { select: { id: true, fullName: true, username: true, whatsapp: true } },
      provider: { include: { user: { select: { id: true, fullName: true, username: true } } } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) throw notFound("الطلب غير موجود");

  const isOwner = order.studentId === user.id;
  const isAdmin = user.role === "ADMIN";
  const isProvider = !!order.provider?.user && order.provider.user.id === user.id;
  if (!isOwner && !isAdmin && !isProvider) throw forbidden("لا تملك صلاحية الوصول لهذا الطلب");

  return { order, isOwner, isAdmin, isProvider };
}

// ---------- قائمة الطلبات ----------
router.get(
  "/",
  requireAuth("STUDENT", "TEACHER", "ADMIN"),
  parseQuerySafe(),
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1) || 1;
    const limit = Math.min(50, Number(req.query.limit ?? 20) || 20);
    const user = req.user!;

    const where: Record<string, unknown> = {};
    if (user.role === "STUDENT") {
      where.studentId = user.id;
    } else if (user.role === "TEACHER") {
      // طلبات المدرس: طرد المزوّد = ملفه
      const profile = await prisma.teacherProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
      where.providerId = profile?.id ?? "none";
    } else if (req.query.scope !== "all") {
      // الإدارة ترى الكل افتراضيًا في /admin/orders؛ هنا أيضاً الكل دون ترشيح
    }

    const [total, items] = await Promise.all([
      prisma.order.count({ where: where as never }),
      prisma.order.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: {
          payments: { select: { id: true, status: true, createdAt: true, receiptUrl: true } },
          student: { select: { fullName: true, username: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);

    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);

function parseQuerySafe() {
  return (_req: unknown, _res: unknown, next: (err?: unknown) => void) => next();
}

// ---------- تفاصيل طلب + تعليمات الدفع من الإعدادات ----------
router.get(
  "/:id",
  requireAuth("STUDENT", "TEACHER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { order } = await loadOrderWithAccess(req.params.id, req.user!);

    let paymentInfo: Record<string, string | string[]> | undefined;
    if (order.status === "AWAITING_PAYMENT") {
      const s = await getSettings();
      const whatsappRows = (s.whatsapp_numbers || "").replace(/^\[|\]$/g, "");
      paymentInfo = {
        amount: String(order.amount),
        orderNo: order.orderNo,
        iban: s.iban,
        bank_name: s.bank_name,
        telegram_link: s.telegram_link,
        whatsapp_numbers: (/^\s*\[/.test(s.whatsapp_numbers || "")) ? tryParseList(s.whatsapp_numbers) : whatsappRows.split(",").map((x) => x.trim()).filter(Boolean),
        payment_instructions: s.payment_instructions,
      };
    }

    res.json({
      data: {
        ...order,
        order,
        paymentInfo,
      },
    });
  }),
);

function tryParseList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // تجاهل
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// ---------- رفع سند الحوالة (صاحب الطلب، صورة) ----------
// لا نجاح تلقائي إطلاقًا: الطلب يصبح AWAITING_REVIEW حتى تُعتمد الإدارة السند.
router.post(
  "/:id/receipt",
  requireAuth("STUDENT"),
  multerSingle("receipt", uploadReceipt),
  asyncHandler(async (req, res) => {
    const { order } = await loadOrderWithAccess(req.params.id, req.user!);
    if (order.studentId !== req.user!.id) throw forbidden("رفع السند متاح لصاحب الطلب فقط");
    if (order.status === "AWAITING_REVIEW") throw badRequest("تم رفع سند مسبقًا وبانتظار مراجعة الإدارة");
    if (order.status === "PAID") throw badRequest("الطلب مكتمل الدفع");
    if (order.status !== "AWAITING_PAYMENT") throw badRequest("لا يمكن رفع سند على طلب بوضعه الحالي");

    const file = req.file;
    if (!file) throw badRequest("أرفق صورة السند في الحقل receipt");

    const receiptUrl = `/uploads/${file.filename}`;

    const [payment] = await Promise.all([
      prisma.payment.create({
        data: {
          orderId: order.id,
          method: "TRANSFER",
          receiptUrl,
          status: "UNDER_REVIEW",
        },
      }),
      prisma.order.update({ where: { id: order.id }, data: { status: "AWAITING_REVIEW" } }),
    ]);

    await notifyAdmins({
      title: "سند حوالة جديد بانتظار المراجعة",
      body: `${req.user!.fullName} رفع سندًا للطلب ${order.orderNo} بمبلغ ${order.amount} ريال.`,
      link: `/admin/payments?status=UNDER_REVIEW`,
      type: "PAYMENT_SUBMITTED",
    });
    await notifyUsers({
      userIds: [order.studentId],
      title: "استلمنا سندك",
      body: `سند الطلب ${order.orderNo} بانتظار مراجعة الإدارة، وسنخبرك بالنتيجة قريبًا.`,
      type: "PAYMENT_SUBMITTED",
    });

    res.status(201).json({
      data: { payment, message: "تم رفع السند؛ الدفع لا يُعد مكتملًا حتى اعتماد الإدارة." },
    });
  }),
);

// إلغاء طلب معلّق (صاحبه، قبل مراجعة السند)
router.post(
  "/:id/cancel",
  requireAuth("STUDENT", "ADMIN"),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw notFound("الطلب غير موجود");
    const isOwner = order.studentId === req.user!.id;
    if (!isOwner && req.user!.role !== "ADMIN") throw forbidden("الإلغاء متاح لصاحب الطلب");

    if (order.status !== "AWAITING_PAYMENT") {
      throw badRequest("لا يمكن إلغاء الطلب إلا وهو بانتظار الدفع");
    }
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
    await cancelLiveBookings(order);
    res.json({ data: updated });
  }),
);

// إلغاء حجوزات الجلسات المعلقة بطلبان ملغاة/مرفوضة
async function cancelLiveBookings(order: Order) {
  await prisma.liveBooking.updateMany({
    where: { orderId: order.id },
    data: { status: "CANCELLED" },
  });
}

export default router;
