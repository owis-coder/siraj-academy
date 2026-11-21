/**
 * اختبارات تكامل حقيقية لنموذج التواصل المركزي (عبر HTTP).
 *
 * ⚠️ تُعدّل بيانات عبر API. لا تُشغّل هذا الملف ضد قاعدة إنتاج.
 * شغّله على قاعدة اختبار معزولة وخادم محلي:
 *
 *   ALLOW_LIVE_TESTS=1 API_BASE=http://127.0.0.1:4000 npx tsx tests/centralized-communication.ts
 *
 * الحسابات الافتراضية من prisma/seed-demo.ts (يمكن تجاوزها بمتغيرات البيئة).
 */
import { collect, login, req, type Session } from "./api-helpers";

const ENABLED = process.env.ALLOW_LIVE_TESTS === "1";

if (!ENABLED) {
  console.log(
    "SKIPPED — centralized-communication integration tests require ALLOW_LIVE_TESTS=1 and an isolated test database.",
  );
  process.exit(0);
}

const ADMIN_ID = process.env.TEST_ADMIN || "admin@siraj.sa";
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || "Siraj@2026Admin";
const STUDENT_ID = process.env.TEST_STUDENT || "demo_lama";
const TEACHER_ID = process.env.TEST_TEACHER || "demo_sara";
const TEACHER2_ID = process.env.TEST_TEACHER2 || "demo_abdullah";
const DEMO_PASS = process.env.TEST_PASS || "Demo@2026!";

async function main() {
  const { results, check, status } = collect();
  let admin: Session, student: Session, teacher: Session, teacher2: Session;

  try {
    admin = await login(ADMIN_ID, ADMIN_PASS);
    student = await login(STUDENT_ID, DEMO_PASS);
    teacher = await login(TEACHER_ID, DEMO_PASS);
    teacher2 = await login(TEACHER2_ID, DEMO_PASS);
  } catch (e) {
    console.error("تعذر تسجيل الدخول للحسابات التجريبية:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  // 1) الطالب لا يستطيع إنشاء محادثة مباشرة مع المدرس
  status("1. student cannot open a direct room with a teacher", await req(student, "POST", "/api/v1/chat/rooms", { peerId: teacher.id }), 403);
  // 2) المدرس لا يستطيع إنشاء محادثة مباشرة مع الطالب
  status("2. teacher cannot open a direct room with a student", await req(teacher, "POST", "/api/v1/chat/rooms", { peerId: student.id }), 403);

  // 7) محتوى يحتوي على رقم هاتف يُرفض
  status(
    "7. request with a phone number is rejected",
    await req(student, "POST", "/api/v1/requests", {
      courseTitle: "طلب اختبار فحص المحتوى",
      details: "أحتاج شرحًا، رقمي 0551234567 تواصل معي.",
      type: "ONLINE",
      urgency: "WEEK",
    }),
    400,
  );

  // 8) البريد الشخصي يُكتشف
  status(
    "8. request with a personal email is rejected",
    await req(student, "POST", "/api/v1/requests", {
      courseTitle: "طلب اختبار البريد",
      details: "راسلني على student.personal@example.com بخصوص الشرح.",
      type: "ONLINE",
      urgency: "WEEK",
    }),
    400,
  );

  // 9) رابط خارجي لا يُنشر
  status(
    "9. offering with an external link is rejected",
    await req(teacher, "POST", "/api/v1/offerings", {
      courseTitle: "مقرر اختبار الروابط الخارجية",
      summary: "تفاصيل الدورة على https://example.com/my-course",
      price: 120,
    }),
    400,
  );

  // 10) الرابط المختصر يحتاج مراجعة — يُقبل كمسودة فقط ولا يُنشر
  const shortLinkOffering = await req(teacher, "POST", "/api/v1/offerings", {
    courseTitle: `مقرر اختبار الروابط المختصرة ${Date.now()}`,
    summary: "مصادر إضافية على https://bit.ly/3xYzAbC",
    price: 100,
  });
  check("10. short link is accepted only as an unpublished draft", shortLinkOffering.status === 201 && shortLinkOffering.body?.data?.status === "DRAFT", `HTTP ${shortLinkOffering.status}`);

  // 11) رابط YouTube ينتظر اعتماد الإدارة
  const youtubeOffering = await req(teacher, "POST", "/api/v1/offerings", {
    courseTitle: `مقرر اختبار يوتيوب ${Date.now()}`,
    summary: "دورة تجريبية لاختبار اعتماد روابط الفيديو.",
    price: 150,
    trialVideoUrl: "https://www.youtube.com/watch?v=rfscVS0vtbw",
  });
  status("11a. teacher creates a YouTube offering draft", youtubeOffering, 201);
  const ytId = youtubeOffering.body?.data?.id as string | undefined;
  const lesson = ytId
    ? await req(teacher, "POST", `/api/v1/offerings/${ytId}/lessons`, {
        title: "درس اختبار يوتيوب",
        videoUrl: "https://www.youtube.com/watch?v=rfscVS0vtbw",
        access: "TRIAL",
        order: 1,
      })
    : null;
  check("11b. lesson video starts in PENDING_REVIEW", lesson?.body?.data?.reviewStatus === "PENDING_REVIEW", `HTTP ${lesson?.status}`);

  if (ytId) {
    // 12) الدورة الجديدة لا تظهر قبل الاعتماد
    status("12a. anonymous cannot read an unapproved offering", await req(null, "GET", `/api/v1/offerings/${ytId}`), 404);
    status("12b. teacher submits for review", await req(teacher, "POST", `/api/v1/offerings/${ytId}/submit`), 200);
    // 16) المدرس لا يستطيع تجاوز الاعتماد
    status("16. teacher cannot publish directly", await req(teacher, "PATCH", `/api/v1/offerings/${ytId}`, { status: "PUBLISHED" }), 400);
    // 13) الإدارة تعتمد فتصبح ظاهرة
    status("13a. admin approves and publishes", await req(admin, "PATCH", `/api/v1/admin/offerings/${ytId}`, { status: "PUBLISHED" }), 200);
    const publicView = await req(null, "GET", `/api/v1/offerings/${ytId}`);
    status("13b. approved offering is visible", publicView, 200);
    check("13c. approved trial video is visible", Boolean(publicView.body?.data?.trialVideoUrl), String(publicView.body?.data?.trialVideoUrl));
    // 17) إعادة القراءة لا تُخفي الدورة
    status("17. approved offering stays visible on reload", await req(null, "GET", `/api/v1/offerings/${ytId}`), 200);
    // تعديل جوهري من المدرس يعيدها للمراجعة
    const edit = await req(teacher, "PATCH", `/api/v1/offerings/${ytId}`, { summary: "تحديث جوهري للوصف بعد النشر." });
    check("sensitive edit of a published course returns it to review", edit.body?.data?.status === "PENDING_REVIEW", String(edit.body?.data?.status));

    // 14) دورة مرفوضة لا تظهر
    const rejected = await req(teacher, "POST", "/api/v1/offerings", {
      courseTitle: `مقرر اختبار الرفض ${Date.now()}`,
      summary: "دورة لاختبار حالة الرفض.",
      price: 90,
    });
    const rejId = rejected.body?.data?.id as string | undefined;
    if (rejId) {
      await req(teacher, "POST", `/api/v1/offerings/${rejId}/lessons`, {
        title: "درس",
        videoUrl: "https://www.youtube.com/watch?v=rfscVS0vtbw",
        access: "TRIAL",
        order: 1,
      });
      await req(teacher, "POST", `/api/v1/offerings/${rejId}/submit`);
      await req(admin, "PATCH", `/api/v1/admin/offerings/${rejId}`, { status: "REJECTED", adminNote: "سبب رفض اختباري" });
      status("14. rejected offering is not visible to students", await req(null, "GET", `/api/v1/offerings/${rejId}`), 404);
      // 15) الدورة التي تحتاج تعديلًا تظهر للمدرس بحالتها الصحيحة
      status("15a. admin requests changes", await req(admin, "PATCH", `/api/v1/admin/offerings/${rejId}`, { status: "NEEDS_REVISION", adminNote: "أضف وصفًا أوضح" }), 200);
      const mine = await req(teacher, "GET", "/api/v1/offerings/mine?limit=50");
      const row = (mine.body?.data as Array<{ id: string; status: string }> | undefined)?.find((x) => x.id === rejId);
      check("15b. teacher sees NEEDS_REVISION status", row?.status === "NEEDS_REVISION", String(row?.status));
    }
  }

  // 3-6) دورة عروض مركزية
  const reqCreate = await req(student, "POST", "/api/v1/requests", {
    courseTitle: `طلب اختبار العروض ${Date.now()}`,
    details: "أحتاج شرحًا لمنهج المقرر مع أمثلة محلولة.",
    type: "ONLINE",
    urgency: "WEEK",
    budget: 200,
  });
  status("offers setup: student creates a request", reqCreate, 201);
  const requestId = reqCreate.body?.data?.id as string | undefined;

  if (requestId) {
    status("offers setup: admin publishes the request", await req(admin, "POST", `/api/v1/requests/${requestId}/publish`), 200);

    // 5) عرض المدرس يصل للإدارة فقط
    const offer = await req(teacher, "POST", `/api/v1/requests/${requestId}/offers`, {
      price: 180,
      message: "لدي خبرة في تدريس هذا المقرر ولدي بنك أسئلة محلول.",
      timelineDays: 3,
    });
    status("5a. teacher submits an offer", offer, 201);
    const offerId = offer.body?.data?.id as string | undefined;

    // 3) الطالب لا يقرأ عرضًا لم تعتمده الإدارة
    const studentView = await req(student, "GET", `/api/v1/requests/${requestId}`);
    check("3. student does not see an unapproved offer", !studentView.body?.data?.publishedOffer, JSON.stringify(studentView.body?.data?.publishedOffer));
    status("3b. student cannot list raw offers", await req(student, "GET", `/api/v1/requests/${requestId}/offers`), 403);

    // 4) مدرس آخر لا يرى عرض منافسه
    if (offerId) {
      status("4. another teacher cannot read a competitor offer", await req(teacher2, "GET", `/api/v1/offers/${offerId}`), 403);
    }

    // 6) عرض معتمد فقط يصل للطالب
    const approve = await req(admin, "POST", `/api/v1/offers/${offerId}/approve`, { approvedPrice: 175, adminNote: "سعر نهائي معتمد" });
    status("6a. admin approves exactly one offer", approve, 200);
    const studentView2 = await req(student, "GET", `/api/v1/requests/${requestId}`);
    check("6b. student receives only the approved offer", Boolean(studentView2.body?.data?.publishedOffer), JSON.stringify(studentView2.body?.data?.publishedOffer));
    check("6c. approved price is the admin price", studentView2.body?.data?.publishedOffer?.price === 175, String(studentView2.body?.data?.publishedOffer?.price));

    // الطالب يؤكد العرض المعتمد => طلب دفع
    const confirm = await req(student, "POST", `/api/v1/offers/${offerId}/confirm`);
    check("6d. student confirms the approved offer -> payment order", confirm.status === 200 && Boolean(confirm.body?.data?.order?.id), `HTTP ${confirm.status}`);
  }

  // 20) الطلبات/الدفع ما زالت تعمل
  status("20. existing orders endpoint still works", await req(student, "GET", "/api/v1/orders"), 200);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${results.length - failed}/${results.length} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
