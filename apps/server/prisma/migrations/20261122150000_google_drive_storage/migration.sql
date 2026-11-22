-- Google Drive central storage + admin-only file access + verified badge
-- إضافي وغير هدّام: لا حذف جداول أو أعمدة، ولا تعديل بيانات قائمة.
-- لم يُطبَّق على أي قاعدة بيانات بعد — راجعه ثم طبّقه بموافقة صريحة.

-- 1) Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriveFolderType') THEN
    CREATE TYPE "DriveFolderType" AS ENUM (
      'ROOT', 'STUDENTS', 'TEACHERS', 'ADMIN_DOCUMENTS',
      'PAYMENTS', 'MAIN_FILES', 'CUSTOM_REQUESTS', 'PRIVATE_EXPLANATIONS',
      'COURSE_ATTACHMENTS', 'OTHER_ATTACHMENTS', 'COURSE_MATERIALS',
      'LESSON_FILES', 'VIDEO_REFERENCES', 'SERVICE_ATTACHMENTS', 'ASSIGNMENT_MATERIALS'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FileCategory') THEN
    CREATE TYPE "FileCategory" AS ENUM (
      'PAYMENTS', 'MAIN_FILES', 'CUSTOM_REQUESTS', 'PRIVATE_EXPLANATIONS',
      'COURSE_ATTACHMENTS', 'OTHER_ATTACHMENTS', 'COURSE_MATERIALS',
      'LESSON_FILES', 'VIDEO_REFERENCES', 'SERVICE_ATTACHMENTS', 'ASSIGNMENT_MATERIALS'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoredFileStatus') THEN
    CREATE TYPE "StoredFileStatus" AS ENUM (
      'PENDING', 'UPLOADING', 'UPLOADED', 'FAILED', 'DELETE_PENDING', 'DELETED'
    );
  END IF;
END $$;

-- 2) علامة التوثيق على المستخدم (افتراضيًا غير موثق)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isVerifiedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_isVerifiedById_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_isVerifiedById_fkey"
      FOREIGN KEY ("isVerifiedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3) مجلدات Drive لكل مستخدم
CREATE TABLE IF NOT EXISTS "UserDriveFolder" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "userRole"       "Role" NOT NULL,
  "folderType"     "DriveFolderType" NOT NULL,
  "driveFolderId"  TEXT NOT NULL,
  "parentFolderId" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDriveFolder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserDriveFolder_driveFolderId_key" ON "UserDriveFolder"("driveFolderId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserDriveFolder_userId_folderType_key" ON "UserDriveFolder"("userId", "folderType");
CREATE INDEX IF NOT EXISTS "UserDriveFolder_parentFolderId_idx" ON "UserDriveFolder"("parentFolderId");
CREATE INDEX IF NOT EXISTS "UserDriveFolder_userRole_idx" ON "UserDriveFolder"("userRole");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserDriveFolder_userId_fkey') THEN
    ALTER TABLE "UserDriveFolder"
      ADD CONSTRAINT "UserDriveFolder_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 4) الملفات المخزنة (بيانات وصفية ومعرّفات Drive فقط)
CREATE TABLE IF NOT EXISTS "StoredFile" (
  "id"                TEXT NOT NULL,
  "ownerUserId"       TEXT NOT NULL,
  "ownerRole"         "Role" NOT NULL,
  "originalFileName"  TEXT NOT NULL,
  "storedFileName"    TEXT NOT NULL,
  "mimeType"          TEXT NOT NULL,
  "fileSize"          INTEGER NOT NULL,
  "checksumSha256"    TEXT,
  "driveFileId"       TEXT,
  "driveFolderId"     TEXT,
  "driveFolderType"   "DriveFolderType" NOT NULL,
  "category"          "FileCategory" NOT NULL,
  "relatedEntityType" TEXT,
  "relatedEntityId"   TEXT,
  "uploadStatus"      "StoredFileStatus" NOT NULL DEFAULT 'PENDING',
  "reviewStatus"      "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "reviewNote"        TEXT,
  "reviewedById"      TEXT,
  "reviewedAt"        TIMESTAMP(3),
  "idempotencyKey"    TEXT,
  "uploadSessionUrl"  TEXT,
  "failureReason"     TEXT,
  "uploadedAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"         TIMESTAMP(3),
  CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoredFile_driveFileId_key" ON "StoredFile"("driveFileId");
CREATE UNIQUE INDEX IF NOT EXISTS "StoredFile_idempotencyKey_key" ON "StoredFile"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "StoredFile_ownerUserId_category_idx" ON "StoredFile"("ownerUserId", "category");
CREATE INDEX IF NOT EXISTS "StoredFile_driveFolderId_idx" ON "StoredFile"("driveFolderId");
CREATE INDEX IF NOT EXISTS "StoredFile_uploadStatus_idx" ON "StoredFile"("uploadStatus");
CREATE INDEX IF NOT EXISTS "StoredFile_relatedEntityType_relatedEntityId_idx" ON "StoredFile"("relatedEntityType", "relatedEntityId");
CREATE INDEX IF NOT EXISTS "StoredFile_createdAt_idx" ON "StoredFile"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoredFile_ownerUserId_fkey') THEN
    ALTER TABLE "StoredFile"
      ADD CONSTRAINT "StoredFile_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 5) سجل الوصول والتنزيل والحذف (للإدارة)
CREATE TABLE IF NOT EXISTS "FileAccessLog" (
  "id"          TEXT NOT NULL,
  "fileId"      TEXT,
  "actorUserId" TEXT,
  "actorRole"   "Role",
  "action"      TEXT NOT NULL,
  "ip"          TEXT,
  "userAgent"   TEXT,
  "detail"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FileAccessLog_fileId_idx" ON "FileAccessLog"("fileId");
CREATE INDEX IF NOT EXISTS "FileAccessLog_actorUserId_idx" ON "FileAccessLog"("actorUserId");
CREATE INDEX IF NOT EXISTS "FileAccessLog_createdAt_idx" ON "FileAccessLog"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FileAccessLog_fileId_fkey') THEN
    ALTER TABLE "FileAccessLog"
      ADD CONSTRAINT "FileAccessLog_fileId_fkey"
      FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5b) بيانات الدفعة المعلنة من الطالب (لا تعني نجاح الدفع)
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "declaredAmount" DOUBLE PRECISION;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "declaredPaidAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "submittedNote" TEXT;

-- 6) إعداد حد الحجم الافتراضي (لا يستبدل قيمة قائمة)
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('max_file_size_mb', '100', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
