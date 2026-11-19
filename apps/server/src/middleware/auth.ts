import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { verifyToken, COOKIE_NAME } from "../lib/jwt";
import { forbidden, unauthorized } from "../lib/errors";

// شكل المستخدم المرفق على الطلب بعد التحقق
export interface AuthUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  status: string;
  emailVerified: boolean;
  avatarUrl?: string | null;
  teacherProfile?: { id: string; status: string } | null;
  totpEnabled?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** معرّف الطلب لتتبع الأخطاء في سجل التدقيق */
      id?: string;
      tokenPayload?: import("../lib/jwt").TokenPayload;
    }
  }
}

export function sanitizeUser(user: {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  status: string;
  emailVerified: boolean;
  avatarUrl?: string | null;
  whatsapp?: string | null;
  totpEnabled?: boolean;
  teacherProfile?: { id: string; status: string; degree?: string } | null;
}): AuthUser {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl ?? null,
    totpEnabled: !!user.totpEnabled,
    teacherProfile: user.teacherProfile
      ? { id: user.teacherProfile.id, status: user.teacherProfile.status }
      : null,
  };
}

// يتطلب تسجيل الدخول ويقيّد الأدوار المسموحة (تكفي one-role لتمرير أو تعدد)
export function requireAuth(...roles: Role[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) return next(unauthorized());
      const payload = verifyToken(token);
      if (!payload) return next(unauthorized("جلسة غير صالحة، سجّل الدخول من جديد"));

      // فحص صريح وفوري لمنع تذاكر المصادقة الثنائية المؤقتة من الوصول إلى مسارات الجلسة العادية
      if (payload.tokenType === "mfa_pending") {
        return next(unauthorized("رمز مصادقة ثنائية مؤقت — غير مصرح باستخدامه كجلسة."));
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { teacherProfile: { select: { id: true, status: true } } },
      });
      if (!user) return next(unauthorized("المستخدم غير موجود"));
      if (user.status === "SUSPENDED") return next(forbidden("تم تعليق حسابك، راجع الإدارة"));
      // إبطال الجلسات القديمة: أي زيادة في sessionVersion تُسقط الرموز السابقة
      if ((payload.sv ?? 0) !== user.sessionVersion) {
        return next(unauthorized("انتهت صلاحية الجلسة، سجّل الدخول من جديد"));
      }
      // الجلسة المرجعية: الرمز المرتبط بجلسة مُنهية (خروج/إلغاء من الأجهزة) لا يعمل
      if (payload.sid) {
        const session = await prisma.userSession.findUnique({
          where: { id: payload.sid },
          select: { userId: true, endedAt: true },
        });
        if (!session || session.userId !== user.id || session.endedAt) {
          return next(unauthorized("انتهت الجلسة، سجّل الدخول من جديد"));
        }
      }
      req.tokenPayload = payload;

      if (roles.length > 0 && !roles.includes(user.role)) {
        return next(forbidden("لا تملك صلاحية هذا الإجراء"));
      }

      req.user = {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        teacherProfile: user.teacherProfile,
        totpEnabled: user.totpEnabled,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

// الطلبات مع السماح للزائر (لا يفشل إن لم يوجد توكن)
export function optionalAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return next();
    const payload = verifyToken(token);
    if (!payload || payload.tokenType === "mfa_pending") return next();
    const sessionCheck = payload.sid
      ? prisma.userSession.findUnique({ where: { id: payload.sid }, select: { userId: true, endedAt: true } })
      : Promise.resolve(null);

    Promise.all([
      prisma.user.findUnique({
        where: { id: payload.sub },
        include: { teacherProfile: { select: { id: true, status: true } } },
      }),
      sessionCheck,
    ])
      .then(([user, session]) => {
        const sessionActive = !payload.sid || (!!session && session.userId === payload.sub && !session.endedAt);
        if (user && user.status !== "SUSPENDED" && (payload.sv ?? 0) === user.sessionVersion && sessionActive) {
          req.user = {
            id: user.id,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            role: user.role,
            status: user.status,
            emailVerified: user.emailVerified,
            avatarUrl: user.avatarUrl,
            teacherProfile: user.teacherProfile,
            totpEnabled: user.totpEnabled,
          };
          req.tokenPayload = payload;
        }
        next();
      })
      .catch(next);
  };
}

// المدرس فقط، وملفه مفعّل (APPROVED) — يمنع النشر قبل موافقة الإدارة
// يعمل بنفسه ك middleware: يتحقق من الجلسة (TEACHER) ثم من حالة الاعتماد
export function requireApprovedTeacher(): RequestHandler {
  return (req, res, next) => {
    requireAuth("TEACHER")(req, res, (err?: unknown) => {
      if (err) return next(err);
      const user = req.user;
      if (!user) return next(unauthorized());
      if (user.role !== "TEACHER") return next(forbidden("هذا الإجراء للمدرسين فقط"));
      if (!user.teacherProfile || user.teacherProfile.status !== "APPROVED") {
        return next(forbidden("حساب المدرس بانتظار مراجعة الإدارة ولم يُفعّل بعد"));
      }
      next();
    });
  };
}
