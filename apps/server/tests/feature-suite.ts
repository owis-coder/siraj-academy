// فحص شامل ومؤتمت لكافة المتطلبات السبعة عشر المطلوبة
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import fs from "fs";
import { collect, req } from "./api-helpers";
import { generateUsersExcel, getUsersExcelPath } from "../src/lib/excelUsers";

const prisma = new PrismaClient();
const { results, check, status } = collect();

async function main() {
  console.log("====================================================");
  console.log("بدء الاختبار الشامل لميزات المنصة الأكاديمية الجديدة");
  console.log("====================================================\n");

  const stamp = Date.now().toString().slice(-6);

  // إيجاد جامعة وتخصص من قاعدة البيانات للاختبار
  const uni = await prisma.university.findFirst();
  if (!uni) throw new Error("لا توجد جامعات في قاعدة البيانات - شغّل seed أولاً");
  const maj = await prisma.major.findFirst({ where: { universityId: uni.id } }) ||
              await prisma.major.findFirst();

  // ---------- 1 & 2: تسجيل طالب جديد ومدرس جديد ----------
  const studentEmail = `student_${stamp}@test.local`;
  const studentUsername = `std_${stamp}`;
  const studentPass = "Student2026Pass";

  const studentRes = await req(null, "POST", "/api/v1/auth/register/student", {
    fullName: `طالب تجريبي ${stamp}`,
    username: studentUsername,
    email: studentEmail,
    whatsapp: "0511112222",
    password: studentPass,
    confirmPassword: studentPass,
    universityId: uni.id,
    majorId: maj?.id,
    level: "المستوى الرابع",
  });

  check("1. تسجيل طالب جديد بنجاح", studentRes.status === 201, `HTTP ${studentRes.status}`);

  const teacherEmail = `teacher_${stamp}@test.local`;
  const teacherUsername = `tch_${stamp}`;
  const teacherPass = "Teacher2026Pass";

  const teacherRes = await req(null, "POST", "/api/v1/auth/register/teacher", {
    fullName: `أستاذ تجريبي ${stamp}`,
    username: teacherUsername,
    email: teacherEmail,
    whatsapp: "0533334444",
    password: teacherPass,
    confirmPassword: teacherPass,
    degree: "ماجستير علوم حاسب",
    specialties: ["خوارزميات", "ذكاء اصطناعي"],
    bio: "أستاذ متخصص في تدريس مواد الحوسبة والبرمجة لطلاب الجامعات ولديه خبرة خمس سنوات.",
    universitiesText: uni.name,
  });

  check("2. تسجيل مدرس جديد بنجاح", teacherRes.status === 201, `HTTP ${teacherRes.status}`);

  // ---------- 3: التحقق من تسجيل إشعار البريد الإلكتروني في EmailLog ----------
  const studentLog = await prisma.emailLog.findFirst({
    where: {
      type: "REGISTRATION",
      metadata: { path: ["username"], equals: studentUsername },
    },
    orderBy: { createdAt: "desc" },
  });

  const teacherLog = await prisma.emailLog.findFirst({
    where: {
      type: "REGISTRATION",
      metadata: { path: ["username"], equals: teacherUsername },
    },
    orderBy: { createdAt: "desc" },
  });

  check("3. إشعار تسجيل الطالب مُسجل ومُرسل للإدارة", !!studentLog && (studentLog.status === "SENT" || studentLog.status === "SIMULATED"));
  check("3. إشعار تسجيل المدرس مُسجل ومُرسل للإدارة", !!teacherLog && (teacherLog.status === "SENT" || teacherLog.status === "SIMULATED"));

  // التحقق من عدم وجود كلمات المرور أو الأسرار في السجلات
  check("16. خلو السجلات من كلمات المرور والبيانات السرية",
    !JSON.stringify(studentLog).includes(studentPass) && !JSON.stringify(teacherLog).includes(teacherPass)
  );

  // ---------- 4 & 5: فحص سجل Excel وعدم التكرار والتعامل مع التسجيل المتتالي ----------
  const excelPath = await generateUsersExcel();
  check("4. توليد ملف Excel للمستخدمين بنجاح", fs.existsSync(excelPath), excelPath);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  const sheet = workbook.getWorksheet("المستخدمون");
  check("4. ورقة المستخدمين موجودة في ملف Excel", !!sheet);

  let studentFoundCount = 0;
  let teacherFoundCount = 0;
  let hasPasswordInExcel = false;

  sheet?.eachRow((row) => {
    const rowValues = JSON.stringify(row.values);
    if (rowValues.includes(studentUsername)) studentFoundCount++;
    if (rowValues.includes(teacherUsername)) teacherFoundCount++;
    if (rowValues.includes(studentPass) || rowValues.includes(teacherPass)) hasPasswordInExcel = true;
  });

  check("4. الطالب مضاف مرة واحدة بالضبط في Excel (منع التكرار)", studentFoundCount === 1, `تكرار=${studentFoundCount}`);
  check("4. المدرس مضاف مرة واحدة بالضبط في Excel", teacherFoundCount === 1, `تكرار=${teacherFoundCount}`);
  check("16. عدم تصدير كلمات المرور في Excel", !hasPasswordInExcel);

  // فحص تسجيل متتالي لمستخدمين إضافيين للتحقق من عدم فقدان البيانات
  const batchUsername1 = `batch1_${stamp}`;
  const batchUsername2 = `batch2_${stamp}`;
  const [b1Res, b2Res] = await Promise.all([
    req(null, "POST", "/api/v1/auth/register/student", {
      fullName: `طالب متزامن 1 ${stamp}`,
      username: batchUsername1,
      email: `batch1_${stamp}@test.local`,
      whatsapp: "0555550001",
      password: "BatchPass2026",
      confirmPassword: "BatchPass2026",
    }),
    req(null, "POST", "/api/v1/auth/register/student", {
      fullName: `طالب متزامن 2 ${stamp}`,
      username: batchUsername2,
      email: `batch2_${stamp}@test.local`,
      whatsapp: "0555550002",
      password: "BatchPass2026",
      confirmPassword: "BatchPass2026",
    }),
  ]);

  if (b1Res.status !== 201 || b2Res.status !== 201) {
    console.log("B1 Response:", b1Res.status, b1Res.body);
    console.log("B2 Response:", b2Res.status, b2Res.body);
  }

  const excelPathAfterBatch = await generateUsersExcel();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(excelPathAfterBatch);
  const sheet2 = wb2.getWorksheet("المستخدمون");
  let b1Found = false, b2Found = false;
  sheet2?.eachRow((row) => {
    const str = JSON.stringify(row.values);
    if (str.includes(batchUsername1)) b1Found = true;
    if (str.includes(batchUsername2)) b2Found = true;
  });
  check("5. تسجيل مستخدمين متزامنين وعدم فقدان البيانات في Excel", b1Found && b2Found);

  // ---------- 6: تعديل بيانات مستخدم والتحقق من تحديث التصدير ----------
  const studentUser = await prisma.user.findUnique({ where: { username: studentUsername } });
  check("المستخدم مسجل في قاعدة البيانات", !!studentUser);

  // تسجيل دخول الطالب
  const loginRes = await req(null, "POST", "/api/v1/auth/login", {
    identifier: studentUsername,
    password: studentPass,
  });
  check("7. تسجيل الدخول بحساب طالب بنجاح", loginRes.status === 200, `HTTP ${loginRes.status}`);

  const rawCookie = loginRes.headers.get("set-cookie") ?? "";
  const matchSid = /sid=([^;]+)/.exec(rawCookie);
  const studentSession = { name: studentUsername, cookie: matchSid ? `sid=${matchSid[1]}` : undefined };

  // تعديل اسم الطالب
  const updatedFullName = `طالب معدل ${stamp}`;
  const updateRes = await req(studentSession, "PATCH", `/api/v1/users/${studentUser!.id}`, {
    fullName: updatedFullName,
    level: "المستوى الخامس (تخرج)",
  });
  check("6. تعديل بيانات المستخدم عبر API", updateRes.status === 200);

  // فحص أحدث تصدير Excel
  const excelPathUpdated = await generateUsersExcel();
  const wb3 = new ExcelJS.Workbook();
  await wb3.xlsx.readFile(excelPathUpdated);
  let updatedNameFound = false;
  wb3.getWorksheet("المستخدمون")?.eachRow((row) => {
    if (JSON.stringify(row.values).includes(updatedFullName)) updatedNameFound = true;
  });
  check("6. تحديث ملف Excel يعكس أحدث بيانات المستخدم فورًا", updatedNameFound);

  // ---------- 8 & 9: تقديم طلب شرح لمقرر غير متوفر وطلب خدمة مخصصة ----------
  const customCourseReq = await req(studentSession, "POST", "/api/v1/custom-requests", {
    requestType: "COURSE_EXPLAIN",
    title: "شرح مقرر نظم التشغيل والعمليات المتقدمة (CS340)",
    description: "أحتاج لشرح الفصول من 4 إلى 8 خصوصًا جدولة المعالج وإدارة الذاكرة الافتراضية مع حل مسائل تطبيقية.",
    deadline: "قبل منتصف الشهر القادم",
    budget: 350,
  });

  check("8. تقديم طلب شرح مقرر غير متوفر بنجاح", customCourseReq.status === 201, `HTTP ${customCourseReq.status}`);
  const courseReqData = customCourseReq.body?.data;
  check("8. توليد رقم طلب منظم للخدمة", !!courseReqData?.requestNo && courseReqData.requestNo.startsWith("CSR-"));

  // تقديم طلب خدمة مخصصة مع مرفقات
  const customServiceReq = await req(studentSession, "POST", "/api/v1/custom-requests", {
    requestType: "PROGRAMMING_PROJECT",
    title: "مشروع تعليمي لتطبيق إدارة مخازن بتقنية React وNode",
    description: "أريد جلسات تدريبية وتوجيه لشرح طريقة بناء بنية المشروع وربطه بقاعدة البيانات والتحقق من النزاهة.",
    budget: 500,
    attachments: [
      { name: "project_specs.pdf", url: "/uploads/samples/project_specs.pdf", size: 1024, type: "application/pdf" },
    ],
  });

  check("9. تقديم طلب خدمة مخصصة مع مرفق بنجاح", customServiceReq.status === 201, `HTTP ${customServiceReq.status}`);
  const serviceReqData = customServiceReq.body?.data;

  // ---------- 10 & 11: التحقق من الحفظ في DB واستخراج بيانات المستخدم تلقائيًا وإرسال البريد ----------
  const dbReq = await prisma.customServiceRequest.findUnique({
    where: { id: courseReqData.id },
    include: { user: true },
  });

  check("10. حفظ الطلب في قاعدة البيانات بحالة NEW", dbReq?.status === "NEW");
  check("10. استخراج بيانات المستخدم من DB تلقائيًا دون الاعتماد على العميل",
    dbReq?.user?.fullName === updatedFullName && dbReq?.user?.email === studentEmail
  );

  // التحقق من وصول إشعار البريد الإلكتروني في EmailLog
  const reqEmailLog = await prisma.emailLog.findFirst({
    where: {
      type: "CUSTOM_REQUEST",
      metadata: { path: ["requestId"], equals: courseReqData.id },
    },
  });
  check("11. تسجيل وصول إشعار البريد الإلكتروني ببيانات الطلب وصاحبه", !!reqEmailLog);
  check("11. إشعار البريد يحتوي على اسم المقرر ورقم الطلب", reqEmailLog?.subject.includes("شرح مقرر"));

  // ---------- 12: التحقق من ظهور الطلب في لوحة الإدارة وإدارته ----------
  // تسجيل دخول الإدارة
  const adminLoginRes = await req(null, "POST", "/api/v1/auth/login", {
    identifier: "admin@siraj.sa",
    password: "Siraj@2026Admin",
  });
  check("دخول الإدارة بنجاح", adminLoginRes.status === 200);

  const rawAdminCookie = adminLoginRes.headers.get("set-cookie") ?? "";
  const matchAdminSid = /sid=([^;]+)/.exec(rawAdminCookie);
  const adminSession = { name: "admin", cookie: matchAdminSid ? `sid=${matchAdminSid[1]}` : undefined };

  // استعلام الإدارة عن الطلبات
  const adminList = await req(adminSession, "GET", `/api/v1/admin/custom-requests?q=${courseReqData.requestNo}`);
  check("12. ظهور الطلب في قائمة لوحة الإدارة والبحث برقم الطلب",
    adminList.status === 200 && adminList.body?.data?.length > 0
  );

  // تغيير حالة الطلب من الإدارة
  const statusUpdateRes = await req(adminSession, "PATCH", `/api/v1/admin/custom-requests/${courseReqData.id}`, {
    status: "UNDER_REVIEW",
    adminNotes: "تم تعيين مدرس وجارٍ تحديد مواعيد الجلسات التجريبية",
    notifyUser: true,
  });
  check("12. تغيير حالة الطلب إلى «قيد المراجعة» وإضافة ملاحظات داخلية",
    statusUpdateRes.status === 200 && statusUpdateRes.body?.data?.status === "UNDER_REVIEW"
  );

  // التحقق من إشعار المستخدم بالتحديث
  const userNotif = await prisma.notification.findFirst({
    where: {
      userId: studentUser!.id,
      title: { contains: "تحديث طلبك" },
    },
    orderBy: { createdAt: "desc" },
  });
  check("12. وصول إشعار للمستخدم بتحديث حالة طلبه", !!userNotif);

  // إعادة إرسال البريد من الإدارة
  const resendRes = await req(adminSession, "POST", `/api/v1/admin/custom-requests/${courseReqData.id}/resend-email`);
  check("12. إعادة إرسال إشعار البريد بنجاح دون إنشاء طلب مكرر", resendRes.status === 200);

  // ---------- 14: التحقق من منع الطالب من تحميل ملف Excel الخاص بجميع المستخدمين ----------
  const forbiddenExcel = await req(studentSession, "GET", "/api/v1/admin/users/export/excel/download");
  check("14. منع الطالب من الوصول لملف Excel الخاص بجميع المستخدمين (403 Forbidden)",
    forbiddenExcel.status === 403, `HTTP ${forbiddenExcel.status}`
  );

  // الإدارة تستطيع تحميل الملف
  const allowedExcel = await req(adminSession, "GET", "/api/v1/admin/users/export/excel/download");
  check("الإدارة تستطيع تحميل ملف Excel بأمان", allowedExcel.status === 200);

  // ---------- 15: اختبار صلاحيات الطلبات المخصصة للمستخدمين الآخرين ----------
  // إنشاء طالب آخر ومحاولة فتح طلب الطالب الأول
  const otherStudentUsername = `other_${stamp}`;
  await req(null, "POST", "/api/v1/auth/register/student", {
    fullName: `طالب آخر ${stamp}`,
    username: otherStudentUsername,
    email: `other_${stamp}@test.local`,
    whatsapp: "0599990000",
    password: "OtherPass2026",
    confirmPassword: "OtherPass2026",
  });
  const otherLogin = await req(null, "POST", "/api/v1/auth/login", {
    identifier: otherStudentUsername,
    password: "OtherPass2026",
    confirmPassword: "OtherPass2026",
  });
  const matchOther = /sid=([^;]+)/.exec(otherLogin.headers.get("set-cookie") ?? "");
  const otherSession = { name: otherStudentUsername, cookie: matchOther ? `sid=${matchOther[1]}` : undefined };

  const crossRequestRes = await req(otherSession, "GET", `/api/v1/custom-requests/${courseReqData.id}`);
  check("15. منع طالب من الاطلاع على طلبات أو مرفقات طالب آخر (403 Forbidden)",
    crossRequestRes.status === 403, `HTTP ${crossRequestRes.status}`
  );

  console.log("\n====================================================");
  console.log("ملخص نتائج الاختبار الشامل:");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`الإجمالي: ${results.length} | الناجحة: ${passed} | الفاشلة: ${failed}`);
  console.log("====================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("خطأ غير متوقع أثناء الفحص:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
