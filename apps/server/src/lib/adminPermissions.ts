import type { NextFunction, Request, RequestHandler, Response } from "express";
import { forbidden, unauthorized } from "./errors";

export const AdminPermissions = {
  USERS_READ: "users.read",
  USERS_UPDATE: "users.update",
  USERS_SUSPEND: "users.suspend",
  USERS_REACTIVATE: "users.reactivate",
  USERS_PASSWORD_RECOVERY: "users.password_recovery",
  USERS_EMAIL_RECOVERY: "users.email_recovery",
  USERS_SESSIONS_REVOKE: "users.sessions.revoke",
  USERS_ROLES_MANAGE: "users.roles.manage",
  USERS_RECOVERY_APPROVE: "users.recovery.approve",
} as const;

export type AdminPermission = (typeof AdminPermissions)[keyof typeof AdminPermissions];

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = Object.values(AdminPermissions);

/**
 * يتحقق مما إذا كان لدى المشرف الصلاحية المطلوبة.
 * افتراضيًا: كل مدير (ADMIN) لديه كل الصلاحيات ما لم تكن هناك قائمة قيود محددة في `adminPermissions`.
 */
export function hasAdminPermission(
  user: { role: string; adminPermissions?: string[] | null },
  permission: AdminPermission,
): boolean {
  if (user.role !== "ADMIN") return false;
  const userPerms = user.adminPermissions || [];
  if (userPerms.length === 0 || userPerms.includes("*")) {
    return true;
  }
  return userPerms.includes(permission);
}

/**
 * وسيط التحقق من صلاحيات المشرفين الدقيقة
 */
export function requireAdminPermission(permission: AdminPermission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized("يتطلب هذا الإجراء تسجيل الدخول"));
    }
    if (req.user.role !== "ADMIN") {
      return next(forbidden("هذا الإجراء مخصص للمديرين فقط"));
    }
    if (!hasAdminPermission(req.user as any, permission)) {
      return next(forbidden(`ليس لديك صلاحية تنفيذ هذا الإجراء (${permission})`));
    }
    next();
  };
}
