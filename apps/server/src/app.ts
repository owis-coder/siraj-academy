import express from "express";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import cors from "cors";

import { errorHandler } from "./middleware/errorHandler";
import { localizeResponses } from "./lib/i18n";
import { prisma } from "./lib/prisma";
import { initRedis } from "./lib/redis";
import { securityHeaders } from "./middleware/securityHeaders";
import { ipBanMiddleware } from "./lib/ipBan";
import { rateLimiters } from "./lib/advancedRateLimit";
import { securityMonitor } from "./lib/securityMonitor";
import { isCloudflareIp, isLocalProxy, originShieldMiddleware } from "./lib/ipShield";

import authRouter from "./routes/auth";
import catalogRouter from "./routes/catalog";
import requestsRouter from "./routes/requests";
import offersRouter from "./routes/offers";
import offeringsRouter from "./routes/offerings";
import { liveRouter as liveSessionsRouter } from "./routes/offerings";
import ordersRouter from "./routes/orders";
import paymentsRouter from "./routes/payments";
import chatRouter from "./routes/chat";
import adsRouter from "./routes/ads";
import notificationsRouter from "./routes/notifications";
import uploadsRouter from "./routes/uploads";
import filesRouter from "./routes/files";
import storageRouter, { storageAdminRouter } from "./routes/storage";
import adminVerificationRouter from "./routes/adminVerification";
import platformRouter from "./routes/platform";
import adminRouter from "./routes/admin";
import adminUsersRouter from "./routes/adminUsers";
import adminSecurityRouter from "./routes/adminSecurity";
import teacherRouter from "./routes/teacher";
import usersRouter from "./routes/users";
import customRequestsRouter from "./routes/customRequests";
import refundsRouter from "./routes/refunds";
import withdrawalsRouter from "./routes/withdrawals";
import seoRouter from "./routes/seo";

export function createApp(): express.Express {
  // تهيئة عميل التخزين المشترك (Redis / Memory Fallback)
  initRedis();

  const app = express();
  const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

  // ضبط التحقق الآمن من وكيل الشبكة (Cloudflare / Local Reverse Proxy)
  app.set("trust proxy", (ip: string) => isLocalProxy(ip) || isCloudflareIp(ip));

  // معرّف طلب لكل طلب — يُستخدم في سجل التدقيق لتتبع الأخطاء (لا يعتمد على العميل)
  app.use((req, res, next) => {
    const incoming = req.header("x-request-id");
    const id = (incoming && /^[A-Za-z0-9_-]{8,80}$/.test(incoming) ? incoming : crypto.randomUUID()).slice(0, 80);
    req.id = id;
    res.setHeader("x-request-id", id);
    next();
  });

  // ترويسات الأمان المتقدمة مع Helmet وسياسة CSP محكمة
  app.use(securityHeaders);

  // درع حماية الأصل عند تفعيل Cloudflare في بيئة الإنتاج
  app.use(originShieldMiddleware);

  // فحص حظر العناوين المشبوهة في بداية دورة الطلب (IP Blacklist / Jail)
  app.use(ipBanMiddleware);

  // تسجيل مؤشرات الطلبات العامة في نظام المراقبة الأمنية
  app.use((_req, _res, next) => {
    void securityMonitor.recordRequest(false);
    next();
  });

  app.use(cookieParser());

  // CORS للواجهة الأمامية مع كوكي
  app.use(
    cors({
      origin: CLIENT_URL === "*" ? true : CLIENT_URL.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true, limit: "5mb" }));

  // توطين رسائل الاستجابة حسب لغة الواجهة (Accept-Language)
  app.use(localizeResponses);

  // فحص صحة الخادم
  app.get("/healthz", (_req, res) => {
    res.json({ data: { status: "ok", time: new Date().toISOString() } });
  });

  // robots.txt و sitemap.xml (صفحات عامة فقط — لا بيانات خاصة)
  app.use(seoRouter);

  // الملفات المرفوعة: تُخدم بعد تفويض (سندات الحوالة ووثائق المدرسين ليست عامة)
  app.use("/uploads", filesRouter);

  // ---------- جهاز التوجيه / api/v1 ----------
  const api = express.Router();

  // تقييد معدل الطلبات المتقدم (Sliding Window Rate Limiters)
  api.use("/auth/login", rateLimiters.login);
  api.use("/auth/mfa/verify", rateLimiters.mfaVerify);
  api.use("/auth/register", rateLimiters.register);
  api.use("/auth/forgot-password", rateLimiters.forgotPassword);
  api.use("/auth/reset-password", rateLimiters.forgotPassword);
  api.use("/auth/email/verify-request", rateLimiters.verifyEmail);
  api.use("/auth/username-availability", rateLimiters.usernameCheck);
  api.use("/uploads", rateLimiters.upload);
  api.use("/files", rateLimiters.upload);
  api.use("/users/me/avatar", rateLimiters.upload);
  api.use("/orders/:id/receipt", rateLimiters.upload);
  api.use("/requests", (req, res, next) => {
    if (req.method === "POST") return rateLimiters.submitRequests(req, res, next);
    next();
  });
  api.use("/admin", rateLimiters.admin);
  api.use("/", rateLimiters.apiGeneral);

  api.use("/platform", platformRouter);
  api.use("/auth", authRouter);
  api.use("/", catalogRouter); // universities/colleges/majors/courses/teachers/services/catalog/search/service-orders/favorites
  api.use("/requests", requestsRouter);
  api.use("/offers", offersRouter); // /offers/:id/accept ...
  api.use("/offerings", offeringsRouter); // /offerings..., /live-sessions في راوتر مستقل
  api.use("/live-sessions", liveSessionsRouter);
  api.use("/orders", ordersRouter);
  api.use("/payments", paymentsRouter);
  api.use("/chat", chatRouter);
  api.use("/ads", adsRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/uploads", uploadsRouter);
  api.use("/files", storageRouter);
  api.use("/admin/storage", storageAdminRouter);
  api.use("/admin/verification", adminVerificationRouter);
  api.use("/admin/security", adminSecurityRouter);
  api.use("/admin/users", adminUsersRouter);
  api.use("/admin", adminRouter);
  api.use("/teacher", teacherRouter);
  api.use("/users", usersRouter);
  api.use("/custom-requests", customRequestsRouter);
  api.use("/refunds", refundsRouter);
  api.use("/withdrawals", withdrawalsRouter);

  app.use("/api/v1", api);

  // 404 لمسارات API
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "المسار غير موجود" });
  });

  // معالج الأخطاء المركزي (يرمي تفاصيل زود وغيره بشكل موحد)
  app.use(errorHandler);

  void prisma;
  return app;
}
