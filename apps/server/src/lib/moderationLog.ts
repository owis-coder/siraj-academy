import { prisma } from "./prisma";
import { badRequest } from "./errors";
import {
  ContentModerationService,
  mergeModerationResults,
  type ModerationResult,
} from "./contentModeration";

export type ModerationEntityType =
  | "OFFERING"
  | "LESSON"
  | "OFFER"
  | "EXPLAIN_REQUEST"
  | "CUSTOM_REQUEST"
  | "AD"
  | "PROFILE"
  | "MESSAGE"
  | "UPLOAD";

export interface ReviewContentInput {
  entityType: ModerationEntityType;
  entityId?: string | null;
  contentOwnerId?: string | null;
  /** حقل -> نص. القيم الفارغة تُتجاهل. */
  fields: Record<string, string | null | undefined>;
}

export interface ReviewContentResult {
  status: ModerationResult["status"];
  result: ModerationResult;
  rejectedFields: string[];
  reviewFields: string[];
}

/**
 * يفحص عدة حقول، يسجّل كل محتوى غير مقبول في سجل المراجعة،
 * ويرمي خطأً واضحًا (بلا حفظ صامت) إذا كان أي حقل مرفوضًا.
 */
export async function reviewContent(input: ReviewContentInput): Promise<ReviewContentResult> {
  const entries = Object.entries(input.fields).filter(
    ([, value]) => typeof value === "string" && value.trim().length > 0,
  ) as Array<[string, string]>;

  const perField = entries.map(([field, value]) => ({
    field,
    result: ContentModerationService.moderateText(value),
  }));
  const merged = mergeModerationResults(perField.map((p) => p.result));

  const rejectedFields = perField.filter((p) => p.result.status === "REJECTED").map((p) => p.field);
  const reviewFields = perField.filter((p) => p.result.status === "NEEDS_REVIEW").map((p) => p.field);

  if (merged.status !== "APPROVED" && perField.length > 0) {
    const logs = perField
      .filter((p) => p.result.status !== "APPROVED")
      .map((p) => ({
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        field: p.field,
        status: p.result.status,
        reasons: p.result.reasons as unknown as object,
        snippet: p.result.snippet ?? null,
        contentOwnerId: input.contentOwnerId ?? null,
      }));
    if (logs.length > 0) {
      // السجل لا يجب أن يمنع العملية إذا فشل — لكن الفشل يُسجَّل في الطرفية
      await prisma.contentModerationLog.createMany({ data: logs }).catch((e) => {
        console.error("[MODERATION] failed to write moderation log:", e instanceof Error ? e.message : e);
      });
    }
  }

  if (merged.status === "REJECTED") {
    throw badRequest(ContentModerationService.moderationUserMessage(merged));
  }

  return { status: merged.status, result: merged, rejectedFields, reviewFields };
}

/** فحص اسم ملف عند الرفع — يرمي خطأً إن كان يحتوي بيانات تواصل */
export async function assertSafeFileName(fileName: string, contentOwnerId: string): Promise<void> {
  const result = ContentModerationService.moderateFileName(fileName);
  if (result.status === "APPROVED") return;
  await prisma.contentModerationLog
    .create({
      data: {
        entityType: "UPLOAD",
        field: "fileName",
        status: result.status,
        reasons: result.reasons as unknown as object,
        snippet: result.snippet ?? null,
        contentOwnerId,
      },
    })
    .catch(() => undefined);
  if (result.status === "REJECTED") {
    throw badRequest("اسم الملف يحتوي بيانات تواصل — أعد تسمية الملف ثم ارفعه من جديد.");
  }
}
