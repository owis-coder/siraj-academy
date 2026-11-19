import { prisma } from "./prisma";

export const CUSTOM_REQUEST_TYPE_ARABIC: Record<string, string> = {
  COURSE_EXPLAIN: "شرح مقرر",
  TOPIC_EXPLAIN: "شرح موضوع",
  TRANSLATION: "ترجمة",
  SUMMARY: "تلخيص",
  PPT: "عرض PowerPoint",
  PROGRAMMING_PROJECT: "مشروع برمجي تعليمي",
  OTHER: "خدمة أخرى",
};

export const CUSTOM_REQUEST_STATUS_ARABIC: Record<string, string> = {
  NEW: "جديد",
  UNDER_REVIEW: "قيد المراجعة",
  AWAITING_RESPONSE: "بانتظار الرد",
  ACCEPTED: "قُبل",
  REJECTED: "رُفض",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
};

export async function generateNextCustomRequestNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CSR-${year}-`;
  const count = await prisma.customServiceRequest.count();
  const num = String(count + 1).padStart(4, "0");
  return `${prefix}${num}`;
}
