-- Centralized communication, teacher content moderation, and course review lifecycle
-- Adds media/content review states, admin-mediated offers, and a moderation audit log.
-- Non-destructive: no rows are deleted. Existing content is treated as already approved
-- so previously published courses keep working until they are edited.

-- New enum value for course offerings
ALTER TYPE "OfferingStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVISION';

-- Review status enum for individual media/content items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewStatus') THEN
    CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'NEEDS_REVISION', 'REJECTED');
  END IF;
END
$$;

-- New offer lifecycle states (admin approval before a student sees an offer)
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVISION';

-- CourseOffering: only admin-approved YouTube links are shown to students
ALTER TABLE "CourseOffering" ADD COLUMN IF NOT EXISTS "approvedYoutubeUrls" JSONB;
ALTER TABLE "CourseOffering" ADD COLUMN IF NOT EXISTS "trialVideoStatus" "ReviewStatus" NOT NULL DEFAULT 'APPROVED';

-- Preserve existing YouTube links as approved (grandfathering existing content)
UPDATE "CourseOffering"
SET "approvedYoutubeUrls" = "youtubeUrls"
WHERE "youtubeUrls" IS NOT NULL
  AND "approvedYoutubeUrls" IS NULL;

-- Lesson: video links require approval before students can watch them
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

-- Offer: admin-approved price and review metadata
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "approvedPrice" DOUBLE PRECISION;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "adminNote" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- Moderation audit / review queue
CREATE TABLE IF NOT EXISTS "ContentModerationLog" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "field" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reasons" JSONB,
  "snippet" TEXT,
  "contentOwnerId" TEXT,
  "reviewedById" TEXT,
  "decisionNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentModerationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentModerationLog_entityType_entityId_idx"
  ON "ContentModerationLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "ContentModerationLog_status_idx" ON "ContentModerationLog"("status");
CREATE INDEX IF NOT EXISTS "ContentModerationLog_createdAt_idx" ON "ContentModerationLog"("createdAt");
