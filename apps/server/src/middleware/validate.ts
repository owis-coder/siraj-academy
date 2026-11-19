import type { RequestHandler } from "express";
import type { ZodTypeAny, z } from "zod";
import { badRequest } from "../lib/errors";

// مدقق جسم الطلب عبر Zod: يرفض بأي تفاصيل التحقق قبل الوصول للمسار
export function parseBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(badRequest("تحقق من صحة البيانات المُرسلة", result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}

export type QueryResult<T extends ZodTypeAny> = z.infer<T>;

// مدقق الـquery عبر Zod (يحوّل الأرقام عبر coerce داخل الـschema)
// نعيد كتابة req.query بالقيم المحلّلة حتى تعتمد كل المسارات قيمًا آمنة ومحولة
export function parseQuery<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(badRequest("معاملات الاستعلام غير صحيحة", result.error.flatten()));
    }
    // نحافظ على المعاملات غير المعرفة في المخطط (mine، offeringId…)
    req.query = { ...req.query, ...result.data } as typeof req.query;
    res.locals.parsedQuery = result.data;
    next();
  };
}

// جلب الـquery المحلّل (تحقق أولًا أن المسار استخدم parseQuery)
export function query<T extends ZodTypeAny>(schema: T, req: unknown, res: { locals: { parsedQuery?: unknown } }): z.infer<T> {
  void req;
  return res.locals.parsedQuery as z.infer<T>;
}
