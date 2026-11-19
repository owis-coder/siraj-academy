// ============================================================
// ترويسات الأمان المتقدمة وحماية المتصفح (Helmet & CSP & Defense-in-Depth)
// تضبط سياسات أمان صارمة مع دعم تضمين يوتيوب، reCAPTCHA، وSocket.IO
// دون كسر أي وظيفة في الواجهة أو عمليات الدفع.
// ============================================================
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";

const isProd = process.env.NODE_ENV === "production";

export const securityHeaders = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // مطلوب لحزم Vite ومكونات React التفاعلية
          "https://www.google.com/recaptcha/",
          "https://www.gstatic.com/recaptcha/",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],
        fontSrc: [
          "'self'",
          "data:",
          "https://fonts.gstatic.com",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https:",
        ],
        frameSrc: [
          "'self'",
          "https://www.google.com/recaptcha/",
          "https://recaptcha.google.com/",
          "https://www.youtube.com",
          "https://www.youtube-nocookie.com",
        ],
        connectSrc: [
          "'self'",
          "http://localhost:*",
          "ws://localhost:*",
          "wss:",
          "https:",
          "https://www.google.com/recaptcha/",
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"], // يمنع هجمات Clickjacking
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // للسماح بتضمين فيديوهات الشروحات من يوتيوب
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: isProd
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    noSniff: true,
    xssFilter: true,
  }),

  // ترويسات أمان إضافية وسياسة الأذونات (Permissions-Policy)
  (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    );
    next();
  },
];
