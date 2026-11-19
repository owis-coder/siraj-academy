// ============================================================
// نظام المراقبة والاستجابة للحوادث الأمنية (Security Monitoring & Incident Response)
// يراقب محاولات الاختراق، الطلبات المرفوضة، وتجاوز الحدود، ويوثق الحوادث
// في جدول SecurityIncident مع رصد الأنماط الشاذة والتنبيهات.
// ============================================================
import { prisma } from "./prisma";
import { securityCache } from "./redis";
import { ipBanService } from "./ipBan";
import { sendMail } from "./mail";

export interface SecurityMetrics {
  totalRequests: number;
  blockedRequests: number;
  failedLogins: number;
  captchaFailures: number;
  activeBansCount: number;
}

export const securityMonitor = {
  /** تسجيل عداد طلب عام أو مرفوض */
  async recordRequest(isBlocked: boolean = false): Promise<void> {
    await securityCache.incr("sec:metric:total_req", 24 * 60 * 60);
    if (isBlocked) {
      await securityCache.incr("sec:metric:blocked_req", 24 * 60 * 60);
    }
  },

  /** تسجيل محاولة تسجيل دخول فاشلة واكتشاف الهجوم التخميني (Brute Force Detection) */
  async recordFailedLogin(ip: string, identifier?: string): Promise<void> {
    await securityCache.incr("sec:metric:failed_logins", 24 * 60 * 60);

    const ipKey = `sec:failed_logins:ip:${ip}`;
    const failures = await securityCache.incr(ipKey, 15 * 60); // احتساب خلال 15 دقيقة

    // إذا تجاوزت المحاولات الفاشلة 5 محاولات من نفس العنوان
    if (failures >= 5) {
      await this.recordIncident({
        eventType: "BRUTE_FORCE_LOGIN",
        severity: "HIGH",
        ip,
        endpoint: "/api/v1/auth/login",
        details: {
          attempts: failures,
          maskedIdentifier: identifier ? identifier.slice(0, 3) + "***" : undefined,
        },
      });

      // حظر العنوان مؤقتًا لمدة 30 دقيقة
      await ipBanService.banIp(ip, "تكرار محاولات الدخول الفاشلة (حماية ضد Brute Force)", 30, "SYSTEM_AUTO_JAIL");
    }
  },

  /** تسجيل فشل التحقق البشري reCAPTCHA */
  async recordCaptchaFailure(ip: string, action: string): Promise<void> {
    await securityCache.incr("sec:metric:captcha_fails", 24 * 60 * 60);
    const key = `sec:captcha_fails:ip:${ip}`;
    const fails = await securityCache.incr(key, 10 * 60);

    if (fails >= 6) {
      await this.recordIncident({
        eventType: "CAPTCHA_ANOMALY",
        severity: "HIGH",
        ip,
        details: { action, failsCount: fails },
      });
      await ipBanService.banIp(ip, "تكرار فشل اختبار التحقق البشري (شبهة نشاط آلي ضار)", 45, "SYSTEM_AUTO_JAIL");
    }
  },

  /** تسجيل حادثة أمنية في قاعدة البيانات وتنبيه الإدارة في الحالات الحرجة */
  async recordIncident(input: {
    eventType: string;
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    ip?: string;
    userId?: string;
    endpoint?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const severity = input.severity || "MEDIUM";
    try {
      await prisma.securityIncident.create({
        data: {
          eventType: input.eventType,
          severity,
          ip: input.ip ?? null,
          userId: input.userId ?? null,
          endpoint: input.endpoint ?? null,
          details: input.details as never,
        },
      });

      // إرسال تنبيه بالبريد في الحوادث الحرجة (CRITICAL)
      if (severity === "CRITICAL" && process.env.ADMIN_NOTIFICATION_EMAIL) {
        void sendMail({
          to: process.env.ADMIN_NOTIFICATION_EMAIL,
          subject: `[تنبيه أمني عاجل] حادث أمني حرج في أكاديمية سراج: ${input.eventType}`,
          text: `تم رصد حادث أمني من مستوى ${severity}:\nنوع الحدث: ${input.eventType}\nالعنوان: ${input.ip || "غير محدد"}\nالتفاصيل: ${JSON.stringify(input.details || {})}`,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[MONITOR] تعذر حفظ الحادث الأمني:", (e as Error).message);
    }
  },

  /** قراءة المؤشرات الحالية لمركز الأمن */
  async getMetrics(): Promise<SecurityMetrics> {
    const [total, blocked, failedLogins, captchaFails, activeBans] = await Promise.all([
      securityCache.get("sec:metric:total_req").then((v) => Number(v || 0)),
      securityCache.get("sec:metric:blocked_req").then((v) => Number(v || 0)),
      securityCache.get("sec:metric:failed_logins").then((v) => Number(v || 0)),
      securityCache.get("sec:metric:captcha_fails").then((v) => Number(v || 0)),
      prisma.blockedIp.count({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      }).catch(() => 0),
    ]);

    return {
      totalRequests: total,
      blockedRequests: blocked,
      failedLogins,
      captchaFailures: captchaFails,
      activeBansCount: activeBans,
    };
  },
};
