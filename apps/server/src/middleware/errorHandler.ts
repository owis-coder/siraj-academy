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

  console.error("[error] خطأ غير متوقع:", err);
  res.status(500).json({ message: "حدث خطأ غير متوقع على الخادم" });
}

// غلاف للتخلص من try/catch المتكرر في المسارات
export function asyncHandler<Args extends unknown[]>(
  fn: (req: Request, res: Response, next: NextFunction, ...args: Args) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction, ...args: Args): void => {
    fn(req, res, next, ...args).catch(next);
  };
}
