// أخطاء HTTP موحّدة مع كود خطأ اختياري
export class HttpError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (m: string, details?: unknown) => new HttpError(400, m, "BAD_REQUEST", details);
export const unauthorized = (m = "الوصول يتطلب تسجيل الدخول") => new HttpError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "ليست لديك صلاحية لهذا الإجراء") => new HttpError(403, m, "FORBIDDEN");
export const notFound = (m = "العنصر المطلوب غير موجود") => new HttpError(404, m, "NOT_FOUND");
export const conflict = (m: string) => new HttpError(409, m, "CONFLICT");
