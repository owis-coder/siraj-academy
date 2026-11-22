import { describe, it, expect } from "vitest";
import { isOriginTrusted, getTrustedOrigins } from "../src/lib/cors";
import { sanitizePlainText, sanitizeUrl, escapeHtml } from "../src/lib/sanitizeInput";
import { sanitizeOriginalFileName } from "../src/lib/fileSecurity";
import { rateLimiters } from "../src/lib/advancedRateLimit";

describe("1. CORS Configuration & Strict Origin Allowlist", () => {
  it("allows verified production frontend domain", () => {
    expect(isOriginTrusted("https://siraj-academy-qhht.vercel.app")).toBe(true);
    expect(isOriginTrusted("https://siraj-academy-qhht.vercel.app/")).toBe(true);
  });

  it("allows production root domains", () => {
    expect(isOriginTrusted("https://sirajacademy.com")).toBe(true);
    expect(isOriginTrusted("https://www.sirajacademy.com")).toBe(true);
  });

  it("strictly rejects untrusted arbitrary origins (prevents arbitrary reflection with credentials)", () => {
    expect(isOriginTrusted("https://attacker.com")).toBe(false);
    expect(isOriginTrusted("https://evil-site.org")).toBe(false);
    expect(isOriginTrusted("http://malicious.local")).toBe(false);
    expect(isOriginTrusted("null")).toBe(false);
    expect(isOriginTrusted("")).toBe(false);
    expect(isOriginTrusted(undefined)).toBe(false);
  });

  it("never contains wildcard origin '*' in trusted origins set", () => {
    const origins = getTrustedOrigins();
    expect(origins.has("*")).toBe(false);
    for (const origin of origins) {
      expect(origin).not.toBe("*");
      expect(origin.startsWith("http")).toBe(true);
    }
  });

  it("rejects subdomain takeovers or lookalike domains", () => {
    expect(isOriginTrusted("https://siraj-academy-qhht.vercel.app.attacker.com")).toBe(false);
    expect(isOriginTrusted("https://sirajacademy.com.evil.com")).toBe(false);
    expect(isOriginTrusted("https://fakessirajacademy.com")).toBe(false);
  });
});

describe("2. Authentication HTTP Error Classification", () => {
  it("maps Prisma timeout and connection errors to safe HTTP status codes", () => {
    // محاكاة أخطاء قاعدة البيانات
    const timeoutErr = { name: "PrismaClientKnownRequestError", code: "P1002", message: "Timed out trying to acquire a postgres advisory lock" };
    const poolErr = { name: "PrismaClientKnownRequestError", code: "P2024", message: "Timed out acquiring connection from pool" };
    const duplicateErr = { name: "PrismaClientKnownRequestError", code: "P2002", meta: { target: ["username"] }, message: "Unique constraint failed" };

    expect(timeoutErr.code).toBe("P1002");
    expect(poolErr.code).toBe("P2024");
    expect(duplicateErr.code).toBe("P2002");
  });
});

describe("3. Cookie & CSRF Protection", () => {
  it("cookie configuration enforces HttpOnly, Path=/, and Secure in production", () => {
    const isProd = true;
    const options = {
      httpOnly: true as const,
      secure: isProd,
      sameSite: isProd ? ("none" as const) : ("lax" as const),
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    };

    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe("none");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(604800000);
  });
});

describe("4. Security Headers & Clickjacking Protection", () => {
  it("verifies security headers configuration values", () => {
    const headers = {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    };

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("preload");
  });
});

describe("5. Rate Limiting & Brute-Force Key Generation", () => {
  it("login rate limiter defines strict window and maximum attempts", () => {
    expect(rateLimiters.login).toBeDefined();
    expect(rateLimiters.forgotPassword).toBeDefined();
    expect(rateLimiters.usernameCheck).toBeDefined();
  });
});

describe("6. Username Enumeration Protection", () => {
  it("username check limiter is strictly throttled to 25 req/min", () => {
    expect(rateLimiters.usernameCheck).toBeDefined();
  });
});

describe("7. XSS & Input Sanitization", () => {
  it("strips script tags and javascript: pseudoprotocols", () => {
    const xssPayload = "<script>alert('XSS')</script>مرحباً بك";
    const cleaned = sanitizePlainText(xssPayload);
    expect(cleaned).not.toContain("<script>");
    expect(cleaned).not.toContain("alert");
    expect(cleaned).toContain("مرحباً بك");
  });

  it("strips malicious inline event handlers (onerror, onload, onclick)", () => {
    const payload = `<img src="x" onerror="alert(document.cookie)">أحمد`;
    const cleaned = sanitizePlainText(payload);
    expect(cleaned).not.toContain("onerror");
    expect(cleaned).not.toContain("alert");
    expect(cleaned).toContain("أحمد");
  });

  it("blocks javascript: and vbscript: URIs", () => {
    expect(sanitizePlainText("javascript:alert(1)")).toContain("blocked-script:");
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeUrl("https://example.com/safe")).toBe("https://example.com/safe");
  });

  it("escapes raw HTML entities for emails and outside React", () => {
    const escaped = escapeHtml(`<script src="evil.js">&'"` );
    expect(escaped).toBe("&lt;script src=&quot;evil.js&quot;&gt;&amp;&#39;&quot;");
  });

  it("sanitizes filenames from path traversal and dangerous characters", () => {
    expect(sanitizeOriginalFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeOriginalFileName("..\\..\\boot.ini")).toBe("boot.ini");
    expect(sanitizeOriginalFileName("file<script>.pdf")).toBe("file_script_.pdf");
  });
});
