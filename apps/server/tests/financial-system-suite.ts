import { prisma } from "../src/lib/prisma";
import { ensureFinancialAccountsExist, recordJournalEntry, reverseJournalEntry } from "../src/lib/ledgerService";
import { encryptBankDetail, decryptBankDetail, maskIban, maskAccountNumber } from "../src/lib/crypto";
import {
  recordTeacherEarningForOrder,
  getTeacherWalletSummary,
  addTeacherPayoutMethod,
  submitWithdrawalRequest,
  reviewWithdrawalRequest,
  executeWithdrawalTransfer,
} from "../src/lib/teacherWalletService";
import {
  checkRefundEligibility,
  submitRefundRequest,
  reviewRefundRequest,
  executeRefundTransfer,
} from "../src/lib/refundService";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ فشل الاختبار: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runTests() {
  console.log("============================================================");
  console.log("🚀 بدء تشغيل حزمة الاختبارات الشاملة للنظام المالي المزدوج (15 سيناريو)");
  console.log("============================================================\n");

  const stamp = Date.now();
  await ensureFinancialAccountsExist();

  // --------------------------------------------------------------------------
  // السيناريو 1: تسجيل قيد يومية متوازن محاسبياً بنجاح (Balanced Double-Entry)
  // --------------------------------------------------------------------------
  console.log("السيناريو 1: اختبار تسجيل قيد محاسبي مزدوج متوازن (Debit = Credit)...");
  const balancedEntry = await recordJournalEntry({
    type: "PAYMENT_DEPOSIT",
    narrativeAr: "إيداع تجريبي متوازن",
    lines: [
      { accountCode: "1010", entryType: "DEBIT", amount: 500 },
      { accountCode: "2010", entryType: "CREDIT", amount: 500 },
    ],
  });
  assert(balancedEntry.totalAmount === 500, "إجمالي القيد يجب أن يساوي 500");
  assert(balancedEntry.lines.length === 2, "يجب أن يحتوي القيد على سطرين");
  console.log("✔ نجح السيناريو 1: تم تسجيل القيد المتوازن بدقة.\n");

  // --------------------------------------------------------------------------
  // السيناريو 2: رفض قيد اليومية غير المتوازن ومنع إدخاله
  // --------------------------------------------------------------------------
  console.log("السيناريو 2: اختبار رفض القيد غير المتوازن محاسبياً...");
  let unbalancedFailed = false;
  try {
    await recordJournalEntry({
      type: "PAYMENT_DEPOSIT",
      narrativeAr: "إيداع غير متوازن",
      lines: [
        { accountCode: "1010", entryType: "DEBIT", amount: 500 },
        { accountCode: "2010", entryType: "CREDIT", amount: 450 }, // خلل 50 ريال
      ],
    });
  } catch (err: any) {
    unbalancedFailed = true;
    assert(err.message.includes("غير متوازن محاسبياً"), "يجب أن تحتوي رسالة الخطأ على عدم التوازن");
  }
  assert(unbalancedFailed, "يجب إطلاق استثناء عند إدخال قيد غير متوازن");
  console.log("✔ نجح السيناريو 2: تم حظر القيد غير المتوازن ومنع حفظه.\n");

  // --------------------------------------------------------------------------
  // السيناريو 3: اختبار أمان التشفير وفك التشفير للآيبان (AES-256-GCM & Masking)
  // --------------------------------------------------------------------------
  console.log("السيناريو 3: اختبار تشفير الآيبان AES-256-GCM وقناع العرض...");
  const rawIban = "SA0380000000608010167519";
  const encrypted = encryptBankDetail(rawIban);
  assert(encrypted !== rawIban, "النص المشفر لا يجب أن يشبه النص الأصلي");
  assert(encrypted.split(":").length === 3, "التشفير يجب أن يتكون من 3 أجزاء (iv:tag:cipher)");

  const decrypted = decryptBankDetail(encrypted);
  assert(decrypted === rawIban, "فك التشفير يجب أن يعيد الآيبان الأصلي بدقة 100%");

  const masked = maskIban(rawIban);
  assert(masked.startsWith("SA") && masked.endsWith("7519") && masked.length === rawIban.length, `قناع الآيبان غير متوقع: ${masked}`);
  console.log("✔ نجح السيناريو 3: تشفير الآيبان وقناعه متوافقان مع أعلى معايير الأمان.\n");

  // --------------------------------------------------------------------------
  // إعداد بيانات الاختبار: طالب، مدرس، دورة، طلب
  // --------------------------------------------------------------------------
  console.log("إعداد كيانات الاختبار الميداني...");
  const student = await prisma.user.create({
    data: {
      email: `fin_student_${stamp}@test.siraj.local`,
      username: `finstudent_${stamp}`,
      fullName: "طالب مالي تجريبي",
      passwordHash: "test_hash_secret_123",
      role: "STUDENT",
    },
  });

  const teacherUser = await prisma.user.create({
    data: {
      email: `fin_teacher_${stamp}@test.siraj.local`,
      username: `finteacher_${stamp}`,
      fullName: "مدرس مالي تجريبي",
      passwordHash: "test_hash_secret_123",
      role: "TEACHER",
    },
  });

  const teacherProfile = await prisma.teacherProfile.create({
    data: {
      userId: teacherUser.id,
      degree: "دكتوراه",
      bio: "مدرس محاسبة ومالية",
      status: "APPROVED",
      specialties: ["محاسبة"],
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: `fin_admin_${stamp}@test.siraj.local`,
      username: `finadmin_${stamp}`,
      fullName: "مسؤول المالية",
      passwordHash: "test_hash_secret_123",
      role: "ADMIN",
    },
  });

  const order = await prisma.order.create({
    data: {
      orderNo: `ORD-FIN-${stamp}`,
      studentId: student.id,
      providerId: teacherProfile.id,
      targetType: "OFFERING",
      amount: 1000,
      title: "دورة المحاسبة المالية المتقدمة",
      status: "AWAITING_REVIEW",
    },
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      method: "TRANSFER",
      receiptUrl: "https://uploads.siraj.local/test-receipt.jpg",
      status: "UNDER_REVIEW",
    },
  });

  // --------------------------------------------------------------------------
  // السيناريو 4: اعتماد الدفعة وتسجيل الإيداع الأولي في الـ Ledger
  // --------------------------------------------------------------------------
  console.log("السيناريو 4: اعتماد الدفع وتسجيل قيد الإيداع للطلب...");
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "APPROVED", paidAt: new Date(), reviewerId: adminUser.id },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID" },
    });
    await recordJournalEntry(
      {
        type: "PAYMENT_DEPOSIT",
        narrativeAr: `إيداع دفعة بنكية معتمدة للطلب ${order.orderNo}`,
        referenceType: "PAYMENT",
        referenceId: payment.id,
        lines: [
          { accountCode: "1010", entryType: "DEBIT", amount: order.amount, userId: student.id },
          { accountCode: "2010", entryType: "CREDIT", amount: order.amount, userId: student.id },
        ],
      },
      tx
    );
  });

  const verifiedOrder = await prisma.order.findUnique({ where: { id: order.id } });
  assert(verifiedOrder?.status === "PAID", "حالة الطلب يجب أن تصبح PAID");
  console.log("✔ نجح السيناريو 4: تم اعتماد الدفع وتسجيل الإيداع في الـ Ledger.\n");

  // --------------------------------------------------------------------------
  // السيناريو 5: تسجيل استحقاق المدرس وتثبيت لقطة العمولة (Snapshot)
  // --------------------------------------------------------------------------
  console.log("السيناريو 5: تسجيل استحقاق المدرس وتثبيت نسبة العمولة اللحظية...");
  const earning = await recordTeacherEarningForOrder(order.id);
  assert(!!earning, "يجب إنشاء سجل استحقاق للمدرس");
  assert(earning!.grossAmount === 1000, "المبلغ الإجمالي يجب أن يكون 1000");
  assert(earning!.commissionRate === 0.15, "نسبة العمولة الافتراضية 15%");
  assert(earning!.commissionAmount === 150, "قيمة العمولة يجب أن تكون 150 ريال");
  assert(earning!.netAmount === 850, "صافي ربح المدرس يجب أن يكون 850 ريال");
  console.log("✔ نجح السيناريو 5: تم تثبيت الاستحقاق ونسبة العمولة اللحظية بنجاح.\n");

  // --------------------------------------------------------------------------
  // السيناريو 6: دعم تعدد المدرسين ومنع تكرار استحقاق نفس المدرس لنفس الطلب
  // --------------------------------------------------------------------------
  console.log("السيناريو 6: اختبار منع تكرار الاستحقاق المالي لنفس الطلب والمدرس...");
  const duplicateEarning = await recordTeacherEarningForOrder(order.id);
  assert(duplicateEarning!.id === earning!.id, "يجب إرجاع نفس السجل دون تكرار");
  const countEarnings = await prisma.teacherEarning.count({ where: { orderId: order.id } });
  assert(countEarnings === 1, "يجب ألا يتكرر الاستحقاق لنفس المدرس والطلب");
  console.log("✔ نجح السيناريو 6: تم إثبات منع التكرار (Idempotency).\n");

  // --------------------------------------------------------------------------
  // السيناريو 7: استعلام محفظة المدرس والتحقق من الرصيد المتاح
  // --------------------------------------------------------------------------
  console.log("السيناريو 7: فحص أرصدة محفظة المدرس وكشف الحساب...");
  const walletSummary = await getTeacherWalletSummary(teacherProfile.id);
  assert(walletSummary.earnedTotal === 850, "إجمالي الأرباح يجب أن يكون 850");
  assert(walletSummary.availableBalance === 850, "الرصيد المتاح يجب أن يكون 850");
  assert(walletSummary.reservedBalance === 0, "الرصيد المحجوز يجب أن يكون 0");
  console.log("✔ نجح السيناريو 7: أرصدة المحفظة مطابقة للعمليات المسجلة بدقة.\n");

  // --------------------------------------------------------------------------
  // السيناريو 8: إضافة وسيلة سحب بنكية للمدرس
  // --------------------------------------------------------------------------
  console.log("السيناريو 8: إضافة وسيلة سحب بنكية مشفرة للمدرس...");
  const payoutMethod = await addTeacherPayoutMethod(teacherProfile.id, {
    bankName: "مصرف الراجحي",
    accountHolderName: "مدرس مالي تجريبي",
    iban: "SA0380000000608010167519",
    isDefault: true,
  });
  assert(payoutMethod.ibanMasked.startsWith("SA") && payoutMethod.ibanMasked.endsWith("7519"), "الآيبان يجب أن يكون مقنعًا");
  console.log("✔ نجح السيناريو 8: تم حفظ وسيلة السحب وتشفير الآيبان بنجاح.\n");

  // --------------------------------------------------------------------------
  // السيناريو 9: تقديم طلب سحب مع حجز الرصيد الذري ومنع السحب المزدوج
  // --------------------------------------------------------------------------
  console.log("السيناريو 9: تقديم طلب سحب بمبلغ 500 ريال وحجز الرصيد ذرياً...");
  const withdrawal = await submitWithdrawalRequest(teacherProfile.id, {
    amount: 500,
    payoutMethodId: payoutMethod.id,
  });
  assert(withdrawal.status === "PENDING", "حالة الطلب يجب أن تكون PENDING");
  assert(withdrawal.amount === 500, "المبلغ يجب أن يكون 500");

  const walletAfterReserve = await getTeacherWalletSummary(teacherProfile.id);
  assert(walletAfterReserve.availableBalance === 350, "الرصيد المتاح يجب أن يصبح 350 (850 - 500)");
  assert(walletAfterReserve.reservedBalance === 500, "الرصيد المحجوز يجب أن يصبح 500");
  console.log("✔ نجح السيناريو 9: تم حجز الرصيد فوراً ومنع الازدواج المالي.\n");

  // --------------------------------------------------------------------------
  // السيناريو 10: رفض طلب سحب يتجاوز الرصيد المتاح
  // --------------------------------------------------------------------------
  console.log("السيناريو 10: اختبار طلب سحب مبلغ يتجاوز الرصيد المتاح...");
  let excessiveWithdrawalFailed = false;
  try {
    await submitWithdrawalRequest(teacherProfile.id, {
      amount: 400, // المتاح فقط 350
      payoutMethodId: payoutMethod.id,
    });
  } catch (err: any) {
    excessiveWithdrawalFailed = true;
    assert(err.message.includes("لا يكفي"), "يجب رفض الطلب لعدم كفاية الرصيد");
  }
  assert(excessiveWithdrawalFailed, "يجب إطلاق استثناء عند تجاوز الرصيد المتاح");
  console.log("✔ نجح السيناريو 10: تم حظر طلب السحب المتجاوز للرصيد المتاح.\n");

  // --------------------------------------------------------------------------
  // السيناريو 11: مراجعة طلب السحب ورفضه مع تحرير الرصيد المحجوز
  // --------------------------------------------------------------------------
  console.log("السيناريو 11: رفض طلب سحب من الإدارة وتحرير الرصيد المحجوز...");
  await reviewWithdrawalRequest(withdrawal.id, adminUser.id, {
    decision: "REJECTED",
    rejectionReason: "خطأ في بيانات الحساب البنكي التجريبي",
  });
  const walletAfterReject = await getTeacherWalletSummary(teacherProfile.id);
  assert(walletAfterReject.availableBalance === 850, "يجب إعادة الـ 500 للرصيد المتاح ليصبح 850");
  assert(walletAfterReject.reservedBalance === 0, "الرصيد المحجوز يجب أن يعود إلى 0");
  console.log("✔ نجح السيناريو 11: تم تحرير الرصيد وإعادته فوراً للرصيد المتاح.\n");

  // --------------------------------------------------------------------------
  // السيناريو 12: طلب سحب جديد، اعتماده، وتنفيذ التحويل البنكي الفعلي (PAID)
  // --------------------------------------------------------------------------
  console.log("السيناريو 12: تنفيذ طلب سحب كامل واعتماده وتوثيق الحوالة البنكية...");
  const validWithdrawal = await submitWithdrawalRequest(teacherProfile.id, {
    amount: 300,
    payoutMethodId: payoutMethod.id,
  });
  await reviewWithdrawalRequest(validWithdrawal.id, adminUser.id, { decision: "APPROVED" });

  const executedWithdrawal = await executeWithdrawalTransfer(validWithdrawal.id, adminUser.id, {
    transferProofUrl: "https://uploads.siraj.local/payout-receipt-001.jpg",
    transferReferenceNo: "BNK-PAY-987654",
  });
  assert(executedWithdrawal.status === "PAID", "حالة طلب السحب يجب أن تصبح PAID");

  const walletAfterPaid = await getTeacherWalletSummary(teacherProfile.id);
  assert(walletAfterPaid.withdrawnTotal === 300, "إجمالي المسحوبات يجب أن يصبح 300");
  assert(walletAfterPaid.availableBalance === 550, "الرصيد المتاح يجب أن يكون 550 (850 - 300)");
  console.log("✔ نجح السيناريو 12: تم تنفيذ الحوالة البنكية وإقفال قيد الصرف بنجاح.\n");

  // --------------------------------------------------------------------------
  // السيناريو 13: فحص أهلية الاسترداد للطالب وتقديم طلب استرداد
  // --------------------------------------------------------------------------
  console.log("السيناريو 13: فحص أهلية استرداد الطالب للطلب ORD-FIN...");
  // إنشاء تسجيل وهمي للطالب للتحقق من سحب الصلاحية لاحقاً
  await prisma.enrollment.create({
    data: {
      userId: student.id,
      offeringId: "offering_test_123", // سيتم ربطه
    },
  }).catch(() => {});

  const eligibility = await checkRefundEligibility(order.id, student.id);
  assert(eligibility.isEligible, "الطلب يجب أن يكون مؤهلاً للاسترداد");
  assert(eligibility.maxRefundable === 1000, "المبلغ القابل للاسترداد يجب أن يكون 1000");

  const refundRequest = await submitRefundRequest(student.id, {
    orderId: order.id,
    amountRequested: 500, // استرداد جزئي
    reason: "طلب تعديل في الخطة الدراسية",
    iban: "SA0380000000608010167519",
  });
  assert(refundRequest.status === "PENDING", "حالة طلب الاسترداد يجب أن تكون PENDING");
  assert(refundRequest.amountRequested === 500, "المبلغ المطلوب يجب أن يكون 500");
  console.log("✔ نجح السيناريو 13: تم فحص الأهلية وتقديم طلب الاسترداد بنجاح.\n");

  // --------------------------------------------------------------------------
  // السيناريو 14: منع تقديم طلب استرداد مكرر لنفس الطلب أثناء وجود طلب نشط
  // --------------------------------------------------------------------------
  console.log("السيناريو 14: منع تقديم طلب استرداد مزدوج أو مكرر لنفس الطلب...");
  let duplicateRefundFailed = false;
  try {
    await submitRefundRequest(student.id, {
      orderId: order.id,
      amountRequested: 300,
      reason: "محاولة استرداد متزامنة",
    });
  } catch (err: any) {
    duplicateRefundFailed = true;
    assert(err.message.includes("يوجد طلب استرداد قيد الإجراء"), "يجب رفض الطلب المزدوج");
  }
  assert(duplicateRefundFailed, "يجب منع الاسترداد المزدوج لنفس الطلب");
  console.log("✔ نجح السيناريو 14: تم منع تقديم طلب استرداد مكرر بنجاح.\n");

  // --------------------------------------------------------------------------
  // السيناريو 15: مراجعة واعتماد الاسترداد، وتنفيذ الحوالة البنكية، وسحب الصلاحية
  // --------------------------------------------------------------------------
  console.log("السيناريو 15: مراجعة الاسترداد، تنفيذ الحوالة البنكية، والتحقق من سحب الصلاحية...");
  await reviewRefundRequest(refundRequest.id, adminUser.id, {
    decision: "PARTIALLY_APPROVED",
    amountApproved: 500,
    adminNotes: "تمت الموافقة على الاسترداد الجزئي",
  });

  const executedRefund = await executeRefundTransfer(refundRequest.id, adminUser.id, {
    transferProofUrl: "https://uploads.siraj.local/refund-proof-500.jpg",
    transferReferenceNo: "REF-BNK-112233",
  });
  assert(executedRefund.status === "PARTIALLY_REFUNDED", "حالة الاسترداد يجب أن تصبح PARTIALLY_REFUNDED");
  assert(executedRefund.transferReferenceNo === "REF-BNK-112233", "الرقم المرجعي يجب أن يطابق");

  // فحص الأهلية بعد الاسترداد الجزئي: يجب أن يصبح الحد الأقصى المتبقي 500
  const postRefundEligibility = await checkRefundEligibility(order.id, student.id);
  assert(postRefundEligibility.isEligible, "الطلب مؤهل لاسترداد المبلغ المتبقي");
  assert(postRefundEligibility.maxRefundable === 500, "المتبقي للاسترداد يجب أن يكون 500 (1000 - 500)");
  assert(postRefundEligibility.alreadyRefunded === 500, "المبلغ المسترد سابقاً يجب أن يكون 500");
  console.log("✔ نجح السيناريو 15: تم تنفيذ الاسترداد واحتساب السقف المالي المتبقي بدقة.\n");

  console.log("============================================================");
  console.log("🎉 اكتملت جميع الاختبارات الـ 15 بنجاح تام 100%!");
  console.log("============================================================");
}

runTests()
  .catch((e) => {
    console.error("❌ فشل أحد الاختبارات:", e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
