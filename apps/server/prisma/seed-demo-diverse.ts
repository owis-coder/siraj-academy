/**
 * بيانات تجريبية متنوعة وآمنة — إضافية وفقط (Additive & Idempotent).
 *
 * - لا يحذف ولا يعدّل أي بيانات مستخدمين حقيقية.
 * - كل سجل تجريبي يحمل كودًا يبدأ بـ DEMO-DIV- أو بريدًا ينتهي بـ @siraj.demo.
 * - يمكن تشغيله أكثر من مرة دون تكرار: البحث دائمًا بالمفتاح التجريبي.
 *
 * التشغيل (على بيئة تطوير/اختبار فقط، بعد تطبيق الـmigrations):
 *   npm --prefix apps/server run seed:demo:diverse
 */
import dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const DEMO_PASSWORD = "Demo@2026!";
const YT = [
  "https://www.youtube.com/watch?v=rfscVS0vtbw",
  "https://www.youtube.com/watch?v=HXV3zeQKqGY",
  "https://www.youtube.com/watch?v=aircAruvnKk",
  "https://www.youtube.com/watch?v=WUvTyaaNkzM",
  "https://www.youtube.com/watch?v=8jLOx1hD3_o",
];

const TEACHERS = [
  { username: "div_teacher_sara", fullName: "سارة العتيبي", degree: "دكتوراه في علوم الحاسب — جامعة الملك سعود", specialties: ["بايثون", "تطوير الويب", "تحليل البيانات"] },
  { username: "div_teacher_abdullah", fullName: "عبدالله الحربي", degree: "ماجستير هندسة البرمجيات — جامعة الملك فهد", specialties: ["الشبكات", "أمن المعلومات", "أنظمة التشغيل"] },
  { username: "div_teacher_noura", fullName: "نورة القحطاني", degree: "ماجستير اللغة الإنجليزية — جامعة الملك فيصل", specialties: ["الإنجليزية الأكاديمية", "مهارات البحث"] },
  { username: "div_teacher_faisal", fullName: "فيصل الشمري", degree: "دكتوراه رياضيات تطبيقية — جامعة الملك عبدالعزيز", specialties: ["الرياضيات الهندسية", "الفيزياء"] },
  { username: "div_teacher_hessa", fullName: "حصة الدوسري", degree: "ماجستير إدارة أعمال — جامعة الملك سعود", specialties: ["المحاسبة", "إدارة المشاريع"] },
  { username: "div_teacher_majed", fullName: "ماجد الأنصاري", degree: "بكالوريوس تصميم تفاعلي — جامعة طيبة", specialties: ["تصميم واجهات المستخدم", "تجربة المستخدم"] },
];

const COURSES: Array<{
  code: string;
  title: string;
  level: string;
  description: string;
}> = [
  { code: "DEMO-DIV-PY101", title: "أساسيات البرمجة بلغة Python", level: "المستوى الأول", description: "من المتغيرات والحلقات إلى الدوال والمشاريع الصغيرة، بأسلوب تدريبي عملي." },
  { code: "DEMO-DIV-WEB210", title: "تطوير تطبيقات الويب الحديثة", level: "المستوى الرابع", description: "بناء واجهات تفاعلية وواجهات API آمنة مع مشروع تطبيقي متكامل." },
  { code: "DEMO-DIV-SQL220", title: "قواعد البيانات وSQL", level: "المستوى الثالث", description: "تصميم الجداول، التطبيع، والاستعلامات المتقدمة مع تمارين مصححة." },
  { code: "DEMO-DIV-NET230", title: "شبكات الحاسوب وبروتوكولاتها", level: "المستوى الخامس", description: "طبقات الشبكة، العنونة، والتوجيه مع مختبرات محاكاة." },
  { code: "DEMO-DIV-SEC240", title: "أمن المعلومات والتشفير التطبيقي", level: "المستوى السادس", description: "التشفير، إدارة الهوية، وتحليل الثغرات الشائعة في التطبيقات." },
  { code: "DEMO-DIV-AI250", title: "أساسيات الذكاء الاصطناعي وتعلّم الآلة", level: "المستوى الخامس", description: "مقدمة عملية في البحث والاستدلال وتقييم النماذج." },
  { code: "DEMO-DIV-MATH260", title: "الرياضيات الهندسية والتحليل العددي", level: "المستوى الثالث", description: "المعادلات التفاضلية والتحليل العددي بتطبيقات هندسية." },
  { code: "DEMO-DIV-PHY270", title: "الفيزياء العامة للمهندسين", level: "المستوى الثاني", description: "الميكانيكا والكهرباء والمغناطيسية بأمثلة صناعية." },
  { code: "DEMO-DIV-ACC280", title: "أساسيات المحاسبة المالية", level: "المستوى الأول", description: "القيود والتسويات والقوائم المالية مع دراسة حالات." },
  { code: "DEMO-DIV-PM290", title: "إدارة المشاريع والجدولة", level: "المستوى السادس", description: "النطاق والجدولة والمخاطر وإدارة أصحاب المصلحة." },
  { code: "DEMO-DIV-ENG300", title: "اللغة الإنجليزية الأكاديمية", level: "المستوى الثاني", description: "الكتابة الأكاديمية والاقتباس وأسلوب البحث العلمي." },
  { code: "DEMO-DIV-RS310", title: "مهارات البحث العلمي", level: "المستوى الرابع", description: "صياغة السؤال البحثي ومراجعة الأدبيات وتقييم المصادر." },
  { code: "DEMO-DIV-DA320", title: "تحليل البيانات باستخدام Python", level: "المستوى الخامس", description: "تنظيف البيانات وتحليلها بصريًا باستخدام Pandas وMatplotlib." },
  { code: "DEMO-DIV-UX330", title: "تصميم واجهات المستخدم وتجربتها", level: "المستوى الثالث", description: "مبادئ UX Research والتصميم الأولي والنماذج التفاعلية." },
  { code: "DEMO-DIV-OS340", title: "أساسيات أنظمة التشغيل", level: "المستوى الرابع", description: "العمليات وإدارة الذاكرة والتخزين وأنظمة الملفات." },
];

const PRICES = [79, 99, 129, 149, 179, 199, 249, 299];
const STATUSES: Array<"PUBLISHED" | "PENDING_REVIEW" | "DRAFT" | "NEEDS_REVISION" | "REJECTED"> = [
  "PUBLISHED",
  "PUBLISHED",
  "PUBLISHED",
  "PUBLISHED",
  "PUBLISHED",
  "PUBLISHED",
  "PUBLISHED",
  "PUBLISHED",
  "PENDING_REVIEW",
  "PENDING_REVIEW",
  "PENDING_REVIEW",
  "DRAFT",
  "DRAFT",
  "NEEDS_REVISION",
  "REJECTED",
];

async function ensureTeacher(index: number) {
  const spec = TEACHERS[index % TEACHERS.length];
  const email = `${spec.username}@siraj.demo`;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        fullName: spec.fullName,
        username: spec.username,
        email,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: "TEACHER",
        status: "ACTIVE",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
  }
  let profile = await prisma.teacherProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.teacherProfile.create({
      data: {
        userId: user.id,
        degree: spec.degree,
        bio: `مدرّب تجريبي في ${spec.specialties.join("، ")}.`,
        specialties: spec.specialties,
        status: "APPROVED",
      },
    });
  }
  return { user, profile };
}

async function main() {
  const university =
    (await prisma.university.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await prisma.university.create({
      data: { name: "جامعة سراج التجريبية", slug: "siraj-demo-university", city: "الرياض" },
    }));

  const teachers = [];
  for (let i = 0; i < TEACHERS.length; i++) teachers.push(await ensureTeacher(i));

  let createdCourses = 0;
  let createdOfferings = 0;
  let createdLessons = 0;

  for (let i = 0; i < COURSES.length; i++) {
    const def = COURSES[i];
    let course = await prisma.course.findFirst({ where: { code: def.code } });
    if (!course) {
      course = await prisma.course.create({
        data: {
          universityId: university.id,
          title: def.title,
          code: def.code,
          level: def.level,
          description: def.description,
          isVisible: true,
        },
      });
      createdCourses++;
    }

    const teacher = teachers[i % teachers.length];
    const status = STATUSES[i % STATUSES.length];
    const price = PRICES[i % PRICES.length];
    const title = `${def.title} — مسار تطبيقي`;
    const lessonCount = 3 + (i % 4);

    let offering = await prisma.courseOffering.findFirst({
      where: { courseId: course.id, teacherId: teacher.profile.id, title },
    });

    if (!offering) {
      const youtubeUrls = [YT[i % YT.length]];
      offering = await prisma.courseOffering.create({
        data: {
          courseId: course.id,
          teacherId: teacher.profile.id,
          title,
          summary: `${def.description} تشمل ${lessonCount} دروس مع تمارين ومراجعة نهائية.`,
          price,
          accessType: price === 0 ? "TRIAL" : "PAID",
          status,
          trialVideoUrl: YT[i % YT.length],
          trialVideoStatus: status === "PUBLISHED" ? "APPROVED" : "PENDING_REVIEW",
          youtubeUrls,
          approvedYoutubeUrls: status === "PUBLISHED" ? youtubeUrls : undefined,
          adminNote:
            status === "NEEDS_REVISION"
              ? "أضف وصفًا أوضح للدرس التمهيدي ثم أعد التقديم."
              : status === "REJECTED"
                ? "مصادر خارجية غير مصرح بها في هذا السيناريو التجريبي."
                : undefined,
        },
      });
      createdOfferings++;

      for (let l = 1; l <= lessonCount; l++) {
        await prisma.lesson.create({
          data: {
            offeringId: offering.id,
            title:
              l === 1
                ? `تمهيد: ${def.title}`
                : l === lessonCount
                  ? "مراجعة نهائية وبنك أسئلة"
                  : `الوحدة ${l - 1}: تطبيق عملي`,
            videoUrl: YT[(i + l) % YT.length],
            access: l === 1 ? "TRIAL" : "PAID",
            order: l,
            reviewStatus: status === "PUBLISHED" ? "APPROVED" : "PENDING_REVIEW",
          },
        });
        createdLessons++;
      }
    }
  }

  console.log("=== بيانات تجريبية متنوعة (إضافية) ===");
  console.log(`مقررات جديدة: ${createdCourses}`);
  console.log(`دورات جديدة: ${createdOfferings}`);
  console.log(`دروس جديدة: ${createdLessons}`);
  console.log("لم يُحذف أو يُعدّل أي سجل موجود.");
}

main()
  .catch((e) => {
    console.error("فشل إضافة البيانات التجريبية:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
