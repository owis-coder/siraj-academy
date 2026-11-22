import os from "os";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { prisma } from "./prisma";
import { getDriveService, DriveNotConfiguredError } from "./googleDriveStorage";
import { getOrCreateCategoryFolder } from "./driveFolders";
import {
  buildStoredFileName,
  sanitizeOriginalFileName,
  sha256File,
  CATEGORY_FOLDER,
} from "./fileSecurity";
import type { Role } from "@prisma/client";

/**
 * تنسيق رفع الملفات إلى Drive + قاعدة البيانات.
 *
 * الترتيب الآمن:
 *   PENDING (سجل) → UPLOADING → رفع Drive → تأكيد الوجود → UPLOADED
 * عند فشل Drive: FAILED (مع إبقاء نسخة مؤقتة لإعادة المحاولة).
 * عند فشل قاعدة البيانات بعد نجاح Drive: يُحذف ملف Drive تعويضيًا.
 * لا يُعلن أي ملف مكتملًا قبل تأكيد Drive.
 */

export const STAGING_DIR = path.resolve(
  process.env.UPLOAD_STAGING_DIR || path.join(os.tmpdir(), "siraj-drive-staging"),
);

if (!fs.existsSync(STAGING_DIR)) {
  try {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  } catch {
    // إن تعذر إنشاء المجلد سيظهر خطأ واضح عند أول رفع
  }
}

export function stagingPathFor(fileId: string): string {
  return path.join(STAGING_DIR, `${fileId}.bin`);
}

export type FileCategoryKey = keyof typeof CATEGORY_FOLDER;

export type CreateStoredFileInput = {
  ownerUserId: string;
  ownerRole: Role;
  tempFilePath: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  category: FileCategoryKey;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  idempotencyKey?: string | null;
  actorRole?: Role;
  ip?: string | null;
  userAgent?: string | null;
};

export async function logFileAccess(input: {
  fileId?: string | null;
  actorUserId?: string | null;
  actorRole?: Role | null;
  action: "VIEW" | "DOWNLOAD" | "DELETE" | "REVIEW" | "UPLOAD" | "RETRY";
  ip?: string | null;
  userAgent?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await prisma.fileAccessLog.create({
      data: {
        fileId: input.fileId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        ip: input.ip?.slice(0, 80) ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
        detail: input.detail?.slice(0, 500) ?? null,
      },
    });
  } catch {
    // سجل الوصول لا يجب أن يُسقط العملية الأساسية
  }
}

/**
 * التحقق من أن المستخدم يملك صلة بالمرفق المطلوب ربطه.
 * لا يُقبل relatedEntityId إلا بعد إثبات الملكية على الخادم.
 */
export async function assertRelatedEntity(
  userId: string,
  role: Role,
  relatedEntityType?: string | null,
  relatedEntityId?: string | null,
): Promise<void> {
  if (!relatedEntityType || !relatedEntityId) return;
  if (role === "ADMIN") return;

  const deny = () => {
    throw Object.assign(new Error("لا تملك صلاحية ربط الملف بهذا العنصر"), { status: 403 });
  };

  switch (relatedEntityType) {
    case "ORDER": {
      const order = await prisma.order.findUnique({ where: { id: relatedEntityId }, select: { studentId: true } });
      if (!order) deny();
      if (role === "STUDENT" && order!.studentId !== userId) deny();
      return;
    }
    case "PAYMENT": {
      const payment = await prisma.payment.findUnique({
        where: { id: relatedEntityId },
        select: { order: { select: { studentId: true } } },
      });
      if (!payment) deny();
      if (role === "STUDENT" && payment!.order.studentId !== userId) deny();
      return;
    }
    case "EXPLAIN_REQUEST": {
      const row = await prisma.explainRequest.findUnique({
        where: { id: relatedEntityId },
        select: { studentId: true },
      });
      if (!row) deny();
      if (row!.studentId !== userId) deny();
      return;
    }
    case "CUSTOM_REQUEST": {
      const row = await prisma.customServiceRequest.findUnique({
        where: { id: relatedEntityId },
        select: { userId: true },
      });
      if (!row) deny();
      if (row!.userId !== userId) deny();
      return;
    }
    case "OFFERING": {
      const row = await prisma.courseOffering.findUnique({
        where: { id: relatedEntityId },
        select: { teacher: { select: { userId: true } } },
      });
      if (!row) deny();
      if (role === "TEACHER" && row!.teacher.userId !== userId) deny();
      return;
    }
    case "LESSON": {
      const row = await prisma.lesson.findUnique({
        where: { id: relatedEntityId },
        select: { offering: { select: { teacher: { select: { userId: true } } } } },
      });
      if (!row) deny();
      if (role === "TEACHER" && row!.offering.teacher.userId !== userId) deny();
      return;
    }
    case "OFFER": {
      const row = await prisma.offer.findUnique({
        where: { id: relatedEntityId },
        select: { teacher: { select: { userId: true } } },
      });
      if (!row) deny();
      if (role === "TEACHER" && row!.teacher.userId !== userId) deny();
      return;
    }
    default:
      // أنواع أخرى مسموحة بلا تحقق ملكية (مثل إعلان/وثيقة تحقق) — يقيدها دور المستخدم
      return;
  }
}

async function markFailed(fileId: string, reason: string): Promise<void> {
  await prisma.storedFile
    .update({ where: { id: fileId }, data: { uploadStatus: "FAILED", failureReason: reason.slice(0, 400) } })
    .catch(() => undefined);
}

export async function createStoredFile(input: CreateStoredFileInput): Promise<{
  id: string;
  uploadStatus: string;
  reviewStatus: string;
  originalFileName: string;
  storedFileName: string;
  fileSize: number;
  mimeType: string;
  category: string;
  ownerUserId: string;
  driveFileId?: string | null;
}> {
  // 1) Idempotency: نفس المفتاح يعيد نفس السجل بلا رفع مكرر
  if (input.idempotencyKey) {
    const existing = await prisma.storedFile.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing && existing.ownerUserId === input.ownerUserId) {
      return existing;
    }
  }

  const storedFileName = buildStoredFileName(input.originalFileName);
  const originalFileName = sanitizeOriginalFileName(input.originalFileName);

  // 2) سجل PENDING قبل أي اتصال بـ Drive
  let record;
  try {
    record = await prisma.storedFile.create({
      data: {
        ownerUserId: input.ownerUserId,
        ownerRole: input.ownerRole,
        originalFileName,
        storedFileName,
        mimeType: input.mimeType,
        fileSize: input.size,
        category: input.category as never,
        driveFolderType: input.category as never,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        uploadStatus: "PENDING",
        reviewStatus: "PENDING_REVIEW",
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002" && input.idempotencyKey) {
      const again = await prisma.storedFile.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (again) return again;
    }
    throw err;
  }

  // 3) نقل الملف المؤقت إلى مكان ثابت يمكن إعادة المحاولة منه
  const staging = stagingPathFor(record.id);
  try {
    fs.renameSync(input.tempFilePath, staging);
  } catch {
    try {
      fs.copyFileSync(input.tempFilePath, staging);
      fs.unlinkSync(input.tempFilePath);
    } catch {
      await markFailed(record.id, "تعذر تجهيز الملف المؤقت على الخادم");
      throw Object.assign(new Error("تعذر تجهيز الملف على الخادم"), { status: 500 });
    }
  }

  let driveFileId: string | null = null;
  try {
    const folderId = await getOrCreateCategoryFolder(input.ownerUserId, input.category as never);

    await prisma.storedFile.update({
      where: { id: record.id },
      data: { uploadStatus: "UPLOADING", driveFolderId: folderId },
    });

    const checksum = await sha256File(staging);
    const drive = getDriveService();
    const uploaded = await drive.uploadFromPath({
      filePath: staging,
      name: storedFileName,
      parentId: folderId,
      mimeType: input.mimeType,
      size: input.size,
      appProperties: {
        sirajFileId: record.id,
        sirajUserId: input.ownerUserId,
        sirajRole: input.ownerRole,
        sirajCategory: input.category,
      },
      onSession: async (sessionUrl) => {
        await prisma.storedFile.update({ where: { id: record.id }, data: { uploadSessionUrl: sessionUrl } }).catch(() => undefined);
      },
    });
    driveFileId = uploaded.id;

    // 4) تأكيد فعلي من Drive قبل إعلان الاكتمال
    const confirmed = await drive.getFile(uploaded.id);

    try {
      const saved = await prisma.storedFile.update({
        where: { id: record.id },
        data: {
          uploadStatus: "UPLOADED",
          driveFileId: confirmed.id,
          checksumSha256: checksum,
          uploadedAt: new Date(),
          uploadSessionUrl: null,
          failureReason: null,
        },
      });
      fs.promises.unlink(staging).catch(() => undefined);
      await logFileAccess({
        fileId: saved.id,
        actorUserId: input.ownerUserId,
        actorRole: input.actorRole ?? input.ownerRole,
        action: "UPLOAD",
        ip: input.ip,
        userAgent: input.userAgent,
        detail: `${input.category} · ${input.size} bytes`,
      });
      return saved;
    } catch (dbErr) {
      // فشل قاعدة البيانات بعد نجاح Drive → إزالة تعويضية لتفادي يتيم في Drive
      await drive.deleteFile(confirmed.id).catch(() => undefined);
      await markFailed(record.id, "فشل حفظ بيانات الملف بعد الرفع");
      throw dbErr;
    }
  } catch (err) {
    if (err instanceof DriveNotConfiguredError) {
      await markFailed(record.id, "Google Drive غير مهيأ على الخادم");
      throw Object.assign(new Error("تخزين Google Drive غير مهيأ على الخادم — أبلغ الإدارة"), { status: 503 });
    }
    await markFailed(record.id, err instanceof Error ? err.message : "فشل الرفع إلى Google Drive");
    throw Object.assign(new Error("تعذر رفع الملف إلى التخزين المركزي — أعد المحاولة"), {
      status: 502,
      fileId: record.id,
    });
  }
}

/** إعادة محاولة رفع فاشل إن كانت النسخة المصدرية المؤقتة موجودة */
export async function retryStoredFile(fileId: string, actorRole: Role): Promise<{ status: string }> {
  const record = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!record) throw Object.assign(new Error("الملف غير موجود"), { status: 404 });
  if (record.uploadStatus === "UPLOADED") return { status: "UPLOADED" };
  if (record.uploadStatus === "DELETED") throw Object.assign(new Error("الملف محذوف"), { status: 409 });

  const staging = stagingPathFor(record.id);
  if (!fs.existsSync(staging)) {
    throw Object.assign(
      new Error("النسخة المصدرية غير متاحة — يلزم إعادة الرفع من المستخدم"),
      { status: 409 },
    );
  }

  const folderId = await getOrCreateCategoryFolder(record.ownerUserId, record.category as never);
  await prisma.storedFile.update({
    where: { id: record.id },
    data: { uploadStatus: "UPLOADING", driveFolderId: folderId, failureReason: null },
  });

  try {
    const drive = getDriveService();
    const uploaded = await drive.uploadFromPath({
      filePath: staging,
      name: record.storedFileName,
      parentId: folderId,
      mimeType: record.mimeType,
      size: record.fileSize,
      existingSessionUrl: record.uploadSessionUrl,
      appProperties: {
        sirajFileId: record.id,
        sirajUserId: record.ownerUserId,
        sirajRole: record.ownerRole,
        sirajCategory: String(record.category),
      },
      onSession: async (sessionUrl) => {
        await prisma.storedFile.update({ where: { id: record.id }, data: { uploadSessionUrl: sessionUrl } }).catch(() => undefined);
      },
    });
    await prisma.storedFile.update({
      where: { id: record.id },
      data: {
        uploadStatus: "UPLOADED",
        driveFileId: uploaded.id,
        uploadedAt: new Date(),
        uploadSessionUrl: null,
        failureReason: null,
      },
    });
    fs.promises.unlink(staging).catch(() => undefined);
    await logFileAccess({ fileId: record.id, actorRole, action: "RETRY", detail: "re-upload succeeded" });
    return { status: "UPLOADED" };
  } catch (err) {
    await markFailed(record.id, err instanceof Error ? err.message : "فشل إعادة المحاولة");
    throw Object.assign(new Error("تعذر إعادة رفع الملف إلى Drive"), { status: 502 });
  }
}

/** حذف وفق سياسة الاحتفاظ: DELETE_PENDING → حذف Drive → DELETED (يبقى سجل البيانات الوصفية) */
export async function deleteStoredFile(
  fileId: string,
  actor: { id: string; role: Role },
  reason: string,
): Promise<void> {
  const record = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!record) throw Object.assign(new Error("الملف غير موجود"), { status: 404 });
  if (record.uploadStatus === "DELETED") return;

  await prisma.storedFile.update({
    where: { id: fileId },
    data: { uploadStatus: "DELETE_PENDING", failureReason: reason.slice(0, 400) },
  });

  try {
    if (record.driveFileId) {
      await getDriveService().deleteFile(record.driveFileId);
    }
    fs.promises.unlink(stagingPathFor(fileId)).catch(() => undefined);
    await prisma.storedFile.update({
      where: { id: fileId },
      data: { uploadStatus: "DELETED", deletedAt: new Date() },
    });
    await logFileAccess({
      fileId,
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "DELETE",
      detail: reason,
    });
  } catch {
    // يبقى DELETE_PENDING للمصالحة الدورية — لا نحذف السجل أبدًا
    throw Object.assign(new Error("تعذر حذف الملف من Drive؛ بقي بحالة حذف معلّق"), { status: 502 });
  }
}

/**
 * مصالحة دورية: تقارن سجلات قاعدة البيانات بمحتوى Drive.
 * لا تحذف شيئًا تلقائيًا — تُعيد تقريرًا للمراجعة الإدارية.
 */
export async function reconcileStorage(options?: { userId?: string }): Promise<{
  checkedFolders: number;
  checkedFiles: number;
  missingInDrive: Array<{ id: string; originalFileName: string; driveFileId: string | null }>;
  missingInDatabase: Array<{ driveFileId: string; name: string; folderId: string }>;
  pendingUploads: number;
  pendingDeletes: number;
  orphanRecords: number;
}> {
  const drive = getDriveService();
  const folders = await prisma.userDriveFolder.findMany({
    where: {
      folderType: { notIn: ["STUDENTS", "TEACHERS", "ADMIN_DOCUMENTS", "ROOT"] },
      ...(options?.userId ? { userId: options.userId } : {}),
    },
  });

  const missingInDrive: Array<{ id: string; originalFileName: string; driveFileId: string | null }> = [];
  const missingInDatabase: Array<{ driveFileId: string; name: string; folderId: string }> = [];
  const seenDriveIds = new Set<string>();
  let checkedFiles = 0;

  for (const folder of folders) {
    let children: Awaited<ReturnType<typeof drive.listChildren>>;
    try {
      children = await drive.listChildren(folder.driveFolderId);
    } catch {
      continue;
    }
    const records = await prisma.storedFile.findMany({
      where: { driveFolderId: folder.driveFolderId, uploadStatus: { in: ["UPLOADED", "DELETE_PENDING"] } },
    });
    const recordIds = new Set(records.map((r) => r.driveFileId).filter(Boolean) as string[]);

    for (const child of children) {
      if (child.mimeType === "application/vnd.google-apps.folder") continue;
      seenDriveIds.add(child.id);
      if (!recordIds.has(child.id)) {
        missingInDatabase.push({ driveFileId: child.id, name: child.name, folderId: folder.driveFolderId });
      }
    }
    for (const record of records) {
      checkedFiles += 1;
      if (record.uploadStatus === "UPLOADED") {
        if (!record.driveFileId || !children.some((c) => c.id === record.driveFileId)) {
          missingInDrive.push({
            id: record.id,
            originalFileName: record.originalFileName,
            driveFileId: record.driveFileId,
          });
        }
      }
    }
  }

  const [pendingUploads, pendingDeletes, orphanRecords] = await Promise.all([
    prisma.storedFile.count({ where: { uploadStatus: { in: ["PENDING", "UPLOADING", "FAILED"] } } }),
    prisma.storedFile.count({ where: { uploadStatus: "DELETE_PENDING" } }),
    prisma.storedFile.count({ where: { uploadStatus: "UPLOADED", driveFileId: null } }),
  ]);

  return {
    checkedFolders: folders.length,
    checkedFiles,
    missingInDrive,
    missingInDatabase,
    pendingUploads,
    pendingDeletes,
    orphanRecords,
  };
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
