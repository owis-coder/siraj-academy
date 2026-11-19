// اختبارات حماية الملفات والتحقق من نوعها ومسار الدفع اليدوي — عبر HTTP.
// التشغيل: npx tsx tests/api-files-payments.ts
import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { PDF_BYTES, PNG_BYTES, collect, login, req, uploadFile } from "./api-helpers";

const prisma = new PrismaClient();
const { results, check, status } = collect();

main()
  .catch((e) => {
    console.error("انهيار الاختبار:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n== النتيجة: ${results.length - failed.length}/${results.length} ناجح، ${failed.length} فاشل ==`);
    if (failed.length) {
      for (const f of failed) console.log("FAILED:", f.name, f.detail);
      process.exitCode = 1;
    }
  });

async function main() {
  const admin = await login("demo_manager");
  const sara = await login("demo_sara");
  const noura = await login("demo_noura");
  const lama = await login("demo_lama");
  const reem = await login("demo_reem");
  const jawaher = await login("demo_jawaher");
  const bandar = await login("demo_bandar");

  const saraProfile = (await prisma.teacherProfile.findUnique({ where: { userId: sara.id! } }))!;
  const o1 = (await prisma.courseOffering.findFirst({ where: { teacherId: saraProfile.id, title: { contains: "قواعد البيانات من الصفر" } } }))!;
  const o2 = (await prisma.courseOffering.findFirst({ where: { teacherId: saraProfile.id, title: { contains: "هندسة البرمجيات" } } }))!;

  // تنظيف بقايا تشغيل سابق ليكون الاختبار قابلًا للتكرار
  const staleOrders = await prisma.order.findMany({
    where: { studentId: { in: [jawaher.id!, bandar.id!] }, targetId: { in: [o1.id, o2.id] } },
    select: { id: true },
  });
  const staleIds = staleOrders.map((o) => o.id);
  await prisma.payment.deleteMany({ where: { orderId: { in: staleIds } } });
  await prisma.order.deleteMany({ where: { id: { in: staleIds } } });
  await prisma.enrollment.deleteMany({ where: { userId: { in: [jawaher.id!, bandar.id!] }, offeringId: { in: [o1.id, o2.id] } } });

  const uploaded: string[] = [];
  uploaded.push(...(await fileAccessTests(lama, reem, admin)));
  uploaded.push(...(await teacherDocsTests(noura, sara, lama, admin)));
  uploaded.push(...(await paymentTests(jawaher, bandar, sara, lama, admin, reem, o1.id, o2.id)));

  // حذف الملفات التي رُفعت في الاختبار
  const root = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(__dirname, "..", "uploads");
  for (const url of uploaded) {
    try {
      fs.unlinkSync(path.join(root, path.basename(url)));
    } catch {
      // تجاهل: الملف قد يكون محذوفًا
    }
  }
}

async function fileAccessTests(lama: { name: string; cookie?: string; id?: string }, reem: any, admin: any): Promise<string[]> {
  // ---------- الحالة المسموحة: صورة يرفعها الطالب ----------
  const okUpload = await uploadFile(lama, PNG_BYTES, "image/png", "avatar.png");
  let ownerUrl = "";
  if (status("طالب: رفع صورة PNG حقيقية", okUpload, 201)) {
    ownerUrl = okUpload.body.data.url;
    check("الرابط لا يفضح مسار التخزين", ownerUrl.startsWith("/uploads/") && !ownerUrl.includes(".."), ownerUrl);
  }

  const ownerGet = await req(lama, "GET", ownerUrl);
  status("الرافع يستطيع تنزيل ملفه", ownerGet, 200);
  check("نوع الاستجابة صورة", ownerGet.headers.get("content-type") === "image/png", ownerGet.headers.get("content-type") ?? "");
  check("الملف غير قابل للتخزين العام", (ownerGet.headers.get("cache-control") ?? "").includes("no-store"), ownerGet.headers.get("cache-control") ?? "");

  status("طالب آخر لا يستطيع تنزيل ملف غيره", await req(reem, "GET", ownerUrl), 403);
  status("الزائر لا يستطيع تنزيل ملف خاص", await req(null, "GET", ownerUrl), 403);
  status("الإدارة تستطيع الوصول للملف", await req(admin, "GET", ownerUrl), 200);

  // ---------- التحقق الحقيقي من المحتوى ----------
  status("ملف نصي متنكّر بصورة PNG مرفوض", await uploadFile(lama, Buffer.from("this is not a png at all", "utf8"), "image/png", "fake.png"), 400);
  status("ملف نصي متنكّر بـPDF مرفوض", await uploadFile(lama, Buffer.from("<?php echo 1; ?>", "utf8"), "application/pdf", "fake.pdf"), 400);
  status("نوع غير مسموح (تنفيذي) مرفوض", await uploadFile(lama, Buffer.from("MZ"), "application/x-msdownload", "evil.exe"), 400);
  status("زائر لا يستطيع الرفع", await uploadFile({ name: "guest" }, PNG_BYTES, "image/png", "a.png"), 401);

  // ---------- منع اجتياز المسارات ----------
  const traversal = await req(null, "GET", "/uploads/%2e%2e%2f%2e%2e%2fpackage.json");
  status("منع Path Traversal", traversal, [400, 403, 404]);
  status("منع الملفات المخفية", await req(null, "GET", "/uploads/.env"), [400, 403, 404]);
  status("منع امتداد غير مسموح", await req(admin, "GET", "/uploads/secret.txt"), [403, 404]);

  return ownerUrl ? [ownerUrl] : [];
}

async function teacherDocsTests(noura: any, sara: any, lama: any, admin: any): Promise<string[]> {
  const doc = await uploadFile(noura, PDF_BYTES, "application/pdf", "verification.pdf");
  if (!status("مدرس غير معتمد: رفع وثيقة تحقق PDF", doc, 201)) return [];
  const url = doc.body.data.url;

  status(
    "حفظ وثيقة التحقق الداخلية في ملف المدرس",
    await req(noura, "PATCH", "/api/v1/teacher/verification-docs", { docsUrl: url }),
    200,
  );
  const own = await req(noura, "GET", url);
  status("صاحب الوثيقة يقرأ وثيقته", own, 200);
  check("وثيقة التحقق لا تُخزَّن كملف عام", (own.headers.get("cache-control") ?? "").includes("no-store"), own.headers.get("cache-control") ?? "");
  status("مدرس آخر لا يقرأ وثيقة غيره", await req(sara, "GET", url), 403);
  status("طالب لا يقرأ وثائق المدرسين", await req(lama, "GET", url), 403);
  status("الزائر لا يقرأ وثائق المدرسين", await req(null, "GET", url), 403);
  status("الإدارة تقرأ وثائق التحقق", await req(admin, "GET", url), 200);
  status(
    "مدرس لا يربط ملف رفعه غيره كوثيقة",
    await req(sara, "PATCH", "/api/v1/teacher/verification-docs", { docsUrl: url }),
    403,
  );
  status(
    "قبول رابط خارجي موثوق (https) للوثائق",
    await req(noura, "PATCH", "/api/v1/teacher/verification-docs", { docsUrl: "https://example.com/verification.pdf" }),
    200,
  );
  return [url];
}

async function paymentTests(
  jawaher: any,
  bandar: any,
  sara: any,
  lama: any,
  admin: any,
  reem: any,
  o1: string,
  o2: string,
): Promise<string[]> {
  const files: string[] = [];
  const createdOrders: string[] = [];

  // ---------- 1) اشتراك + رفع سند + اعتماد الإدارة ----------
  const enroll = await req(jawaher, "POST", `/api/v1/offerings/${o1}/enroll`);
  let orderId = "";
  if (status("طالب: التسجيل في دورة منشورة", enroll, [200, 201])) {
    orderId = enroll.body.data.order.id;
    createdOrders.push(orderId);
    check("الطلب يبدأ بانتظار الدفع", enroll.body.data.order.status === "AWAITING_PAYMENT", enroll.body.data.order.status);
  }

  status("سند نصي متنكّر بصورة مرفوض", await uploadFile(jawaher, Buffer.from("not an image"), "image/png", "r.png", `/api/v1/orders/${orderId}/receipt`, "receipt"), 400);

  const receipt = await uploadFile(jawaher, PNG_BYTES, "image/png", "receipt.png", `/api/v1/orders/${orderId}/receipt`, "receipt");
  let receiptUrl = "";
  if (status("رفع سند حوالة صورة", receipt, 201)) {
    receiptUrl = receipt.body.data.payment.receiptUrl;
    files.push(receiptUrl);
    check("الدفع لا يُعد مكتملًا تلقائيًا", receipt.body.data.payment.status === "UNDER_REVIEW", receipt.body.data.payment.status);
  }

  const afterReceipt = await req(jawaher, "GET", `/api/v1/orders/${orderId}`);
  const orderAfter = afterReceipt.body?.data?.order;
  check("الطلب بانتظار المراجعة وليس مدفوعًا", orderAfter?.status === "AWAITING_REVIEW", orderAfter?.status ?? "?");
  const paymentId = orderAfter?.payments?.[0]?.id ?? "";

  status("صاحب الطلب يقرأ سنده", await req(jawaher, "GET", receiptUrl), 200);
  status("المدرس المستفيد يقرأ سند طلبه", await req(sara, "GET", receiptUrl), 200);
  status("طالب آخر لا يقرأ سند غيره", await req(reem, "GET", receiptUrl), 403);
  status("الزائر لا يقرأ سندات الدفع", await req(null, "GET", receiptUrl), 403);
  status("الإدارة تقرأ سند الدفع", await req(admin, "GET", receiptUrl), 200);
  status("طالب آخر لا يرفع سندًا على طلب غيره", await uploadFile(reem, PNG_BYTES, "image/png", "r2.png", `/api/v1/orders/${orderId}/receipt`, "receipt"), 403);
  status("طالب لا يعتمد المدفوعات", await req(lama, "POST", `/api/v1/payments/${paymentId}/review`, { decision: "APPROVED" }), 403);
  status("مدرس لا يعتمد المدفوعات", await req(sara, "POST", `/api/v1/payments/${paymentId}/review`, { decision: "APPROVED" }), 403);

  const awaiting = await req(admin, "GET", "/api/v1/payments?status=UNDER_REVIEW&limit=50");
  status("الإدارة ترى السندات قيد المراجعة", awaiting, 200);
  check("السند الجديد ظاهر للإدارة", (awaiting.body.data ?? []).some((p: any) => p.id === paymentId));

  status("الإدارة تعتمد السند", await req(admin, "POST", `/api/v1/payments/${paymentId}/review`, { decision: "APPROVED", note: "اختبار تلقائي" }), 200);
  const paid = await req(jawaher, "GET", `/api/v1/orders/${orderId}`);
  check("الطلب أصبح مدفوعًا بعد الاعتماد", paid.body?.data?.order?.status === "PAID", paid.body?.data?.order?.status ?? "?");
  const paidAccess = await req(jawaher, "GET", `/api/v1/offerings/${o1}`);
  check("المشترك الجديد يرى المحتوى المدفوع", paidAccess.body?.data?.canSeeAllLessons === true);
  status("إعادة مراجعة السند نفسه مرفوضة", await req(admin, "POST", `/api/v1/payments/${paymentId}/review`, { decision: "APPROVED" }), 400);

  // ---------- 2) رفض السند لا يمنح وصولًا ----------
  const enroll2 = await req(bandar, "POST", `/api/v1/offerings/${o2}/enroll`);
  let order2 = "";
  if (status("طالب آخر: التسجيل في دورة ثانية", enroll2, [200, 201])) {
    order2 = enroll2.body.data.order.id;
    createdOrders.push(order2);
  }
  const receipt2 = await uploadFile(bandar, PNG_BYTES, "image/png", "receipt2.png", `/api/v1/orders/${order2}/receipt`, "receipt");
  let payment2 = "";
  if (status("رفع سند ثانٍ", receipt2, 201)) {
    files.push(receipt2.body.data.payment.receiptUrl);
  }
  const order2View = await req(admin, "GET", `/api/v1/orders/${order2}`);
  payment2 = order2View.body?.data?.order?.payments?.[0]?.id ?? "";
  status("الإدارة ترفض السند", await req(admin, "POST", `/api/v1/payments/${payment2}/review`, { decision: "REJECTED", note: "سند تجريبي غير واضح" }), 200);
  const rejected = await req(bandar, "GET", `/api/v1/orders/${order2}`);
  check("الطلب مرفوض", rejected.body?.data?.order?.status === "REJECTED", rejected.body?.data?.order?.status ?? "?");
  const noAccess = await req(bandar, "GET", `/api/v1/offerings/${o2}`);
  check("الرفض لا يمنح الوصول المدفوع", noAccess.body?.data?.canSeeAllLessons === false);

  // تنظيف سجلات الاختبار (طلبات ومدفوعات واشتراكات أُنشئت الآن)
  await prisma.payment.deleteMany({ where: { orderId: { in: createdOrders } } });
  await prisma.enrollment.deleteMany({ where: { userId: { in: [jawaher.id, bandar.id] }, offeringId: { in: [o1, o2] } } });
  await prisma.order.deleteMany({ where: { id: { in: createdOrders } } });

  return files;
}
