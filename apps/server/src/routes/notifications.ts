import { Router } from "express";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// إشعاراتي
router.get(
  "/",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
    ]);
    res.json({ data: items, meta: { total: items.length, unread } });
  }),
);

// قراءة إشعار واحد
router.post(
  "/:id/read",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== req.user!.id) throw notFound("الإشعار غير موجود");
    await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
    res.json({ data: { message: "تم وضع علامة مقروء" } });
  }),
);

// قراءة الكل
router.post(
  "/read-all",
  requireAuth(),
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ data: { message: "قراءة جميع الإشعارات" } });
  }),
);

export default router;
