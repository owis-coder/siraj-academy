// ============================================================
// نظام حظر العناوين المشبوهة (Dynamic IP Ban & Abuse Jail)
// يكتشف ويسجل العناوين المسيئة، ويحظرها تدريجيًا في الذاكرة وقاعدة البيانات
// دون حظر شبكات الجامعات كاملة، مع إمكانية الرفع اليدوي من مركز الأمن.
// ============================================================
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma";
import { securityCache } from "./redis";
import { getTrustedClientIp, getSubnetIdentifier } from "./ipShield";

// ذاكرة محلية سريعة جدا لتفادي الاستعلام المتكرر لقاعدة البيانات في كل طلب
const fastMemoryBans = new Map<string, { reason: string; expiresAt: number | null }>();

export const ipBanService = {
  /** فحص ما إذا كان العنوان محظورًا */
  async isIpBlocked(ip: string): Promise<{ blocked: boolean; reason?: string; expiresAt?: Date | null }> {
    const clean = getSubnetIdentifier(ip);
    const now = Date.now();

    // 1) فحص الذاكرة السريعة
    const cached = fastMemoryBans.get(clean);
    if (cached) {
      if (cached.expiresAt !== null && cached.expiresAt <= now) {
        fastMemoryBans.delete(clean);
      } else {
        return {
          blocked: true,
          reason: cached.reason,
          expiresAt: cached.expiresAt ? new Date(cached.expiresAt) : null,
        };
      }
    }

    // 2) فحص Redis إن وجد
    const redisVal = await securityCache.get(`ban:${clean}`);
    if (redisVal) {
      try {
        const parsed = JSON.parse(redisVal);
        fastMemoryBans.set(clean, {
          reason: parsed.reason,
          expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt).getTime() : null,
        });
        return {
          blocked: true,
          reason: parsed.reason,
          expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        };
      } catch {}
    }

    // 3) فحص قاعدة البيانات
    try {
      const record = await prisma.blockedIp.findFirst({
        where: {
          ip: clean,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });

      if (record) {
        const expTime = record.expiresAt ? record.expiresAt.getTime() : null;
        fastMemoryBans.set(clean, { reason: record.reason, expiresAt: expTime });
        if (record.expiresAt) {
          const ttlSec = Math.max(1, Math.round((expTime! - now) / 1000));
          await securityCache.set(`ban:${clean}`, JSON.stringify(record), ttlSec);
        } else {
          await securityCache.set(`ban:${clean}`, JSON.stringify(record));
        }
        return {
          blocked: true,
          reason: record.reason,
          expiresAt: record.expiresAt,
        };
      }
    } catch (e) {
      // في حال تعطل DB لا نوقف الخدمة
    }

    return { blocked: false };
  },

  /** حظر عنوان IP */
  async banIp(
    ip: string,
    reason: string,
    durationMinutes: number = 30,
    bannedBy: string = "SYSTEM",
  ): Promise<void> {
    const clean = getSubnetIdentifier(ip);
    const permanent = durationMinutes <= 0;
    const expiresAt = permanent ? null : new Date(Date.now() + durationMinutes * 60 * 1000);

    // تحديث قاعدة البيانات
    try {
      await prisma.blockedIp.upsert({
        where: { ip: clean },
        create: {
          ip: clean,
          reason,
          bannedAt: new Date(),
          expiresAt,
          bannedBy,
          permanent,
        },
        update: {
          reason,
          bannedAt: new Date(),
          expiresAt,
          bannedBy,
          permanent,
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[BAN] خطأ في تسجيل الحظر بقاعدة البيانات:", (e as Error).message);
    }

    // تحديث الكاش
    fastMemoryBans.set(clean, {
      reason,
      expiresAt: expiresAt ? expiresAt.getTime() : null,
    });
    const payload = JSON.stringify({ ip: clean, reason, expiresAt, bannedBy });
    if (expiresAt) {
      await securityCache.set(`ban:${clean}`, payload, durationMinutes * 60);
    } else {
      await securityCache.set(`ban:${clean}`, payload);
    }
  },

  /** رفع الحظر عن عنوان IP */
  async unbanIp(ip: string): Promise<boolean> {
    const clean = getSubnetIdentifier(ip);
    fastMemoryBans.delete(clean);
    await securityCache.del(`ban:${clean}`);

    try {
      await prisma.blockedIp.deleteMany({
        where: { ip: clean },
      });
      return true;
    } catch {
      return false;
    }
  },

  /** قائمة العناوين المحظورة الحالية */
  async listBannedIps() {
    try {
      return await prisma.blockedIp.findMany({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { bannedAt: "desc" },
      });
    } catch {
      return [];
    }
  },

  /** تسجيل إساءة استخدام وتطبيق حظر تصاعدي تلقائي (Auto-Jail) */
  async recordAbuse(ip: string, weight: number = 1): Promise<{ banned: boolean; durationMinutes?: number }> {
    const clean = getSubnetIdentifier(ip);
    const key = `abuse:${clean}`;
    const score = await securityCache.incr(key, 10 * 60); // احتساب الإساءات خلال نافذة 10 دقائق

    // تصعيد الحظر التدريجي
    if (score >= 15) {
      // هجوم مكثف -> حظر ساعتين
      await this.banIp(clean, "تجاوز حد الإساءة والطلبات المرفوضة بشكل متكرر ومكثف", 120, "SYSTEM_AUTO_JAIL");
      return { banned: true, durationMinutes: 120 };
    } else if (score >= 8) {
      // تجاوز ملحوظ -> حظر 20 دقيقة
      await this.banIp(clean, "تجاوز معدل الطلبات الآمن وتكرار المحاولات الفاشلة", 20, "SYSTEM_AUTO_JAIL");
      return { banned: true, durationMinutes: 20 };
    }

    return { banned: false };
  },
};

/** وسيط فحص الحظر السريع */
export async function ipBanMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clientIp = getTrustedClientIp(req);
  const status = await ipBanService.isIpBlocked(clientIp);

  if (status.blocked) {
    res.status(403).json({
      message: "تم حظر هذا العنوان مؤقتًا بسبب تجاوز حدود الاستخدام أو أنشطة مشبوهة.",
      error: { code: "IP_BANNED" },
      details: {
        reason: status.reason,
        expiresAt: status.expiresAt ? status.expiresAt.toISOString() : "دائم",
      },
    });
    return;
  }

  next();
}
