import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { notFound, badRequest } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { audit } from "../lib/audit";
import { notifyUsers } from "../lib/notify";

/**
 * علامة التوثيق الزرقاء — تمنحها الإدارة فقط.
 * لا تُمنح تلقائيًا عند التسجيل، وتوثيق البريد الإلكتروني شيء مختلف تمامًا.
 */
const router = Router();

router.use(requireAuth("ADMIN"));

const verifySchema = z
  .object({
    verified: z.boolean(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

router.post(
  "/:userId",
  parseBody(verifySchema),
  asyncHandler(async (req, res) => {
    const { verified, note } = req.body as { verified: boolean; note?: string };
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, fullName: true, role: true, isVerified: true },
    });
    if (!user) throw notFound("المستخدم غير موجود");
    if (user.role === "ADMIN") throw badRequest("حسابات الإدارة لا تحتاج علامة توثيق");

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: verified,
        isVerifiedAt: verified ? new Date() : null,
        isVerifiedById: verified ? req.user!.id : null,
      },
      select: { id: true, isVerified: true, isVerifiedAt: true },
    });

    await audit({
      req,
      userId: req.user!.id,
      actorRole: req.user!.role,
      action: verified ? "USER_VERIFIED" : "USER_UNVERIFIED",
      category: "ADMIN",
      targetType: "User",
      targetId: user.id,
      oldValues: { isVerified: user.isVerified },
      newValues: { isVerified: verified, note: note ?? null },
    });

    if (verified) {
      await notifyUsers({
        userIds: [user.id],
        title: "تم توثيق حسابك",
        body: "منحت إدارة أكاديمية سراج علامة التوثيق الزرقاء لحسابك.",
        type: "ACCOUNT_VERIFIED",
      }).catch(() => undefined);
    }

    res.json({ data: updated, message: verified ? "مُنحت علامة التوثيق" : "أُزيلت علامة التوثيق" });
  }),
);

export default router;
