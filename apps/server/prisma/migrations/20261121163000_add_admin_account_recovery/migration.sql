-- CreateEnum
CREATE TYPE "AccountRecoveryStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'VERIFICATION_SENT', 'COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecoveryVerificationMethod" AS ENUM ('NATIONAL_ID', 'PASSPORT', 'STUDENT_ID', 'ACADEMIC_RECORD', 'OFFICIAL_PHONE_CALL', 'VIDEO_VERIFICATION', 'DOCUMENT_UPLOAD', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccountRecoveryRequest" (
    "id" TEXT NOT NULL,
    "recoveryNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalEmail" TEXT NOT NULL,
    "alternativeEmail" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "verificationMethod" "RecoveryVerificationMethod" NOT NULL DEFAULT 'OTHER',
    "verificationNotes" TEXT,
    "evidenceRef" TEXT,
    "isHighRisk" BOOLEAN NOT NULL DEFAULT false,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccountRecoveryStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "initiatorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedIp" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountRecoveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccountRecoveryApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountRecoveryApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AccountRecoveryRequest_recoveryNo_key" ON "AccountRecoveryRequest"("recoveryNo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AccountRecoveryRequest_tokenHash_key" ON "AccountRecoveryRequest"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccountRecoveryRequest_userId_idx" ON "AccountRecoveryRequest"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccountRecoveryRequest_status_idx" ON "AccountRecoveryRequest"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccountRecoveryRequest_createdAt_idx" ON "AccountRecoveryRequest"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccountRecoveryRequest_alternativeEmail_idx" ON "AccountRecoveryRequest"("alternativeEmail");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AccountRecoveryApproval_requestId_adminId_key" ON "AccountRecoveryApproval"("requestId", "adminId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccountRecoveryApproval_requestId_idx" ON "AccountRecoveryApproval"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccountRecoveryApproval_adminId_idx" ON "AccountRecoveryApproval"("adminId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AccountRecoveryRequest_userId_fkey'
    ) THEN
        ALTER TABLE "AccountRecoveryRequest" ADD CONSTRAINT "AccountRecoveryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AccountRecoveryRequest_initiatorId_fkey'
    ) THEN
        ALTER TABLE "AccountRecoveryRequest" ADD CONSTRAINT "AccountRecoveryRequest_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AccountRecoveryRequest_reviewerId_fkey'
    ) THEN
        ALTER TABLE "AccountRecoveryRequest" ADD CONSTRAINT "AccountRecoveryRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AccountRecoveryApproval_requestId_fkey'
    ) THEN
        ALTER TABLE "AccountRecoveryApproval" ADD CONSTRAINT "AccountRecoveryApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AccountRecoveryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AccountRecoveryApproval_adminId_fkey'
    ) THEN
        ALTER TABLE "AccountRecoveryApproval" ADD CONSTRAINT "AccountRecoveryApproval_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
