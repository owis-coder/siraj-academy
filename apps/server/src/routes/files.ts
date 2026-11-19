import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { forbidden, notFound } from "../lib/errors";
import { optionalAuth, type AuthUser } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { UPLOAD_ROOT } from "../middleware/upload";

// خدمة الملفات المرفوعة بعد تفويض فعلي — لا مجلد مفتوح للعموم.
// الوصول المسموح: الرافع نفسه، الإدارة، وصاحب العلاقة في السجل (سند/مرفق/إعلان).
const router = Router();

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

const ROOT = path.resolve(UPLOAD_ROOT);

// صور الكتالوج العامة (شعار جامعة أو غلاف مقرر) مقصودة للعرض للجميع
async function isPublicCatalogImage(url: string): Promise<boolean> {
  const [university, course] = await Promise.all([
    prisma.university.findFirst({ where: { logoUrl: url }, select: { id: true } }),
    prisma.course.findFirst({ where: { coverUrl: url }, select: { id: true } }),
  ]);
  return !!university || !!course;
}

async function isApprovedAdImage(url: string): Promise<boolean> {
  const ad = await prisma.ad.findFirst({ where: { imageUrl: url, status: "APPROVED" }, select: { id: true } });
  return !!ad;
}

async function canAccess(url: string, name: string, user: AuthUser | undefined): Promise<boolean> {
  // الزائر: الصور العامة فقط
  if (!user) {
    return (await isPublicCatalogImage(url)) || (await isApprovedAdImage(url));
  }

  if (user.role === "ADMIN") return true;
  // البادئة تحمل معرّف الرافع (اسم عشوائي غير قابل للتخمين) — مالك الملف يصل دائمًا
  if (name.startsWith(`${user.id}-`)) return true;

  const [payment, message, ad, teacherDocs, requestRows] = await Promise.all([
    prisma.payment.findFirst({
      where: { receiptUrl: url },
      select: { order: { select: { studentId: true, provider: { select: { userId: true } } } } },
    }),
    prisma.message.findFirst({ where: { attachmentUrl: url }, select: { roomId: true } }),
    prisma.ad.findFirst({ where: { imageUrl: url }, select: { status: true, teacher: { select: { userId: true } } } }),
    // وثائق تحقق المدرس: خاصة — لصاحب الملف والإدارة فقط
    prisma.teacherProfile.findFirst({ where: { docsUrl: url }, select: { userId: true } }),
    prisma.$queryRaw<Array<{ studentId: string; status: string }>>`
      SELECT "studentId", "status" FROM "ExplainRequest"
      WHERE "attachments"::text LIKE ${"%" + url + "%"}
      LIMIT 1
    `,
  ]);

  // سند الحوالة: صاحب الطلب أو المدرس المستفيد فقط
  if (payment) {
    return payment.order.studentId === user.id || payment.order.provider?.userId === user.id;
  }

  // مرفق محادثة: مشاركو الغرفة فقط
  if (message) {
    const participant = await prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId: message.roomId, userId: user.id } },
      select: { id: true },
    });
    return !!participant;
  }

  // صورة إعلان: الظهور للجميع بعد الاعتماد، وقبل ذلك للمدرس صاحب الإعلان
  if (ad) return ad.status === "APPROVED" || ad.teacher.userId === user.id;

  // وثائق تحقق المدرس: صاحبها فقط (الإدارة مرّت من الأعلى)
  if (teacherDocs) return teacherDocs.userId === user.id;

  if (await isPublicCatalogImage(url)) return true;

  // مرفقات طلب شرح: صاحب الطلب، أو أي مستخدم مسجل للطلبات غير المحجوبة (المفتوحة والمُختارة)
  if (requestRows.length > 0) {
    const row = requestRows[0];
    return row.studentId === user.id || (row.status !== "PENDING_REVIEW" && row.status !== "REJECTED");
  }

  return false;
}

router.get(
  "/:filename",
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const raw = String(req.params.filename ?? "");
    const name = path.basename(raw);
    // منع اجتياز المسارات والأسماء المخفية
    if (!name || name !== raw || name.startsWith(".")) throw notFound("الملف غير موجود");

    const absolute = path.resolve(ROOT, name);
    if (!absolute.startsWith(ROOT + path.sep)) throw notFound("الملف غير موجود");

    const mime = MIME_BY_EXT[path.extname(name).toLowerCase()];
    if (!mime) throw notFound("الملف غير موجود");
    if (!fs.existsSync(absolute)) throw notFound("الملف غير موجود");

    const allowed = await canAccess(`/uploads/${name}`, name, req.user);
    if (!allowed) throw forbidden("لا تملك صلاحية الوصول لهذا الملف");

    res.setHeader("Content-Type", mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader(
      "Content-Disposition",
      mime === "application/pdf" || mime === "application/zip" ? `attachment; filename="${name}"` : "inline",
    );

    res.sendFile(name, { root: ROOT, dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ message: "الملف غير موجود" });
      }
    });
  }),
);

export default router;
