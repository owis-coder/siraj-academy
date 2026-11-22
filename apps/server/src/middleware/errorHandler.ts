import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/errors";

interface NormalizedIssue {
  path: string;
  message: string;
}

function sanitizeMessage(m: string): string {
  if (!m) return m;
  if (/prisma|postgres|postgresql|sqlite|mongodb|sql|syntaxerror|typeerror|table\s+|column\s+|relation\s+|constraint\s+|select\s+|insert\s+|update\s+|delete\s+/i.test(m)) {
    return "حدث خطأ غير متوقع على الخادم";
  }
  return m;
}

/** فحص وتصنيف أخطاء Prisma وقواعد البيانات لتفادي أخطاء 500 غير المفسرة */
function handleDatabaseError(err: any, res: Response): boolean {
  if (!err || typeof err !== "object") return false;

  const isPrismaError =
    err.name === "PrismaClientKnownRequestError" ||
    err.name === "PrismaClientInitializationError" ||
    err.name === "PrismaClientRustPanicError" ||
    err.name === "PrismaClientUnknownRequestError" ||
    typeof err.code === "string" && err.code.startsWith("P");

  if (!isPrismaError) return false;

  const code = String(err.code || "");

  // تسجيل خطأ القاعدة داخليًا بصورة آمنة دون طباعة أسرار أو كلمات مرور
  console.error(`[DATABASE_ERROR] code=${code} name=${err.name} message=${sanitizeMessage(err.message)}`);

  // انتهاء مهلة الاتصال أو القفل (Database Advisory Lock / Query Timeout)
  if (code === "P1002" || code === "P1008") {
    res.status(504).json({
      message: "انتهت مهلة استجابة قاعدة البيانات. يُرجى إعادة المحاولة بعد لحظات.",
      error: { code: "DATABASE_TIMEOUT" },
    });
    return true;
  }

  // تعذر الاتصال بالخادم أو انقطاع الاتصال أو امتلاء المجمع (Pool Timeout)
  if (code === "P1001" || code === "P1017" || code === "P2024" || err.name === "PrismaClientInitializationError") {
    res.status(503).json({
      message: "خدمة قاعدة البيانات غير متاحة مؤقتًا أو تحت ضغط عالٍ. يُرجى المحاولة لاحقًا.",
      error: { code: "DATABASE_UNAVAILABLE" },
    });
    return true;
  }

  // انتهاك القيد الفريد (Unique Constraint Violation)
  if (code === "P2002") {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : "الحقل";
    res.status(409).json({
      message: `قيمة ${target} مسجلة مسبقًا في النظام.`,
      error: { code: "DUPLICATE_ENTRY", target },
    });
    return true;
  }

  // السجل المطلوب غير موجود للتعديل أو الحذف
  if (code === "P2025") {
    res.status(404).json({
      message: "السجل المطلوب غير موجود أو تم حذفه مسبقًا.",
      error: { code: "RECORD_NOT_FOUND" },
    });
    return true;
  }

  res.status(503).json({
    message: "تعذر إتمام العملية بسبب انشغال قاعدة البيانات. يُرجى المحاولة بعد قليل.",
    error: { code: "DATABASE_ERROR" },
  });
  return true;
}

// معالج الأخطاء المركزي: يحوّل Zod/HTTP/الأخطاء غير المتوقعة إلى شكل موحد { message, details? }
// ويضمن عدم كشف أي تفاصيل تقنية داخلية أو أخطاء قواعد البيانات للمستخدم
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // أخطاء HTTP الصريحة
  if (err instanceof HttpError) {
    res.status(err.status).json({
      message: sanitizeMessage(err.message),
      ...(err.code ? { error: { code: err.code } } : {}),
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // معالجة أخطاء Prisma وقواعد البيانات بحالات HTTP دقيقة (503/504/409/404)
  if (handleDatabaseError(err, res)) {
    return;
  }

  // أخطاء الزود الصريحة إن لم تُغلف
  if (typeof err === "object" && err !== null && "name" in err && (err as { name?: unknown }).name === "ZodError") {
    const zodErr = err as { issues?: Array<{ path: Array<string | number>; message: string }> };
    const issues: NormalizedIssue[] = (zodErr.issues || []).map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    res.status(400).json({
      message: "تحقق من صحة البيانات المُرسلة",
      details: { formErrors: [], fieldErrors: Object.fromEntries(issues.map((i) => [i.path, [i.message]])) },
    });
    return;
  }

  // أخطاء انتهاء المهلة لطلبات Fetch أو الشبكة الخارجية (AbortController Timeout)
  if (typeof err === "object" && err !== null && (err as { name?: string }).name === "AbortError") {
    res.status(504).json({
      message: "انتهت مهلة الاتصال بالخدمة الخارجية. يرجى إعادة المحاولة.",
      error: { code: "GATEWAY_TIMEOUT" },
    });
    return;
  }

  // multer: تجاوز حدود الحجم / نوع الملف
  if (typeof err === "object" && err !== null) {
    const e = err as { code?: string; message?: string };
    if (e.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ message: "حجم الملف يتجاوز الحد المسموح", error: { code: "FILE_TOO_LARGE" } });
      return;
    }
    if (e.message && e.message.includes("Invalid file type")) {
      res.status(400).json({ message: "صيغة الملف غير مدعومة", error: { code: "INVALID_FILE_TYPE" } });
      return;
    }
  }

  // تسجيل آمن للخطأ الداخلي بدون طباعة أي أسرار أو كلمات سر أو توكنز
  const safeErrName = (err as Error)?.name || "UnknownError";
  const safeErrMsg = sanitizeMessage((err as Error)?.message || String(err));
  console.error(`[SERVER:ERROR] ${safeErrName}: ${safeErrMsg}`);

  res.status(500).json({
    message: "حدث خطأ غير متوقع على الخادم. يُرجى إعادة المحاولة لاحقًا.",
    error: { code: "INTERNAL_SERVER_ERROR" },
  });
}

// غلاف للتخلص من try/catch المتكرر في المسارات
export function asyncHandler<Args extends unknown[]>(
  fn: (req: Request, res: Response, next: NextFunction, ...args: Args) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction, ...args: Args): void => {
    fn(req, res, next, ...args).catch(next);
  };
}
