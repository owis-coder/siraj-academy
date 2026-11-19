// ============================================================
// اختبار صفحة الطلب المحددة (عقد الاستجابة + الخصوصية + الحالات).
// يمنع عودة الخطأ الأصلي: كان الخادم يعيد { data: { request, offers } }
// بينما الواجهة تقرأ data كأنه الطلب، فينهار العرض عند r.id.slice().
// التشغيل: npm run test:request   (خادم على 4000 + قاعدة البيانات)
// ============================================================
import { PrismaClient } from "@prisma/client";
import { collect, login, req, DEMO_PASSWORD } from "./api-helpers";

const prisma = new PrismaClient();
const { results, check, status } = collect();

const TARGET_ID = process.env.REQUEST_ID || "cmvte7yv3002htmbc1raadsd6";
const API = "/api/v1";

async function main() {
  console.log("====================================================");
  console.log("اختبار صفحة الطلب وعقد /requests/:id");
  console.log("====================================================\n");

  const target = await prisma.explainRequest.findUnique({
    where: { id: TARGET_ID },
    include: { student: true, _count: { select: { offers: true } } },
  });
  check("الطلب المحدد موجود في قاعدة البيانات الحالية", !!target, TARGET_ID);
  if (!target) {
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  /* ---------- زائر ---------- */
  const guest = await req(null, "GET", `${API}/requests/${TARGET_ID}`);
  status("فتح رابط الطلب كزائر لا يفشل", guest, 200);
  const g = guest.body?.data ?? {};
  check("الاستجابة كائن طلب مسطّح لا { request, offers }", g.id === TARGET_ID && !("request" in g));
  check("عرض عنوان الطلب الصحيح", typeof g.courseTitle === "string" && g.courseTitle.length > 0);
  check("عرض حالة الطلب", g.status === target.status);
  check("الزائر يحصل على عرض محدود", g.restricted === true);
  check("لا تُكشف تفاصيل الطلب للزائر", g.details === undefined);
  check("لا تُكشف مرفقات الطلب للزائر", g.attachments === undefined);
  check("لا تُكشف هوية الطالب للزائر", g.student === undefined);
  check("لا تُكشف ميزانية الطلب للزائر", g.budget === undefined);
  check("عدد العروض متاح كرقم", typeof g.offersCount === "number" && g.offersCount === target._count.offers);
  check("عروض المدرسين غير مرئية للزائر", g.offers === undefined);

  /* ---------- مالك الطلب ---------- */
  const owner = await login(target.student.username, DEMO_PASSWORD);
  const ownerRes = await req(owner, "GET", `${API}/requests/${TARGET_ID}`);
  status("فتح الطلب كصاحب الطلب", ownerRes, 200);
  const o = ownerRes.body?.data ?? {};
  check("صاحب الطلب يرى بياناته كاملة", o.id === TARGET_ID && o.restricted === false && typeof o.details === "string");
  check("صاحب الطلب يرى عروض المدرسين", Array.isArray(o.offers) && o.offers.length === target._count.offers);
  check("عدد العروض مطابق لقاعدة البيانات", o.offersCount === target._count.offers);
  check("المعرّف نفسه يُعيد id مطابقًا (سبب انهيار الصفحة سابقًا)", typeof o.id === "string" && o.id.length > 10);

  /* ---------- مدرّس معتمد ---------- */
  const teacherProfile = await prisma.teacherProfile.findFirst({
    where: { status: "APPROVED", user: { username: { startsWith: "demo_" } } },
    include: { user: true },
  });
  check("يوجد مدرّس معتمد لاختبار الوصول", !!teacherProfile);
  if (teacherProfile) {
    const teacher = await login(teacherProfile.user.username, DEMO_PASSWORD);
    const tRes = await req(teacher, "GET", `${API}/requests/${TARGET_ID}`);
    status("فتح الطلب كمدرّس معتمد", tRes, 200);
    const t = tRes.body?.data ?? {};
    check("المدرّس المعتمد يرى تفاصيل الطلب", t.restricted === false && typeof t.details === "string");
    check("عروض المدرسين لا تُكشف للمدرّس الآخر", t.offers === undefined);
  }

  /* ---------- طالب آخر (غير مصرح بالتفاصيل) ---------- */
  const otherStudent = await prisma.user.findFirst({
    where: { role: "STUDENT", id: { not: target.studentId }, username: { startsWith: "demo_" } },
    select: { username: true },
  });
  check("يوجد طالب آخر لاختبار عدم التفويض", !!otherStudent);
  if (otherStudent) {
    const other = await login(otherStudent.username, DEMO_PASSWORD);
    const oRes = await req(other, "GET", `${API}/requests/${TARGET_ID}`);
    status("طالب آخر يفتح طلبًا عامًا (مفتوح)", oRes, 200);
    check("الطالب الآخر يحصل على عرض محدود", oRes.body?.data?.restricted === true);
    check("لا تُكشف تفاصيل طلب غيره", oRes.body?.data?.details === undefined);
  }

  /* ---------- الإدارة ---------- */
  const admin = await login("demo_manager@demo.siraj.local", DEMO_PASSWORD);
  const aRes = await req(admin, "GET", `${API}/requests/${TARGET_ID}`);
  status("فتح الطلب كإدارة", aRes, 200);
  check("الإدارة ترى العروض", Array.isArray(aRes.body?.data?.offers));

  /* ---------- معرّف غير موجود ---------- */
  const missing = await req(null, "GET", `${API}/requests/does-not-exist-${Date.now()}`);
  status("معرّف غير موجود يعيد 404", missing, 404);
  check("رسالة «الطلب غير موجود» واضحة", typeof missing.body?.message === "string" && missing.body.message.includes("غير موجود"));

  /* ---------- طلب قيد المراجعة: لا يُكشف لغيره ---------- */
  const stamp = Date.now().toString(36);
  const regRes = await req(null, "POST", `${API}/auth/register/student`, {
    fullName: "مختبر الخصوصية",
    username: `priv_${stamp}`,
    email: `priv_${stamp}@test.local`,
    password: "PrivacyTest2026",
    confirmPassword: "PrivacyTest2026",
  });
  status("تسجيل صاحب طلب جديد للاختبار", regRes, 201);
  const rawCookie = regRes.headers.get("set-cookie") ?? "";
  const m = /sid=([^;]+)/.exec(rawCookie);
  const studentCookie = m ? `sid=${m[1]}` : undefined;
  const creator = { name: `priv_${stamp}`, cookie: studentCookie, id: regRes.body?.data?.user?.id as string };

  const createRes = await req(creator, "POST", `${API}/requests`, {
    courseTitle: `طلب خصوصية ${stamp}`,
    details: "تفاصيل سرية لا يجب أن تظهر لغيره.",
    type: "ONLINE",
    urgency: "WEEK",
  });
  status("إنشاء طلب شرح جديد (قيد المراجعة)", createRes, 201);
  const newId: string = createRes.body?.data?.id;

  status("طلب قيد المراجعة لا يظهر لزائر (404 بلا تسريب)", await req(null, "GET", `${API}/requests/${newId}`), 404);
  const other = otherStudent ? await login(otherStudent.username, DEMO_PASSWORD) : null;
  if (other) {
    status("طلب قيد المراجعة لا يظهر لطالب آخر (404 بلا تسريب)", await req(other, "GET", `${API}/requests/${newId}`), 404);
  }
  const ownerNew = await req(creator, "GET", `${API}/requests/${newId}`);
  status("صاحب الطلب يرى طلبه قيد المراجعة", ownerNew, 200);
  check("تفاصيل الطلب تظهر لصاحبه", ownerNew.body?.data?.details === "تفاصيل سرية لا يجب أن تظهر لغيره.");

  /* ---------- طلب مغلق: 403 واضح لغيره ---------- */
  status("نشر الطلب من الإدارة", await req(admin, "POST", `${API}/requests/${newId}/publish`), 200);
  status("إغلاق الطلب من صاحبه", await req(creator, "POST", `${API}/requests/${newId}/close`), 200);
  status("الزائر يُمنع من طلب مغلق برسالة واضحة", await req(null, "GET", `${API}/requests/${newId}`), 403);
  const denied = await req(null, "GET", `${API}/requests/${newId}`);
  check("رسالة رفض واضحة لا تكشف بيانات الطلب", typeof denied.body?.message === "string" && denied.body.message.includes("متاح"));

  const auditDenied = await prisma.auditLog.findFirst({
    where: { action: "EXPLAIN_REQUEST_VIEW_DENIED", targetId: newId },
    orderBy: { createdAt: "desc" },
  });
  check("تسجيل محاولة عرض طلب غير مصرح بها", !!auditDenied && auditDenied.result === "FAILURE");

  /* ---------- الملخص ---------- */
  const failed = results.filter((r) => !r.ok);
  console.log(`\nالنتيجة: ${results.length - failed.length}/${results.length} ناجح`);
  if (failed.length) {
    console.log("\nفشل:");
    failed.forEach((f) => console.log(` - ${f.name} ${f.detail ? `(${f.detail})` : ""}`));
  }
  await prisma.$disconnect();
  process.exitCode = failed.length ? 1 : 0;
}

void main().catch(async (e) => {
  console.error("\n[FATAL]", e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
