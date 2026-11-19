// ============================================================
// مسارات مركز الأمن والحماية للوحة الإدارة (Admin Security Center API)
// ============================================================
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { badRequest, notFound } from "../lib/errors";
import { ipBanService } from "../lib/ipBan";
import { securityMonitor } from "../lib/securityMonitor";
import { securityCache } from "../lib/redis";
import {
  getSecuritySettings,
  updateSecuritySettings,
  toggleEmergencyMode,
} from "../lib/securitySettings";
import { isCloudflareIp, getTrustedClientIp } from "../lib/ipShield";

const router = Router();
router.use(requireAuth("ADMIN"));

// ---------- 1. نظرة عامة والحالة الأمنية والمؤشرات ----------
router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const settings = await getSecuritySettings();
    const metricsRaw = await securityMonitor.getMetrics();
    const redisHealth = securityCache.getHealth();

    // فحص ما إذا كانت ترويسات Cloudflare نشطة في الطلب الحالي
    const cfRay = req.headers["cf-ray"];
    const cfIp = req.headers["cf-connecting-ip"];
    const isBehindCloudflare = !!(cfRay || cfIp || isCloudflareIp(req.socket?.remoteAddress || ""));

    const [recentIncidents, activeIncidentsCount] = await Promise.all([
      prisma.securityIncident.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.securityIncident.count({ where: { resolved: false } }).catch(() => 0),
    ]);

    res.json({
      data: {
        status: {
          emergencyMode: !!settings.emergencyMode,
          recaptcha: {
            enabled: !!settings.recaptchaEnabled,
            mode: settings.recaptchaMode || "simulated",
            minScore: settings.recaptchaMinScore ?? 0.5,
          },
          redis: {
            connected: redisHealth.status === "connected",
            fallbackMode: redisHealth.status !== "connected",
            reconnectAttempts: 0,
            status: redisHealth.status,
            mode: redisHealth.mode,
          },
          cloudflare: {
            detected: isBehindCloudflare,
            cfRay: cfRay ? String(cfRay).slice(0, 20) : null,
          },
          rateLimitEnabled: !!settings.rateLimitEnabled,
          autoBanEnabled: !!settings.autoBanEnabled,
        },
        metrics: {
          totalRequests: metricsRaw.totalRequests ?? 0,
          blockedRateLimit: metricsRaw.blockedRequests ?? 0,
          blockedIpBans: metricsRaw.blockedRequests ?? 0,
          failedLogins: metricsRaw.failedLogins ?? 0,
          failedCaptchas: metricsRaw.captchaFailures ?? 0,
          activeIncidents: activeIncidentsCount,
          activeBans: metricsRaw.activeBansCount ?? 0,
        },
        recentIncidents: recentIncidents ?? [],
      },
    });
  }),
);

// ---------- 2. قائمة العناوين المحظورة ----------
router.get(
  "/bans",
  asyncHandler(async (_req, res) => {
    const bans = await ipBanService.listBannedIps();
    res.json({ data: bans });
  }),
);

// ---------- 3. حظر عنوان يدويًا ----------
router.post(
  "/bans",
  asyncHandler(async (req, res) => {
    const { ip, reason, durationMinutes } = req.body as {
      ip?: string;
      reason?: string;
      durationMinutes?: number;
    };
    if (!ip || !reason) {
      throw badRequest("عنوان IP وسبب الحظر مطلوبان.");
    }

    const duration = durationMinutes ?? 60;
    await ipBanService.banIp(ip.trim(), reason.trim(), duration, req.user!.id);
    res.status(201).json({
      data: {
        message: `تم حظر العنوان ${ip} بنجاح ${duration <= 0 ? "بشكل دائم" : `لمدة ${duration} دقيقة`}.`,
      },
    });
  }),
);

// ---------- 4. رفع الحظر عن عنوان ----------
router.delete(
  "/bans/:ip",
  asyncHandler(async (req, res) => {
    const ip = req.params.ip;
    const success = await ipBanService.unbanIp(ip);
    if (!success) {
      throw notFound("العنوان غير موجود في قائمة الحظر.");
    }
    res.json({ data: { message: `تم رفع الحظر عن العنوان ${ip} بنجاح.` } });
  }),
);

// ---------- 5. إعدادات الأمان الحالية ----------
router.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const settings = await getSecuritySettings();
    res.json({ data: settings });
  }),
);

// ---------- 6. تحديث إعدادات الأمان ----------
router.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    const updated = await updateSecuritySettings(req.body, req.user!.id);
    res.json({ data: updated, message: "تم تحديث إعدادات الأمان بنجاح." });
  }),
);

// ---------- 7. تبديل وضع الطوارئ (Emergency Mode) ----------
router.post(
  "/emergency",
  asyncHandler(async (req, res) => {
    const { enabled, reason } = req.body as { enabled?: boolean; reason?: string };
    if (typeof enabled !== "boolean") {
      throw badRequest("قيمة enabled مطلوبة كـ boolean.");
    }

    const updated = await toggleEmergencyMode(enabled, reason, req.user!.id);
    res.json({
      data: updated,
      message: enabled
        ? "تم تفعيل وضع الطوارئ والحماية المشددة بنجاح."
        : "تم إلغاء وضع الطوارئ واستعادة الحدود الطبيعية.",
    });
  }),
);

// ---------- 8. سجل الحوادث الأمنية ----------
router.get(
  "/incidents",
  asyncHandler(async (req, res) => {
    const severity = typeof req.query.severity === "string" ? req.query.severity : undefined;
    const eventType = typeof req.query.eventType === "string" ? req.query.eventType : undefined;

    const items = await prisma.securityIncident.findMany({
      where: {
        ...(severity ? { severity } : {}),
        ...(eventType ? { eventType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ data: items });
  }),
);

// ---------- 9. معالجة حادث أمني ----------
router.post(
  "/incidents/:id/resolve",
  asyncHandler(async (req, res) => {
    const item = await prisma.securityIncident.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound("الحادث الأمني غير موجود.");

    const updated = await prisma.securityIncident.update({
      where: { id: item.id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: req.user!.id,
      },
    });

    res.json({ data: updated, message: "تم تحديد الحادث كمعالج." });
  }),
);

export default router;
