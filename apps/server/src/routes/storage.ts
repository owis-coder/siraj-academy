import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { pageMeta, skipTake } from "../validation/common";
import { audit } from "../lib/audit";
import {
  MAX_FILES_PER_REQUEST,
  categoryAllowedForRole,
  discardTempFile,
  getMaxFileSizeBytes,
  validateUploadedFile,
} from "../lib/fileSecurity";
import {
  STAGING_DIR,
  assertRelatedEntity,
  createStoredFile,
  deleteStoredFile,
  logFileAccess,
  reconcileStorage,
  retryStoredFile,
} from "../lib/storedFiles";
import { getDriveService, DriveNotConfiguredError } from "../lib/googleDriveStorage";
import { driveConfigStatus } from "../lib/googleDriveConfig";

const MB = 1024 * 1024;
const HARD_CAP = Number(process.env.MAX_FILE_SIZE_HARD_CAP_MB || 500) * MB;

const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STAGING_DIR),
    filename: (_req, _file, cb) => cb(null, `tmp-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`),
  }),
  limits: { fileSize: HARD_CAP, files: MAX_FILES_PER_REQUEST },
});

function ipOf(req: { ip?: string; headers: Record<string, unknown> }): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? req.ip ?? null;
  return req.ip ?? null;
}

function fileMeta(file: {
  id: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileSize: number;
  category: string;
  uploadStatus: string;
  reviewStatus: string;
  reviewNote?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  createdAt: Date;
  uploadedAt?: Date | null;
}) {
  // لا Drive URL ولا folder id ولا معرف ملف Drive — بيانات وصفية فقط
  return {
    id: file.id,
    originalFileName: file.originalFileName,
    storedFileName: file.storedFileName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    category: file.category,
    uploadStatus: file.uploadStatus,
    reviewStatus: file.reviewStatus,
    reviewNote: file.reviewNote ?? null,
    relatedEntityType: file.relatedEntityType ?? null,
    relatedEntityId: file.relatedEntityId ?? null,
    createdAt: file.createdAt,
    uploadedAt: file.uploadedAt ?? null,
  };
}

// ============================================================
// مسارات المستخدم (طالب/مدرس/أدمن): /api/v1/files
// ============================================================
const router = Router();

router.post(
  "/",
  requireAuth(),
  diskUpload.array("files", MAX_FILES_PER_REQUEST),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest("أرفق ملفًا واحدًا على الأقل في الحقل files");

    const category = String(req.body?.category ?? "").trim().toUpperCase();
    if (!category) {
      files.forEach((f) => discardTempFile(f.path));
      throw badRequest("حدد تصنيف الملف (category)");
    }
    if (!categoryAllowedForRole(req.user!.role, category)) {
      files.forEach((f) => discardTempFile(f.path));
      throw forbidden("هذا التصنيف غير متاح لدورك");
    }

    const relatedEntityType = req.body?.relatedEntityType ? String(req.body.relatedEntityType) : null;
    const relatedEntityId = req.body?.relatedEntityId ? String(req.body.relatedEntityId) : null;
    const idempotencyKey =
      (req.header("x-idempotency-key") || String(req.body?.idempotencyKey || "")).trim() || null;

    try {
      await assertRelatedEntity(req.user!.id, req.user!.role, relatedEntityType, relatedEntityId);
    } catch (err) {
      files.forEach((f) => discardTempFile(f.path));
      throw err;
    }

    const maxBytes = await getMaxFileSizeBytes();
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    // حد إجمالي منطقي للعملية الواحدة (حماية من استنزاف التخزين) — بحد أقصى 600MB
    const totalLimit = Math.min(maxBytes * 3, 600 * MB);
    if (totalBytes > totalLimit) {
      files.forEach((f) => discardTempFile(f.path));
      throw badRequest(`الحجم الإجمالي للملفات يتجاوز الحد المسموح (${Math.round(totalLimit / MB)} ميجابايت)`);
    }

    const saved: ReturnType<typeof fileMeta>[] = [];
    const failed: Array<{ originalFileName: string; reason: string }> = [];

    for (const file of files) {
      const validation = await validateUploadedFile({
        path: file.path,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
      if (!validation.ok) {
        discardTempFile(file.path);
        failed.push({ originalFileName: file.originalname, reason: validation.reason });
        continue;
      }

      try {
        const record = await createStoredFile({
          ownerUserId: req.user!.id,
          ownerRole: req.user!.role,
          tempFilePath: file.path,
          originalFileName: file.originalname,
          mimeType: validation.mimeType,
          size: validation.size,
          category: category as never,
          relatedEntityType,
          relatedEntityId,
          idempotencyKey: files.length === 1 ? idempotencyKey : idempotencyKey ? `${idempotencyKey}:${saved.length}` : null,
          ip: ipOf(req),
          userAgent: req.header("user-agent") ?? null,
        });
        saved.push(fileMeta(record as never));
      } catch (err) {
        discardTempFile(file.path);
        failed.push({
          originalFileName: file.originalname,
          reason: err instanceof Error ? err.message : "فشل الرفع",
        });
      }
    }

    if (saved.length === 0) {
      res.status(502).json({ message: failed[0]?.reason ?? "تعذر رفع الملفات", data: { files: [], failed } });
      return;
    }

    res.status(201).json({
      data: { files: saved, failed },
      message:
        failed.length > 0
          ? `تم رفع ${saved.length} ملفًا وفشل ${failed.length}`
          : "تم رفع الملفات بنجاح",
    });
  }),
);

router.get(
  "/mine",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { category, relatedEntityType, relatedEntityId, page = "1", limit = "50" } = req.query as Record<
      string,
      string | undefined
    >;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const where = {
      ownerUserId: req.user!.id,
      uploadStatus: { not: "DELETED" as never },
      ...(category ? { category: category.toUpperCase() as never } : {}),
      ...(relatedEntityType ? { relatedEntityType } : {}),
      ...(relatedEntityId ? { relatedEntityId } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.storedFile.count({ where }),
      prisma.storedFile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...skipTake(pageNum, limitNum),
      }),
    ]);

    res.json({ data: items.map(fileMeta), meta: pageMeta(total, pageNum, limitNum) });
  }),
);

router.delete(
  "/:id",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const record = await prisma.storedFile.findUnique({ where: { id: req.params.id } });
    if (!record) throw notFound("الملف غير موجود");

    const isAdmin = req.user!.role === "ADMIN";
    if (!isAdmin && record.ownerUserId !== req.user!.id) throw forbidden("لا تملك هذا الملف");
    if (!isAdmin) {
      if (record.reviewStatus === "APPROVED") throw badRequest("لا يمكن حذف ملف معتمد — استخدم طلب حذف موثق");
      if (record.relatedEntityId) throw badRequest("الملف مرتبط بطلب مُرسل؛ قدّم طلب حذف للإدارة");
      if (record.uploadStatus !== "UPLOADED" && record.uploadStatus !== "FAILED") {
        throw badRequest("لا يمكن حذف الملف في حالته الحالية");
      }
    }

    await deleteStoredFile(record.id, { id: req.user!.id, role: req.user!.role }, "cancel-before-submit");
    res.json({ data: { message: "حُذف الملف" } });
  }),
);

// ============================================================
// مسارات الإدارة: /api/v1/admin/storage — ADMIN فقط
// ============================================================
export const storageAdminRouter = Router();

storageAdminRouter.use(requireAuth("ADMIN"));

storageAdminRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const status = driveConfigStatus();
    if (!status.configured) {
      res.json({ data: { configured: false, status, healthy: false } });
      return;
    }
    const health = await getDriveService().healthCheck();
    res.json({ data: { configured: true, status, healthy: health.ok, ...health } });
  }),
);

storageAdminRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const [byRole, byCategory, byStatus, totalSize, recent] = await Promise.all([
      prisma.storedFile.groupBy({
        by: ["ownerRole"],
        where: { uploadStatus: { not: "DELETED" } },
        _count: { _all: true },
        _sum: { fileSize: true },
      }),
      prisma.storedFile.groupBy({
        by: ["category"],
        where: { uploadStatus: { not: "DELETED" } },
        _count: { _all: true },
        _sum: { fileSize: true },
      }),
      prisma.storedFile.groupBy({ by: ["uploadStatus"], _count: { _all: true } }),
      prisma.storedFile.aggregate({
        where: { uploadStatus: { not: "DELETED" } },
        _sum: { fileSize: true },
      }),
      prisma.storedFile.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, originalFileName: true, category: true, ownerRole: true, uploadStatus: true, createdAt: true },
      }),
    ]);

    res.json({
      data: {
        configured: driveConfigStatus().configured,
        totalBytes: totalSize._sum.fileSize ?? 0,
        byRole,
        byCategory,
        byStatus,
        recent,
      },
    });
  }),
);

storageAdminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { role, q, page = "1", limit = "30" } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 30));

    const where = {
      role: (role && ["STUDENT", "TEACHER"].includes(role.toUpperCase()) ? role.toUpperCase() : { in: ["STUDENT", "TEACHER"] }) as never,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" as const } },
              { username: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...skipTake(pageNum, limitNum),
        select: {
          id: true,
          fullName: true,
          username: true,
          email: true,
          role: true,
          isVerified: true,
          createdAt: true,
          driveFolders: { where: { folderType: { in: ["STUDENTS", "TEACHERS"] } }, select: { id: true } },
          _count: { select: { storedFiles: true } },
        },
      }),
    ]);

    res.json({
      data: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        email: u.email,
        role: u.role,
        isVerified: u.isVerified,
        createdAt: u.createdAt,
        hasDriveFolder: u.driveFolders.length > 0,
        filesCount: u._count.storedFiles,
      })),
      meta: pageMeta(total, pageNum, limitNum),
    });
  }),
);

storageAdminRouter.get(
  "/users/:id/folders",
  asyncHandler(async (req, res) => {
    const folders = await prisma.userDriveFolder.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, folderType: true, driveFolderId: true, parentFolderId: true, createdAt: true },
    });
    res.json({ data: folders });
  }),
);

storageAdminRouter.get(
  "/files",
  asyncHandler(async (req, res) => {
    const {
      ownerUserId,
      role,
      category,
      status,
      reviewStatus,
      q,
      relatedEntityId,
      from,
      to,
      page = "1",
      limit = "25",
    } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 25));

    const where = {
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(role ? { ownerRole: role.toUpperCase() as never } : {}),
      ...(category ? { category: category.toUpperCase() as never } : {}),
      ...(status ? { uploadStatus: status.toUpperCase() as never } : {}),
      ...(reviewStatus ? { reviewStatus: reviewStatus.toUpperCase() as never } : {}),
      ...(relatedEntityId ? { relatedEntityId } : {}),
      ...(q ? { originalFileName: { contains: q, mode: "insensitive" as const } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.storedFile.count({ where }),
      prisma.storedFile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...skipTake(pageNum, limitNum),
        include: {
          owner: { select: { id: true, fullName: true, username: true, role: true, isVerified: true } },
        },
      }),
    ]);

    res.json({
      data: items.map((f) => ({
        ...fileMeta(f),
        owner: f.owner,
        driveFileId: f.driveFileId,
        driveFolderId: f.driveFolderId,
        failureReason: f.failureReason,
      })),
      meta: pageMeta(total, pageNum, limitNum),
    });
  }),
);

storageAdminRouter.get(
  "/files/:id",
  asyncHandler(async (req, res) => {
    const record = await prisma.storedFile.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: { id: true, fullName: true, username: true, email: true, role: true, isVerified: true } },
        accessLogs: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, action: true, actorUserId: true, actorRole: true, createdAt: true, detail: true },
        },
      },
    });
    if (!record) throw notFound("الملف غير موجود");
    await logFileAccess({
      fileId: record.id,
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "VIEW",
      ip: ipOf(req),
      userAgent: req.header("user-agent") ?? null,
    });
    res.json({
      data: {
        ...record,
        owner: record.owner,
        accessLogs: record.accessLogs,
      },
    });
  }),
);

storageAdminRouter.get(
  "/files/:id/download",
  asyncHandler(async (req, res) => {
    const record = await prisma.storedFile.findUnique({ where: { id: req.params.id } });
    if (!record) throw notFound("الملف غير موجود");
    if (!record.driveFileId || record.uploadStatus !== "UPLOADED") {
      throw badRequest("الملف غير مرفوع إلى Drive بعد");
    }

    const drive = getDriveService();
    const stream = await drive.download(record.driveFileId);

    await logFileAccess({
      fileId: record.id,
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "DOWNLOAD",
      ip: ipOf(req),
      userAgent: req.header("user-agent") ?? null,
    });

    const asciiFallback = record.storedFileName.replace(/[^\x20-\x7e]/g, "_");
    res.setHeader("Content-Type", stream.mimeType || record.mimeType || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    if (stream.size) res.setHeader("Content-Length", stream.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(record.originalFileName)}`,
    );

    stream.body.on("error", () => {
      if (!res.headersSent) res.status(502).json({ message: "تعذر تنزيل الملف من Drive" });
      else res.end();
    });
    stream.body.pipe(res);
  }),
);

storageAdminRouter.delete(
  "/files/:id",
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason ?? "").trim();
    if (reason.length < 3) throw badRequest("اذكر سبب الحذف (3 أحرف على الأقل)");

    await deleteStoredFile(req.params.id, { id: req.user!.id, role: req.user!.role }, reason);
    await audit({
      req,
      userId: req.user!.id,
      actorRole: req.user!.role,
      action: "STORED_FILE_DELETE",
      category: "ADMIN",
      targetType: "StoredFile",
      targetId: req.params.id,
      newValues: { reason },
    });
    res.json({ data: { message: "حُذف الملف من Drive وبقي سجل البيانات الوصفية" } });
  }),
);

storageAdminRouter.post(
  "/files/:id/review",
  asyncHandler(async (req, res) => {
    const decision = String(req.body?.decision ?? "").toUpperCase();
    if (!["APPROVED", "REJECTED", "NEEDS_REVISION"].includes(decision)) {
      throw badRequest("قرار المراجعة غير صالح");
    }
    const record = await prisma.storedFile.findUnique({ where: { id: req.params.id } });
    if (!record) throw notFound("الملف غير موجود");

    const updated = await prisma.storedFile.update({
      where: { id: record.id },
      data: {
        reviewStatus: decision as never,
        reviewNote: req.body?.note ? String(req.body.note).slice(0, 500) : null,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
    });
    await logFileAccess({
      fileId: record.id,
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "REVIEW",
      detail: decision,
    });
    res.json({ data: fileMeta(updated as never) });
  }),
);

storageAdminRouter.post(
  "/files/:id/retry",
  asyncHandler(async (req, res) => {
    const result = await retryStoredFile(req.params.id, req.user!.role);
    res.json({ data: result, message: "أُعيد رفع الملف إلى Drive" });
  }),
);

storageAdminRouter.post(
  "/reconcile",
  asyncHandler(async (req, res) => {
    const configured = driveConfigStatus().configured;
    if (!configured) throw new DriveNotConfiguredError("Google Drive غير مهيأ");
    const report = await reconcileStorage({
      userId: req.body?.userId ? String(req.body.userId) : undefined,
    });
    res.json({ data: report });
  }),
);

export default router;
