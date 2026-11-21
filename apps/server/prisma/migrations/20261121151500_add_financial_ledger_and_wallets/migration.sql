-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('PAYMENT_DEPOSIT', 'EARNING_REALIZATION', 'WITHDRAWAL_RESERVE', 'WITHDRAWAL_PAYOUT', 'WITHDRAWAL_RELEASE', 'REFUND_APPROVE', 'REFUND_PAYOUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "DebitCredit" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PROCESSING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('PENDING_CLEARING', 'AVAILABLE', 'WITHDRAWN', 'REVERSED');

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "type" "FinancialAccountType" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialJournalEntry" (
    "id" TEXT NOT NULL,
    "entryNo" TEXT NOT NULL,
    "type" "JournalEntryType" NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "narrativeAr" TEXT NOT NULL,
    "narrativeEn" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialLedgerLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entryType" "DebitCredit" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "userId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialLedgerLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherPayoutMethod" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "ibanEncrypted" TEXT NOT NULL,
    "ibanMasked" TEXT NOT NULL,
    "accountNumberEncrypted" TEXT,
    "accountNumberMasked" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherPayoutMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherWithdrawal" (
    "id" TEXT NOT NULL,
    "withdrawalNo" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "payoutMethodId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "rejectionReason" TEXT,
    "transferProofUrl" TEXT,
    "transferReferenceNo" TEXT,
    "transferredAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "executedById" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "refundNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amountRequested" DOUBLE PRECISION NOT NULL,
    "amountApproved" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "attachments" JSONB,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "rejectionReason" TEXT,
    "transferProofUrl" TEXT,
    "transferReferenceNo" TEXT,
    "transferredAt" TIMESTAMP(3),
    "bankDetails" JSONB,
    "reviewerId" TEXT,
    "executedById" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherEarning" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "commissionAmount" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "EarningStatus" NOT NULL DEFAULT 'AVAILABLE',
    "clearingDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherEarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_code_key" ON "FinancialAccount"("code");

-- CreateIndex
CREATE INDEX "FinancialAccount_type_idx" ON "FinancialAccount"("type");

-- CreateIndex
CREATE INDEX "FinancialAccount_isActive_idx" ON "FinancialAccount"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialJournalEntry_entryNo_key" ON "FinancialJournalEntry"("entryNo");

-- CreateIndex
CREATE INDEX "FinancialJournalEntry_type_idx" ON "FinancialJournalEntry"("type");

-- CreateIndex
CREATE INDEX "FinancialJournalEntry_status_idx" ON "FinancialJournalEntry"("status");

-- CreateIndex
CREATE INDEX "FinancialJournalEntry_referenceType_referenceId_idx" ON "FinancialJournalEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "FinancialJournalEntry_createdAt_idx" ON "FinancialJournalEntry"("createdAt");

-- CreateIndex
CREATE INDEX "FinancialLedgerLine_journalEntryId_idx" ON "FinancialLedgerLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "FinancialLedgerLine_accountId_idx" ON "FinancialLedgerLine"("accountId");

-- CreateIndex
CREATE INDEX "FinancialLedgerLine_userId_idx" ON "FinancialLedgerLine"("userId");

-- CreateIndex
CREATE INDEX "FinancialLedgerLine_entryType_idx" ON "FinancialLedgerLine"("entryType");

-- CreateIndex
CREATE INDEX "TeacherPayoutMethod_teacherId_idx" ON "TeacherPayoutMethod"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherPayoutMethod_isDefault_idx" ON "TeacherPayoutMethod"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherWithdrawal_withdrawalNo_key" ON "TeacherWithdrawal"("withdrawalNo");

-- CreateIndex
CREATE INDEX "TeacherWithdrawal_teacherId_idx" ON "TeacherWithdrawal"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherWithdrawal_status_idx" ON "TeacherWithdrawal"("status");

-- CreateIndex
CREATE INDEX "TeacherWithdrawal_createdAt_idx" ON "TeacherWithdrawal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_refundNo_key" ON "RefundRequest"("refundNo");

-- CreateIndex
CREATE INDEX "RefundRequest_orderId_idx" ON "RefundRequest"("orderId");

-- CreateIndex
CREATE INDEX "RefundRequest_studentId_idx" ON "RefundRequest"("studentId");

-- CreateIndex
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");

-- CreateIndex
CREATE INDEX "RefundRequest_createdAt_idx" ON "RefundRequest"("createdAt");

-- CreateIndex
CREATE INDEX "TeacherEarning_teacherId_idx" ON "TeacherEarning"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherEarning_orderId_idx" ON "TeacherEarning"("orderId");

-- CreateIndex
CREATE INDEX "TeacherEarning_status_idx" ON "TeacherEarning"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherEarning_orderId_teacherId_key" ON "TeacherEarning"("orderId", "teacherId");

-- AddForeignKey
ALTER TABLE "FinancialJournalEntry" ADD CONSTRAINT "FinancialJournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLedgerLine" ADD CONSTRAINT "FinancialLedgerLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "FinancialJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLedgerLine" ADD CONSTRAINT "FinancialLedgerLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLedgerLine" ADD CONSTRAINT "FinancialLedgerLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPayoutMethod" ADD CONSTRAINT "TeacherPayoutMethod_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherWithdrawal" ADD CONSTRAINT "TeacherWithdrawal_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherWithdrawal" ADD CONSTRAINT "TeacherWithdrawal_payoutMethodId_fkey" FOREIGN KEY ("payoutMethodId") REFERENCES "TeacherPayoutMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherWithdrawal" ADD CONSTRAINT "TeacherWithdrawal_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherWithdrawal" ADD CONSTRAINT "TeacherWithdrawal_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "FinancialJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "FinancialJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherEarning" ADD CONSTRAINT "TeacherEarning_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherEarning" ADD CONSTRAINT "TeacherEarning_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

