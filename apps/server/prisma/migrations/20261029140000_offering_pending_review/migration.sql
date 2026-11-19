-- حالة "بانتظار مراجعة الإدارة" للدورات: لا ينشر المدرس دورته بنفسه.
ALTER TYPE "OfferingStatus" ADD VALUE 'PENDING_REVIEW';
