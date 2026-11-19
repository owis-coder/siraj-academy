import crypto from "crypto";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:4000/api/v1";

interface Res {
  status: number;
  body: any;
  headers: Headers;
}

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

async function request(path: string, options: { method?: string; body?: any; cookie?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.cookie) {
    headers["cookie"] = options.cookie;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let body: any = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

function getCookie(res: Res): string | undefined {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return undefined;
  const match = setCookie.match(/sid=[^;]+/);
  return match ? match[0] : undefined;
}

let passedCount = 0;
let failedCount = 0;

function assert(description: string, condition: boolean, extraInfo?: any) {
  if (condition) {
    console.log(`PASS — ${description}`);
    passedCount++;
  } else {
    console.error(`FAIL — ${description}`, extraInfo ? extraInfo : "");
    failedCount++;
  }
}

async function runAudit() {
  console.log("====================================================");
  console.log("تدقيق شامل وعملي لأنظمة سراج (LIVE AUDIT VERIFICATION)");
  console.log("====================================================\n");

  const stamp = Date.now();

  /* ----------------------------------------------------
     المهمة 4: فحص اسم المستخدم المباشر (Username Availability)
  ---------------------------------------------------- */
  console.log("--- فحص اسم المستخدم المباشر (المهمة 4) ---");
  const availUser = `avail_${stamp}`;
  const resAvail = await request(`/auth/username-availability?username=${availUser}`);
  assert(
    "اسم مستخدم متاح يعيد { valid: true, available: true }",
    resAvail.status === 200 && resAvail.body?.data?.valid === true && resAvail.body?.data?.available === true,
    resAvail.body
  );

  const resTaken = await request(`/auth/username-availability?username=siraj_admin`);
  assert(
    "اسم مستخدم محجوز (siraj_admin) يعيد { valid: true, available: false }",
    resTaken.status === 200 && resTaken.body?.data?.valid === true && resTaken.body?.data?.available === false,
    resTaken.body
  );

  const resInvalid = await request(`/auth/username-availability?username=مستخدم_عربي`);
  assert(
    "اسم مستخدم بحروف عربية يعيد { valid: false, available: false }",
    resInvalid.status === 200 && resInvalid.body?.data?.valid === false && resInvalid.body?.data?.available === false,
    resInvalid.body
  );

  const resSpace = await request(`/auth/username-availability?username=user+space`);
  assert(
    "اسم مستخدم بمسافة يعيد { valid: false, available: false }",
    resSpace.status === 200 && resSpace.body?.data?.valid === false,
    resSpace.body
  );

  /* ----------------------------------------------------
     المهمة 5: منع تكرار اسم المستخدم بالتزامن (Concurrency Collision)
  ---------------------------------------------------- */
  console.log("\n--- منع تكرار اسم المستخدم عند إرسال طلبين متزامنين (المهمة 5) ---");
  const concurrentUsername = `col_${stamp}`;
  const p1 = request(`/auth/register/student`, {
    method: "POST",
    body: {
      fullName: "طالب متزامن أول",
      username: concurrentUsername,
      email: `conc1_${stamp}@test.siraj.local`,
      password: "Password123",
      confirmPassword: "Password123",
    },
  });
  const p2 = request(`/auth/register/student`, {
    method: "POST",
    body: {
      fullName: "طالب متزامن ثان",
      username: concurrentUsername,
      email: `conc2_${stamp}@test.siraj.local`,
      password: "Password123",
      confirmPassword: "Password123",
    },
  });

  const [cRes1, cRes2] = await Promise.all([p1, p2]);
  const statuses = [cRes1.status, cRes2.status].sort();
  assert(
    "طلبين متزامنين بنفس اسم المستخدم: يقبل واحد فقط (201) ويرفض الآخر بالتعارض (409)",
    statuses[0] === 201 && statuses[1] === 409,
    { status1: cRes1.status, status2: cRes2.status }
  );

  /* ----------------------------------------------------
     المهمة 6: نموذج التسجيل بدون بيانات اختيارية + إضافتها لاحقًا من الإعدادات
  ---------------------------------------------------- */
  console.log("\n--- نموذج التسجيل وإعدادات الحساب (المهمة 6) ---");
  const studentUsername = `student_${stamp}`;
  const studentEmail = `audit_${stamp}@test.siraj.local`;
  const regPayload = {
    fullName: "أحمد طالب التدقيق",
    username: studentUsername,
    email: studentEmail,
    password: "Password123",
    confirmPassword: "Password123",
  };

  const regRes = await request(`/auth/register/student`, { method: "POST", body: regPayload });
  assert("إنشاء حساب طالب بدون إدخال أي حقول اختيارية (201 Created)", regRes.status === 201, regRes.body);

  const studentCookie = getCookie(regRes);
  assert("استلام كوكي المصادقة الآمن للجلسة", !!studentCookie);

  // التحقق من الحقول في /auth/me
  const meRes = await request(`/auth/me`, { cookie: studentCookie });
  assert(
    "الحساب يُنشأ بحالة بريد غير موثّق وحقول اختيارية فارغة (null)",
    meRes.status === 200 &&
      meRes.body?.data?.user?.emailVerified === false &&
      meRes.body?.data?.user?.whatsapp === null &&
      meRes.body?.data?.user?.level === null
  );

  // تعديل الحقول الاختيارية من إعدادات الحساب (PATCH /api/v1/users/me)
  const patchRes = await request(`/users/me`, {
    method: "PATCH",
    cookie: studentCookie,
    body: {
      whatsapp: "0501234567",
      level: "السنة الثالثة",
    },
  });
  assert("تحديث البيانات الاختيارية من صفحة الإعدادات بنجاح (200 OK)", patchRes.status === 200, patchRes.body);

  const meUpdated = await request(`/auth/me`, { cookie: studentCookie });
  assert(
    "استرجاع البيانات الاختيارية بعد تحديثها في الحساب",
    meUpdated.body?.data?.user?.whatsapp === "0501234567" &&
      meUpdated.body?.data?.user?.level === "السنة الثالثة"
  );

  /* ----------------------------------------------------
     المهمة 2: توثيق البريد الحالي بنقرة زر واحدة حتى اكتمال التوثيق
  ---------------------------------------------------- */
  console.log("\n--- توثيق البريد الإلكتروني الحالي بنقرة زر (المهمة 2) ---");

  // محاكاة مرور فترة التهدئة (60 ثانية) للرمز الذي أُرسل تلقائيًا عند التسجيل
  await prisma.authToken.updateMany({
    where: { userId: meRes.body.data.user.id, type: "EMAIL_VERIFY" },
    data: { createdAt: new Date(Date.now() - 65 * 1000) },
  });

  const verifyReqRes = await request(`/auth/email/verify-request`, {
    method: "POST",
    cookie: studentCookie,
  });
  assert(
    "إرسال رابط التوثيق للبريد الحالي بدون طلب كلمة مرور أو بريد جديد (200 OK)",
    verifyReqRes.status === 200 && verifyReqRes.body?.data?.message?.includes("تم إرسال رابط التوثيق"),
    verifyReqRes.body
  );

  // استخراج الرمز الصادر من جدول الرموز للتحقق الفعلي
  const tokenRecord = await prisma.authToken.findFirst({
    where: { user: { email: studentEmail }, type: "EMAIL_VERIFY" },
    orderBy: { createdAt: "desc" },
  });
  assert("رمز التوثيق تم إنشاؤه وتخزينه كـ SHA-256 Hash", !!tokenRecord && tokenRecord.tokenHash.length === 64);

  // محاكاة فتح الرابط الوارد في البريد
  // ننشئ رمز اختبار عشوائي معروف التجزئة ونحقنه لاختبار endpoint التوثيق بدقة
  const rawToken = crypto.randomBytes(24).toString("hex");
  await prisma.authToken.create({
    data: {
      userId: meRes.body.data.user.id,
      type: "EMAIL_VERIFY",
      tokenHash: sha256(rawToken),
      newEmail: studentEmail,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 دقيقة
    },
  });

  const confirmRes = await request(`/auth/verify-email`, {
    method: "POST",
    body: { token: rawToken },
  });
  assert(
    "توثيق البريد بنجاح بعد فتح الرابط (200 OK)",
    confirmRes.status === 200 && confirmRes.body?.data?.emailVerified === true,
    confirmRes.body
  );

  const meVerified = await request(`/auth/me`, { cookie: studentCookie });
  assert(
    "حالة البريد في الحساب أصبحت موثّقة (emailVerified: true)",
    meVerified.body?.data?.user?.emailVerified === true
  );

  /* ----------------------------------------------------
     المهمة 3: انتهاء الصلاحية وإعادة الاستخدام وإعادة الإرسال
  ---------------------------------------------------- */
  console.log("\n--- اختبارات انتهاء الصلاحية وإعادة الاستخدام (المهمة 3) ---");
  // 1. إعادة استخدام نفس الرمز (Replay attack prevention)
  const replayRes = await request(`/auth/verify-email`, {
    method: "POST",
    body: { token: rawToken },
  });
  assert(
    "منع إعادة استخدام رمز التوثيق مرة ثانية بعد استهلاكه (400 Bad Request)",
    replayRes.status === 400,
    replayRes.body
  );

  // 2. انتهاء صلاحية الرمز (Expired token)
  const expiredRawToken = crypto.randomBytes(24).toString("hex");
  await prisma.authToken.create({
    data: {
      userId: meRes.body.data.user.id,
      type: "EMAIL_VERIFY",
      tokenHash: sha256(expiredRawToken),
      newEmail: studentEmail,
      expiresAt: new Date(Date.now() - 5 * 60 * 1000), // منتهي منذ 5 دقائق
    },
  });

  const expiredRes = await request(`/auth/verify-email`, {
    method: "POST",
    body: { token: expiredRawToken },
  });
  assert(
    "رفض رمز التوثيق منتهي الصلاحية (400 Bad Request)",
    expiredRes.status === 400,
    expiredRes.body
  );

  // 3. إعادة طلب التوثيق لحساب موثّق بالفعل
  const alreadyVerifiedRes = await request(`/auth/email/verify-request`, {
    method: "POST",
    cookie: studentCookie,
  });
  assert(
    "طلب التوثيق لحساب موثّق مسبقًا يعيد رسالة فورية بأن البريد موثّق (emailVerified: true)",
    alreadyVerifiedRes.status === 200 && alreadyVerifiedRes.body?.data?.emailVerified === true,
    alreadyVerifiedRes.body
  );

  /* ----------------------------------------------------
     المهمة 7 & 8: حجب التفاصيل التقنية وتنقية الأخطاء
  ---------------------------------------------------- */
  console.log("\n--- حجب التفاصيل التقنية وتنقية الأخطاء (المهام 7 و8) ---");
  // إرسال طلب خاطئ متعمد يتسبب في خطأ فني لفحص تنقية الاستجابة
  const badEndpointRes = await request(`/auth/register/student`, {
    method: "POST",
    body: {
      fullName: "اسم مع كود SQL '; DROP TABLE users; --",
      username: `sql_${stamp}`,
      email: "invalid-email-format",
      password: "short",
      confirmPassword: "short",
    },
  });

  const bodyStr = JSON.stringify(badEndpointRes.body);
  const leakedPrisma = /prisma|postgres|sql|select|where|database|syntax error/i.test(bodyStr);
  assert(
    "استجابة الأخطاء لا تحتوي أي أسماء جداول أو استعلامات SQL أو محركات قاعدة بيانات",
    !leakedPrisma && badEndpointRes.status === 400,
    { status: badEndpointRes.status, body: badEndpointRes.body }
  );

  // فحص endpoint الصحة /healthz
  const healthRes = await request(`/../../healthz`);
  const healthStr = JSON.stringify(healthRes.body);
  const leakedHealth = /prisma|database|lazy-connected|postgres/i.test(healthStr);
  assert(
    "نقطة الفحص /healthz خالية من أي تفاصيل اتصال أو أسماء تقنية داخلية",
    !leakedHealth && healthRes.body?.data?.status === "ok",
    healthRes.body
  );

  console.log("\n====================================================");
  console.log(`إجمالي الاختبارات الناجحة: ${passedCount}`);
  console.log(`إجمالي الاختبارات الفاشلة: ${failedCount}`);
  console.log("====================================================");

  await prisma.$disconnect();
  if (failedCount > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error("FATAL ERROR IN AUDIT SCRIPT:", err);
  process.exit(1);
});
