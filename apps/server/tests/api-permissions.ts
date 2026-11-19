// اختبارات صلاحيات المصادقة والنشر وعزل الدروس — تنفّذ عبر HTTP ضد الخادم العامل.
// التشغيل: npx tsx tests/api-permissions.ts
import { PrismaClient } from "@prisma/client";
import { collect, login, req } from "./api-helpers";

const prisma = new PrismaClient();
const { results, check, status } = collect();

async function main() {
  const admin = await login("demo_manager");
  const sara = await login("demo_sara");
  const abdullah = await login("demo_abdullah");
  const noura = await login("demo_noura");
  const lama = await login("demo_lama");
  const reem = await login("demo_reem");

  check("دخول الأدوار يعمل (إدارة/مدرس/طالب)", !!(admin.id && sara.id && lama.id));

  // ---------- 1) صلاحيات المسارات المحمية ----------
  status("زائر: /offerings/mine مرفوض", await req(null, "GET", "/api/v1/offerings/mine"), 401);
  status("زائر: /orders مرفوض", await req(null, "GET", "/api/v1/orders"), 401);
  status("طالب: قائمة المستخدمين الإدارية مرفوضة", await req(lama, "GET", "/api/v1/admin/users"), 403);
  status("مدرس: مراجعة المدفوعات مرفوضة", await req(sara, "GET", "/api/v1/payments"), 403);
  status("طالب: شيء من مسارات المدرس مرفوض", await req(lama, "GET", "/api/v1/teacher/profile"), 403);
  status("إدارة: قائمة المستخدمين مسموحة", await req(admin, "GET", "/api/v1/admin/users"), 200);
  status("مدرس: ملفه المهني مسموح", await req(sara, "GET", "/api/v1/teacher/profile"), 200);

  // ---------- 2) نشر الدورات: مسودة ثم مراجعة إدارية ----------
  const saraProfile = await prisma.teacherProfile.findUnique({ where: { userId: sara.id! } });
  const nouraDraft = await prisma.courseOffering.findFirst({
    where: { teacherId: (await prisma.teacherProfile.findUnique({ where: { userId: noura.id! } }))!.id, status: "DRAFT" },
  });
  const course = await prisma.courseOffering.findFirst({ where: { teacherId: saraProfile!.id, status: "PUBLISHED" } });
  if (!course || !nouraDraft) throw new Error("بيانات الـSeed التجريبية غير مكتملة");

  status(
    "مدرس غير معتمد: إنشاء دورة مرفوض",
    await req(noura, "POST", "/api/v1/offerings", { courseId: course.courseId, summary: "محاولة إنشاء دورة من حساب مدرّس بانتظار اعتماد الإدارة.", price: 50 }),
    403,
  );
  status("مدرس غير معتمد: تقديم دورته مرفوض", await req(noura, "POST", `/api/v1/offerings/${nouraDraft.id}/submit`), 403);

  let testOfferingId = "";
  const created = await req(sara, "POST", "/api/v1/offerings", {
    courseId: course.courseId,
    title: "دورة اختبار الصلاحيات — تُحذف تلقائيًا",
    summary: "دورة تُنشأ داخل اختبار التكامل للتحقق من دورة النشر والمراجعة الإدارية فقط، ثم تُحذف تلقائيًا بعد الانتهاء.",
    price: 49,
  });
  if (status("مدرس معتمد: إنشاء دورة كمسودة", created, 201)) {
    testOfferingId = created.body.data.id;
    check("الحالة الابتدائية مسودة", created.body.data.status === "DRAFT", created.body.data.status);
  }

  status(
    "مدرس: محاولة النشر المباشر عبر PATCH مرفوضة",
    await req(sara, "PATCH", `/api/v1/offerings/${testOfferingId}`, { status: "PUBLISHED" }),
    400,
  );
  status(
    "مدرس آخر: تعديل دورة غيره مرفوض",
    await req(abdullah, "PATCH", `/api/v1/offerings/${testOfferingId}`, { summary: "محاولة تعديل دورة مدرّس آخر بوصف يتجاوز عشرين حرفًا." }),
    403,
  );
  status("مدرس آخر: قراءة مسجلي دورة غيره مرفوضة", await req(abdullah, "GET", `/api/v1/offerings/${testOfferingId}/attendees`), 403);
  status(
    "مدرس آخر: إضافة درس إلى دورة غيره مرفوضة",
    await req(abdullah, "POST", `/api/v1/offerings/${testOfferingId}/lessons`, { title: "درس دخيل", videoUrl: "https://www.youtube.com/watch?v=abc12345678", access: "TRIAL", order: 0 }),
    403,
  );
  status("تقديم دورة بلا دروس مرفوض", await req(sara, "POST", `/api/v1/offerings/${testOfferingId}/submit`), 400);

  const trialLesson = await req(sara, "POST", `/api/v1/offerings/${testOfferingId}/lessons`, {
    title: "درس تجريبي للاختبار", videoUrl: "https://www.youtube.com/watch?v=abc12345678", access: "TRIAL", order: 0,
  });
  const paidLesson = await req(sara, "POST", `/api/v1/offerings/${testOfferingId}/lessons`, {
    title: "درس مدفوع للاختبار", videoUrl: "https://www.youtube.com/watch?v=def12345678", access: "PAID", order: 1,
  });
  status("إضافة درس تجريبي", trialLesson, 201);
  status("إضافة درس مدفوع", paidLesson, 201);
  status("مدرس آخر: تعديل درس في دورة غيره مرفوض", await req(abdullah, "PATCH", `/api/v1/offerings/lessons/${paidLesson.body?.data?.id}`, { title: "تعديل دخيل" }), 403);

  const submitted = await req(sara, "POST", `/api/v1/offerings/${testOfferingId}/submit`);
  if (status("تقديم الدورة للمراجعة", submitted, 200)) {
    check("التقديم لا ينشر الدورة", submitted.body.data.status === "PENDING_REVIEW", submitted.body.data.status);
  }
  status("دورة قيد المراجعة غير ظاهرة للزائر", await req(null, "GET", `/api/v1/offerings/${testOfferingId}`), 404);
  status("دورة قيد المراجعة غير ظاهرة للطالب", await req(lama, "GET", `/api/v1/offerings/${testOfferingId}`), 404);
  status("الإدارة لا تعتمد دورة غير مقدَّمة", await req(admin, "PATCH", `/api/v1/admin/offerings/${course.id}`, { status: "PUBLISHED" }), 400);

  const approved = await req(admin, "PATCH", `/api/v1/admin/offerings/${testOfferingId}`, { status: "PUBLISHED" });
  if (status("الإدارة تعتمد الدورة وتنشرها", approved, 200)) {
    check("الحالة أصبحت منشورة", approved.body.data.status === "PUBLISHED", approved.body.data.status);
  }

  // ---------- 3) عزل الدروس المدفوعة ----------
  const guestDetail = await req(null, "GET", `/api/v1/offerings/${testOfferingId}`);
  if (status("الزائر يرى الدورة المنشورة", guestDetail, 200)) {
    const lessons = guestDetail.body.data.lessons ?? [];
    check("الزائر يرى الدروس التجريبية فقط", lessons.length === 1 && lessons[0].access === "TRIAL", `${lessons.length} درس`);
    check("الزائر لا يرى علم الوصول الكامل", guestDetail.body.data.canSeeAllLessons === false);
  }

  const lambaDetail = await req(lama, "GET", `/api/v1/offerings/${testOfferingId}`);
  if (status("طالب غير مشترك يرى صفحة الدورة", lambaDetail, 200)) {
    check("الطالب غير المشترك لا يرى الدرس المدفوع", (lambaDetail.body.data.lessons ?? []).every((l: any) => l.access === "TRIAL"));
  }

  const lamaEnrolled = await req(lama, "GET", `/api/v1/offerings/${course.id}`);
  if (status("طالب مشترك يرى دورته", lamaEnrolled, 200)) {
    check("المشترك يرى الدروس المدفوعة في دورته", lamaEnrolled.body.data.canSeeAllLessons === true && (lamaEnrolled.body.data.lessons ?? []).some((l: any) => l.access === "PAID"));
  }
  const reemOther = await req(reem, "GET", `/api/v1/offerings/${course.id}`);
  if (status("طالب غير مشترك يرى صفحة دورة أخرى", reemOther, 200)) {
    check("الاشتراك لا يتسرّب بين الدورات", reemOther.body.data.canSeeAllLessons === false);
  }

  // عرض دورات المدرس: كل مدرس يرى دوراته فقط
  const saraMine = await req(sara, "GET", "/api/v1/offerings/mine?limit=50");
  if (status("مدرس: قائمة دوراته", saraMine, 200)) {
    const saraIds = (saraMine.body.data ?? []).map((o: any) => o.teacherId);
    check("قائمة المدرس لا تحوي دورات غيره", saraIds.every((t: string) => t === saraProfile!.id));
  }

  // ---------- تنظيف ----------
  if (testOfferingId) {
    await prisma.lesson.deleteMany({ where: { offeringId: testOfferingId } });
    await prisma.courseOffering.delete({ where: { id: testOfferingId } });
  }
  if (course?.status === "PENDING_REVIEW") {
    await prisma.courseOffering.update({ where: { id: course.id }, data: { status: "PUBLISHED" } });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n== النتيجة: ${results.length - failed.length}/${results.length} ناجح، ${failed.length} فاشل ==`);
  if (failed.length) {
    for (const f of failed) console.log("FAILED:", f.name, f.detail);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("انهيار الاختبار:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
