// ============================================================
// حزمة التحقق المباشر من مسارات Express والإصلاحات الأمنية الستة
// Integration Tests for the 6 Security Fixes (Native HTTP)
// ============================================================
import http from "http";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { totpService } from "../src/lib/totp";
import { totpCipher } from "../src/lib/totpCipher";
import { signToken, COOKIE_NAME } from "../src/lib/jwt";
import { Role } from "@prisma/client";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: any) {
  if (condition) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m ${name}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m ${name}`, detail !== undefined ? detail : "");
    failed++;
  }
}

function makeRequest(
  server: http.Server,
  options: { method: string; path: string; headers?: Record<string, string>; body?: any }
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 4000;

    const payload = options.body ? JSON.stringify(options.body) : "";
    const reqHeaders: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: options.path,
        method: options.method,
        headers: reqHeaders,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsedBody = data;
          try {
            parsedBody = JSON.parse(data);
          } catch {}
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsedBody,
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runExpressIntegrationTests() {
  console.log("\n========================================================");
  console.log("   🚀 بدء فحص تكامل مسارات Express ومطابقة الإصلاحات الستة");
  console.log("========================================================\n");

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    // -------------------------------------------------------------------------
    // فحص 1: تحقق وسيط reCAPTCHA على مسارات المصادقة الحساسة
    // -------------------------------------------------------------------------
    console.log("--- فحص 1: تحقق وسيط reCAPTCHA على مسارات المصادقة الحساسة ---");
    const prevEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "production";
      const resLoginNoCaptcha = await makeRequest(server, {
        method: "POST",
        path: "/api/v1/auth/login",
        body: { identifier: "admin", password: "SomePassword123!" },
      });

      assert("رفض تسجيل الدخول عند غياب رمز reCAPTCHA في الإنتاج بـ 400 CAPTCHA_REQUIRED",
        resLoginNoCaptcha.status === 400 && resLoginNoCaptcha.body?.error?.code === "CAPTCHA_REQUIRED"
      );

      const resRegisterNoCaptcha = await makeRequest(server, {
        method: "POST",
        path: "/api/v1/auth/register/student",
        body: { fullName: "Test Student", username: "test_std_01", email: "std1@siraj.sa", password: "Password123!" },
      });

      assert("رفض تسجيل الطالب عند غياب رمز reCAPTCHA في الإنتاج بـ 400 CAPTCHA_REQUIRED",
        resRegisterNoCaptcha.status === 400 && resRegisterNoCaptcha.body?.error?.code === "CAPTCHA_REQUIRED"
      );

      const resForgotNoCaptcha = await makeRequest(server, {
        method: "POST",
        path: "/api/v1/auth/forgot-password",
        body: { email: "std1@siraj.sa" },
      });

      assert("رفض استعادة كلمة المرور عند غياب رمز reCAPTCHA في الإنتاج بـ 400 CAPTCHA_REQUIRED",
        resForgotNoCaptcha.status === 400 && resForgotNoCaptcha.body?.error?.code === "CAPTCHA_REQUIRED"
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    // في بيئة التطوير، إرسال رمز مزور ومرفوض
    const resInvalidCaptcha = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/auth/login",
      headers: { "x-captcha-token": "test_captcha_invalid_token" },
      body: { identifier: "admin", password: "SomePassword123!" },
    });

    assert("رفض الرمز المزور عبر وسيط requireCaptcha بكود 400 CAPTCHA_FAILED",
      resInvalidCaptcha.status === 400 && resInvalidCaptcha.body?.error?.code === "CAPTCHA_FAILED"
    );

    // -------------------------------------------------------------------------
    // فحص 2: Rate Limiting الخاص بمسار /auth/mfa/verify
    // -------------------------------------------------------------------------
    console.log("\n--- فحص 2: التحقق من تقييد معدل الطلبات لمسار MFA Verify ---");
    const dummyTicket = signToken("test_usr", Role.STUDENT, { sid: "mfa_pending", tokenType: "mfa_pending", expiresIn: "5m" });
    let hitRateLimit = false;

    for (let i = 0; i < 7; i++) {
      const resMfaAttempt = await makeRequest(server, {
        method: "POST",
        path: "/api/v1/auth/mfa/verify",
        body: { mfaTicket: dummyTicket, code: "123456" },
      });

      if (resMfaAttempt.status === 429) {
        hitRateLimit = true;
        assert("إرجاع كود 429 RATE_LIMITED بعد تجاوز 5 محاولات تحقق ثنائي",
          resMfaAttempt.body?.error?.code === "RATE_LIMITED" && resMfaAttempt.headers["retry-after"] !== undefined
        );
        break;
      }
    }
    assert("تم تفعيل حظر التخمين على مسار MFA بنجاح", hitRateLimit === true);

    // -------------------------------------------------------------------------
    // فحص 3: استهلاك تذكرة MFA مرة واحدة ومنع إعادة الاستخدام
    // -------------------------------------------------------------------------
    console.log("\n--- فحص 3: التحقق من صلاحية واستهلاك تذكرة MFA ---");
    const testUsername = "mfa_tester_" + Date.now();
    const testSecret = totpService.generateSecret("tester@siraj.sa", "Siraj Academy").secret;
    const encryptedSec = totpCipher.encrypt(testSecret);

    const testUser = await prisma.user.create({
      data: {
        fullName: "MFA Integration Tester",
        username: testUsername,
        email: `${testUsername}@siraj.sa`,
        passwordHash: "$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        role: Role.STUDENT,
        status: "ACTIVE",
        emailVerified: true,
        totpEnabled: true,
        totpSecret: encryptedSec,
      },
    });

    const validToken = totpService.generateToken(testSecret);
    const userMfaTicket = signToken(testUser.id, testUser.role, {
      sid: "mfa_pending",
      tokenType: "mfa_pending",
      expiresIn: "5m",
    });

    // التحقق الأول: يجب أن ينجح
    const resVerify1 = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/auth/mfa/verify",
      body: { mfaTicket: userMfaTicket, code: validToken },
    });

    assert("إتمام التحقق الثنائي بنجاح للمرة الأولى", resVerify1.status === 200 && !!resVerify1.body?.data?.user);

    // التحقق الثاني بنفس التذكرة والرمز: يجب أن يرفض تمامًا (Single-Use Ticket)
    const resVerify2 = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/auth/mfa/verify",
      body: { mfaTicket: userMfaTicket, code: validToken },
    });

    assert("رفض إعادة استخدام نفس تذكرة الـ MFA لمرة ثانية بكود 401 Unauthorized", resVerify2.status === 401);

    // تنظيف المستخدم التجريبي بأمان
    await prisma.userSession.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });

    // -------------------------------------------------------------------------
    // فحص 4: حظر الأصل (Origin Shield)
    // -------------------------------------------------------------------------
    console.log("\n--- فحص 4: درع الأصل (Origin Shield Middleware) ---");
    const prevCf = process.env.CLOUDFLARE_ENABLED;
    const prevEnv2 = process.env.NODE_ENV;

    try {
      process.env.CLOUDFLARE_ENABLED = "true";
      process.env.NODE_ENV = "production";

      const resHealthz = await makeRequest(server, {
        method: "GET",
        path: "/healthz",
      });
      assert("مسار فحص الصحة healthz متاح دائمًا وغير محظور", resHealthz.status === 200);
    } finally {
      process.env.CLOUDFLARE_ENABLED = prevCf;
      process.env.NODE_ENV = prevEnv2;
    }

    // -------------------------------------------------------------------------
    // فحص 5: Account-Based Rate Limiting واستخراج هوية المستخدم من الكوكي
    // -------------------------------------------------------------------------
    console.log("\n--- فحص 5: التحقق من استخراج هوية الحساب في محدد الطلبات ---");
    const authUserToken = signToken("user_acc_test_123", Role.STUDENT, { sid: "sess_123", tokenType: "access" });

    const resWithCookie = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/platform/public",
      headers: { Cookie: `${COOKIE_NAME}=${authUserToken}` },
    });

    assert("استجابة محدد الطلبات مع وجود كوكي الجلسة السليمة",
      resWithCookie.status === 200 && resWithCookie.headers["ratelimit-limit"] !== undefined
    );

    // -------------------------------------------------------------------------
    // فحص 6: استهلاك تذكرة MFA الذري والتزامن (SET NX Concurrency Guarantee)
    // -------------------------------------------------------------------------
    console.log("\n--- فحص 6: التحقق من الاستهلاك الذري لتذكرة MFA والتزامن المتوازي ---");
    const testUsernameConcurrent = "mfa_concurrent_" + Date.now();
    const testSecretConcurrent = totpService.generateSecret("concurrent@siraj.sa", "Siraj Academy").secret;
    const testUserConcurrent = await prisma.user.create({
      data: {
        fullName: "Concurrent MFA Tester",
        username: testUsernameConcurrent,
        email: `${testUsernameConcurrent}@siraj.sa`,
        passwordHash: "$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        role: Role.STUDENT,
        status: "ACTIVE",
        emailVerified: true,
        totpEnabled: true,
        totpSecret: totpCipher.encrypt(testSecretConcurrent),
      },
    });

    const concurrentMfaTicket = signToken(testUserConcurrent.id, testUserConcurrent.role, {
      sid: "mfa_pending",
      tokenType: "mfa_pending",
      expiresIn: "5m",
    });
    const validOtpConcurrent = totpService.generateToken(testSecretConcurrent);

    // إرسال طلبين متزامنين تمامًا بنفس التذكرة والرمز الصحيح
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      makeRequest(server, {
        method: "POST",
        path: "/api/v1/auth/mfa/verify",
        body: { mfaTicket: concurrentMfaTicket, code: validOtpConcurrent },
      }),
      makeRequest(server, {
        method: "POST",
        path: "/api/v1/auth/mfa/verify",
        body: { mfaTicket: concurrentMfaTicket, code: validOtpConcurrent },
      }),
    ]);

    const statuses = [concurrentRes1.status, concurrentRes2.status].sort();
    assert(
      "طلبين متزامنين بنفس تذكرة MFA: نجاح طلب واحد فقط (200) ورفض الآخر (401)",
      statuses[0] === 200 && statuses[1] === 401
    );

    // تنظيف
    await prisma.userSession.deleteMany({ where: { userId: testUserConcurrent.id } });
    await prisma.user.delete({ where: { id: testUserConcurrent.id } });

    // -------------------------------------------------------------------------
    // فحص 7: الرفض الصريح لتذكرة MFA في وسيط المصادقة requireAuth
    // -------------------------------------------------------------------------
    console.log("\n--- فحص 7: التحقق من الرفض الصريح لتذكرة MFA عبر requireAuth ---");
    const mfaTicketForRequireAuth = signToken("test_mfa_reject_id", Role.ADMIN, {
      sid: "mfa_pending",
      tokenType: "mfa_pending",
      expiresIn: "5m",
    });

    const resMeWithMfa = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/auth/me",
      headers: { Cookie: `${COOKIE_NAME}=${mfaTicketForRequireAuth}` },
    });
    assert(
      "رفض تذكرة MFA فورًا بـ 401 في مسار /auth/me دون فحص قاعدة البيانات",
      resMeWithMfa.status === 401 && resMeWithMfa.body?.message?.includes("رمز مصادقة ثنائية مؤقت")
    );

    const resAdminWithMfa = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/admin/security/stats",
      headers: { Cookie: `${COOKIE_NAME}=${mfaTicketForRequireAuth}` },
    });
    assert(
      "رفض تذكرة MFA فورًا بـ 401 في مسار لوحة الإدارة /admin",
      resAdminWithMfa.status === 401 && resAdminWithMfa.body?.message?.includes("رمز مصادقة ثنائية مؤقت")
    );

    const resRequestsWithMfa = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/requests",
      headers: { Cookie: `${COOKIE_NAME}=${mfaTicketForRequireAuth}` },
      body: { courseTitle: "Test Course" },
    });
    assert(
      "رفض تذكرة MFA فورًا بـ 401 في مسار الطلبات /requests",
      resRequestsWithMfa.status === 401 && resRequestsWithMfa.body?.message?.includes("رمز مصادقة ثنائية مؤقت")
    );

    // قبول Access Token السليم في requireAuth
    const realUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
    if (realUser) {
      const realSession = await prisma.userSession.create({
        data: { userId: realUser.id },
      });
      const validAccessToken = signToken(realUser.id, realUser.role, {
        sid: realSession.id,
        sv: realUser.sessionVersion,
        tokenType: "access",
      });

      const resMeValid = await makeRequest(server, {
        method: "GET",
        path: "/api/v1/auth/me",
        headers: { Cookie: `${COOKIE_NAME}=${validAccessToken}` },
      });
      assert(
        "قبول Access Token الصحيح في مسار /auth/me بنجاح (200 OK)",
        resMeValid.status === 200 && resMeValid.body?.data?.user?.id === realUser.id
      );

      // التأكد من رفض Access Token في مسار MFA Verify
      const resMfaWithAccessToken = await makeRequest(server, {
        method: "POST",
        path: "/api/v1/auth/mfa/verify",
        body: { mfaTicket: validAccessToken, code: "123456" },
      });
      assert(
        "رفض استخدام Access Token في مسار MFA Verify بكود 401",
        resMfaWithAccessToken.status === 401
      );

      await prisma.userSession.delete({ where: { id: realSession.id } });
    }
  } finally {
    server.close();
  }

  console.log("\n========================================================");
  console.log(`   🏁 نتيجة فحوصات التكامل: ${passed} ناجح | ${failed} فاشل`);
  console.log("========================================================\n");

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

void runExpressIntegrationTests();
