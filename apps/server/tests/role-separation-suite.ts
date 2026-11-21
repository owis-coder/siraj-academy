// ============================================================
// حزمة الاختبارات الشاملة للفصل الصارم بين الأدوار والصلاحيات
// Comprehensive Role Separation & Permission Enforcement Suite
// ============================================================
import http from "http";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
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

function authHeader(user: { id: string; role: Role; sessionVersion: number }) {
  const token = signToken(user.id, user.role, { sv: user.sessionVersion });
  return { Cookie: `${COOKIE_NAME}=${token}` };
}

async function runRoleSeparationSuite() {
  console.log("\n========================================================");
  console.log("   🚀 بدء فحص الفصل الصارم للأدوار والحدود الأمنية");
  console.log("========================================================\n");

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    // جلب مستخدمي الاختبار التجريبيين من قاعدة البيانات
    const adminUser = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
    const teacherUser = await prisma.user.findFirst({
      where: { role: Role.TEACHER, teacherProfile: { status: "APPROVED" } },
      include: { teacherProfile: true },
    });
    const otherTeacherUser = await prisma.user.findFirst({
      where: { role: Role.TEACHER, id: { not: teacherUser?.id } },
      include: { teacherProfile: true },
    });
    const studentUser = await prisma.user.findFirst({
      where: { role: Role.STUDENT },
    });
    const otherStudentUser = await prisma.user.findFirst({
      where: { role: Role.STUDENT, id: { not: studentUser?.id } },
    });

    if (!adminUser || !teacherUser || !studentUser || !otherStudentUser) {
      throw new Error("بيانات المستخدمين التجريبية غير متوفرة في قاعدة البيانات.");
    }

    const adminAuth = authHeader(adminUser);
    const teacherAuth = authHeader(teacherUser);
    const otherTeacherAuth = otherTeacherUser ? authHeader(otherTeacherUser) : teacherAuth;
    const studentAuth = authHeader(studentUser);
    const otherStudentAuth = authHeader(otherStudentUser);

    // =========================================================================
    // 1. اختبارات صلاحيات الطالب (STUDENT)
    // =========================================================================
    console.log("--- 1. اختبارات صلاحيات الطالب (STUDENT) ---");

    // 1.1 إنشاء طلب شرح
    const createReqRes = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/requests",
      headers: studentAuth,
      body: {
        courseTitle: "رياضيات عامة - اختبار الصلاحيات",
        details: "تفاصيل طلب الشرح مخصصة لاختبار عزل الصلاحيات وحماية الأدوار.",
        type: "ONLINE",
        urgency: "WEEK",
        budget: 150,
      },
    });
    assert("الطالب: إنشاء طلب شرح عادي مسموح (201)", createReqRes.status === 201, createReqRes.body);
    const explainReqId = createReqRes.body?.data?.id;

    // 1.2 إنشاء طلب خدمة مخصصة (Custom Request)
    const createCustomRes = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/custom-requests",
      headers: studentAuth,
      body: {
        requestType: "COURSE_EXPLAIN",
        title: "طلب مخصص تجريبي",
        description: "شرح وحدة كاملة من مقرر جامعي غير مدرج في المنصة.",
        academicLevel: "المستوى الثالث",
        budget: 250,
      },
    });
    assert("الطالب: تقديم طلب خدمة مخصصة مسموح (201)", createCustomRes.status === 201, createCustomRes.body);
    const customReqId = createCustomRes.body?.data?.id;

    // 1.3 استعراض طلباتي المخصصة
    const myCustomRes = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/custom-requests/mine",
      headers: studentAuth,
    });
    assert("الطالب: استعراض قائمة طلباته المخصصة مسموح (200)", myCustomRes.status === 200);

    // 1.4 طالب آخر لا يرى تفاصيل طلب غيره
    if (customReqId) {
      const otherViewCustom = await makeRequest(server, {
        method: "GET",
        path: `/api/v1/custom-requests/${customReqId}`,
        headers: otherStudentAuth,
      });
      assert("طالب آخر: استعراض تفاصيل طلب مخصص لطالب غيره مرفوض (403)", otherViewCustom.status === 403);
    }

    // 1.5 الطالب لا يستطيع تقديم عرض على طلب شرح
    if (explainReqId) {
      const studentOfferRes = await makeRequest(server, {
        method: "POST",
        path: `/api/v1/requests/${explainReqId}/offers`,
        headers: studentAuth,
        body: { price: 100, message: "عرض من طالب" },
      });
      assert("الطالب: محاولة تقديم عرض سعر على طلب شرح مرفوضة (403)", studentOfferRes.status === 403);
    }

    // 1.6 الطالب لا يستطيع إنشاء دورة
    const studentCreateOffering = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/offerings",
      headers: studentAuth,
      body: { courseId: "dummy", summary: "وصف دورة يزيد على عشرين حرفًا للاختبار", price: 100 },
    });
    assert("الطالب: محاولة إنشاء دورة تعليمية مرفوضة (403)", studentCreateOffering.status === 403);

    // 1.7 الطالب لا يستطيع إنشاء إعلان
    const studentCreateAd = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/ads",
      headers: studentAuth,
      body: { title: "إعلان طالب", body: "محتوى الإعلان" },
    });
    assert("الطالب: محاولة إنشاء إعلان ترويجي مرفوضة (403)", studentCreateAd.status === 403);

    // 1.8 الطالب لا يستطيع إنشاء جلسة مباشرة
    const studentCreateLive = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/live-sessions",
      headers: studentAuth,
      body: { title: "جلسة طالب", startsAt: new Date(Date.now() + 86400000).toISOString() },
    });
    assert("الطالب: محاولة إنشاء جلسة مباشرة مرفوضة (403)", studentCreateLive.status === 403);

    // 1.9 الطالب لا يستطيع الوصول للوحة إيرادات المعلمين
    const studentEarnings = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/teacher/earnings",
      headers: studentAuth,
    });
    assert("الطالب: محاولة الوصول لإيرادات المعلمين مرفوضة (403)", studentEarnings.status === 403);

    // 1.10 الطالب لا يستطيع اعتماد أو رفض المدفوعات
    const studentReviewPay = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/payments/any-id/review",
      headers: studentAuth,
      body: { decision: "APPROVED" },
    });
    assert("الطالب: محاولة اعتماد أو مراجعة المدفوعات مرفوضة (403)", studentReviewPay.status === 403);

    // 1.11 الطالب لا يستطيع الوصول لمسارات الإدارة
    const studentAdminAccess = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/admin/users",
      headers: studentAuth,
    });
    assert("الطالب: محاولة الوصول لمسار إداري مرفوضة (403)", studentAdminAccess.status === 403);

    // =========================================================================
    // 2. اختبارات المعلم (TEACHER) ومنع انتحال صفة الطالب
    // =========================================================================
    console.log("\n--- 2. اختبارات المعلم (TEACHER) ومنع السلوك كطالب ---");

    // 2.1 المعلم لا يستطيع إنشاء طلب شرح كطالب
    const teacherCreateReq = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/requests",
      headers: teacherAuth,
      body: {
        courseTitle: "محاولة طلب شرح من معلم",
        details: "المعلم يحاول طلب شرح كطالب بوصف يتجاوز عشرين حرفًا.",
        type: "ONLINE",
      },
    });
    assert("المعلم: محاولة إنشاء طلب شرح كطالب مرفوضة تماماً (403)", teacherCreateReq.status === 403);

    // 2.2 المعلم لا يستطيع إنشاء طلب خدمة مخصصة (Custom Service Request)
    const teacherCreateCustom = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/custom-requests",
      headers: teacherAuth,
      body: {
        requestType: "COURSE_EXPLAIN",
        title: "طلب مخصص من معلم",
        description: "المعلم يحاول استخدام واجهة الشراء وطلب خدمة كطالب مستهلك.",
      },
    });
    assert("المعلم: محاولة تقديم طلب خدمة مخصصة كطالب مرفوضة تماماً (403)", teacherCreateCustom.status === 403);

    // 2.3 المعلم لا يستطيع استعراض /custom-requests/mine
    const teacherCustomMine = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/custom-requests/mine",
      headers: teacherAuth,
    });
    assert("المعلم: استعراض مسار طلبات الطلاب المخصصة مرفوض (403)", teacherCustomMine.status === 403);

    // 2.4 المعلم لا يستطيع شراء خدمة مباشرة كطالب
    const teacherBuyService = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/service-orders",
      headers: teacherAuth,
      body: { slug: "proofreading" },
    });
    assert("المعلم: محاولة شراء خدمة أكاديمية مرفوضة (403)", teacherBuyService.status === 403);

    // 2.5 المعلم لا يستطيع الاشتراك في دورة كطالب
    const anyPublishedOffering = await prisma.courseOffering.findFirst({ where: { status: "PUBLISHED" } });
    if (anyPublishedOffering) {
      const teacherEnroll = await makeRequest(server, {
        method: "POST",
        path: `/api/v1/offerings/${anyPublishedOffering.id}/enroll`,
        headers: teacherAuth,
      });
      assert("المعلم: محاولة التسجيل في دورة كطالب مرفوضة (403)", teacherEnroll.status === 403);
    }

    // 2.6 المعلم لا يستطيع حجز مقعد في جلسة مباشرة كطالب
    const anyLiveSession = await prisma.liveSession.findFirst({ where: { startsAt: { gt: new Date() } } });
    if (anyLiveSession) {
      const teacherBookLive = await makeRequest(server, {
        method: "POST",
        path: `/api/v1/live-sessions/${anyLiveSession.id}/book`,
        headers: teacherAuth,
      });
      assert("المعلم: محاولة حجز جلسة مباشرة كطالب مرفوضة (403)", teacherBookLive.status === 403);
    }

    // 2.7 المعلم لا يستطيع قبول عروض الأسعار
    const anyPendingOffer = await prisma.offer.findFirst({ where: { status: "PENDING" } });
    if (anyPendingOffer) {
      const teacherAcceptOffer = await makeRequest(server, {
        method: "POST",
        path: `/api/v1/offers/${anyPendingOffer.id}/accept`,
        headers: teacherAuth,
      });
      assert("المعلم: محاولة قبول عرض سعر مرفوضة (403)", teacherAcceptOffer.status === 403);
    }

    // 2.8 المعلم لا يستطيع مراجعة واعتماد المدفوعات لنفسه أو لغيره
    const teacherReviewPay = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/payments/any-id/review",
      headers: teacherAuth,
      body: { decision: "APPROVED" },
    });
    assert("المعلم: محاولة اعتماد دفعة أو إيراد مرفوضة (403)", teacherReviewPay.status === 403);

    // 2.9 المعلم لا يستطيع تعديل دورة لمعلم آخر
    if (otherTeacherUser && otherTeacherUser.teacherProfile) {
      const otherOffering = await prisma.courseOffering.findFirst({
        where: { teacherId: otherTeacherUser.teacherProfile.id },
      });
      if (otherOffering) {
        const teacherEditOtherOffering = await makeRequest(server, {
          method: "PATCH",
          path: `/api/v1/offerings/${otherOffering.id}`,
          headers: teacherAuth,
          body: { summary: "محاولة تعديل دورة معلم آخر" },
        });
        assert("المعلم: محاولة تعديل دورة لمعلم آخر مرفوضة بحزم (403)", teacherEditOtherOffering.status === 403);
      }
    }

    // 2.10 المعلم لا يستطيع الوصول لإعدادات الإدارة
    const teacherAdminSettings = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/admin/settings",
      headers: teacherAuth,
    });
    assert("المعلم: محاولة الوصول لإعدادات الإدارة مرفوضة (403)", teacherAdminSettings.status === 403);

    // =========================================================================
    // 3. اختبارات الإدارة (ADMIN) وتدقيق العمليات
    // =========================================================================
    console.log("\n--- 3. اختبارات الإدارة (ADMIN) وسجل التدقيق ---");

    const adminUsers = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/admin/users",
      headers: adminAuth,
    });
    assert("الإدارة: استعراض قائمة المستخدمين مسموح (200)", adminUsers.status === 200);

    const adminAudit = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/admin/audit-logs",
      headers: adminAuth,
    });
    assert("الإدارة: استعراض سجل التدقيق الشامل مسموح (200)", adminAudit.status === 200);

    const teacherAudit = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/admin/audit-logs",
      headers: teacherAuth,
    });
    assert("المعلم: محاولة استعراض سجل التدقيق مرفوضة (403)", teacherAudit.status === 403);

    const studentAudit = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/admin/audit-logs",
      headers: studentAuth,
    });
    assert("الطالب: محاولة استعراض سجل التدقيق مرفوضة (403)", studentAudit.status === 403);

    const adminSettings = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/admin/settings",
      headers: adminAuth,
    });
    assert("الإدارة: استعراض إعدادات المنصة مسموح (200)", adminSettings.status === 200);

    // =========================================================================
    // 4. اختبارات التلاعب المباشر بالـ API (Direct Tampering Attacks)
    // =========================================================================
    console.log("\n--- 4. اختبارات التلاعب المباشر بالـ API (Direct Tampering Attacks) ---");

    // 4.1 محاولة التلاعب بالدور عبر تعديل الملف الشخصي
    const tamperRole = await makeRequest(server, {
      method: "PATCH",
      path: "/api/v1/users/profile",
      headers: studentAuth,
      body: {
        fullName: "طالب مجتهد",
        role: "ADMIN",
      },
    });
    assert("تلاعب: محاولة ترقية الدور عبر PATCH /profile مرفوضة بحزم (400)", tamperRole.status === 400);

    // التحقق من أن الدور لم يتغير في قاعدة البيانات
    const dbCheckUser = await prisma.user.findUnique({ where: { id: studentUser.id }, select: { role: true } });
    assert("أمان: دور الطالب في قاعدة البيانات ظل STUDENT دون تغيير", dbCheckUser?.role === Role.STUDENT);

    // 4.2 محاولة الوصول لمسار محمي بدون جلسة (زائر)
    const guestAccess = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/users/me",
    });
    assert("أمان: وصول الزائر لمسار محمي بلا توكن مرفوض (401)", guestAccess.status === 401);

    // 4.3 محاولة التلاعب بمعرف طلب في رفع السند
    const fakeReceipt = await makeRequest(server, {
      method: "POST",
      path: "/api/v1/orders/non-existent-order-id/receipt",
      headers: studentAuth,
    });
    assert("أمان: محاولة رفع سند لطلب غير موجود أو غير مملوك (400/403/404)", [400, 403, 404].includes(fakeReceipt.status));

    // تنظيف بيانات الاختبار المؤقتة
    if (explainReqId) {
      await prisma.explainRequest.delete({ where: { id: explainReqId } }).catch(() => {});
    }
    if (customReqId) {
      await prisma.customServiceRequest.delete({ where: { id: customReqId } }).catch(() => {});
    }

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log("\n========================================================");
  console.log(`   🏁 النتيجة النهائية: ${passed} اجتازت بنجاح | ${failed} فشلت`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRoleSeparationSuite().catch((err) => {
  console.error("خطأ أثناء تشغيل حزمة اختبارات الصلاحيات:", err);
  process.exit(1);
});
