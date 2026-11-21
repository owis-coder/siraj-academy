import { prisma } from "./prisma";
import { recordJournalEntry } from "./ledgerService";
import { badRequest, notFound, forbidden } from "./errors";
import { getCommissionRate } from "./settings";
import { encryptBankDetail, maskIban } from "./crypto";
import type { Prisma, WithdrawalStatus } from "@prisma/client";

/**
 * تسجيل استحقاق المدرس المالي وتثبيت لقطة العمولة فور اعتماد الدفع للطلب
 */
export async function recordTeacherEarningForOrder(
  orderId: string,
  client: Prisma.TransactionClient = prisma
) {
  const order = await client.order.findUnique({
    where: { id: orderId },
    include: { provider: true },
  });

  if (!order || !order.providerId) {
    // الطلب لا يتبع لمدرس محدد (مثل خدمات مباشرة من المنصة)
    return null;
  }

  // منع التكرار قطعيًا (Idempotency)
  const existingEarning = await client.teacherEarning.findUnique({
    where: {
      orderId_teacherId: {
        orderId: order.id,
        teacherId: order.providerId,
      },
    },
  });

  if (existingEarning) {
    return existingEarning;
  }

  // أخذ لقطة لحظية ثابتة لنسبة العمولة من الإعدادات في هذه اللحظة بالذات
  const commissionRate = await getCommissionRate();
  const grossAmount = Math.round(order.amount * 100) / 100;
  const commissionAmount = Math.round(grossAmount * commissionRate * 100) / 100;
  const netAmount = Math.round((grossAmount - commissionAmount) * 100) / 100;

  // إنشاء سجل الاستحقاق الثابت
  const earning = await client.teacherEarning.create({
    data: {
      orderId: order.id,
      teacherId: order.providerId,
      grossAmount,
      commissionRate,
      commissionAmount,
      netAmount,
      currency: "SAR",
      status: "AVAILABLE",
    },
  });

  // تسجيل قيد محاسبي مزدوج: تحويل ودائع الطلاب إلى إيراد عمولة المنصة + مستحقات المدرس
  await recordJournalEntry(
    {
      type: "EARNING_REALIZATION",
      narrativeAr: `استحقاق أرباح طلب ${order.orderNo} للمدرس - إجمالي ${grossAmount} ريال (صافي ${netAmount} ريال وعمولة ${commissionAmount} ريال)`,
      narrativeEn: `Earning realization for order ${order.orderNo}`,
      referenceType: "ORDER",
      referenceId: order.id,
      currency: "SAR",
      lines: [
        { accountCode: "2010", entryType: "DEBIT", amount: grossAmount, userId: order.studentId },
        { accountCode: "4010", entryType: "CREDIT", amount: commissionAmount },
        { accountCode: "2020", entryType: "CREDIT", amount: netAmount, userId: order.provider?.userId || order.providerId },
      ],
    },
    client
  );

  return earning;
}

/**
 * احتساب رصيد محفظة المدرس وكشف الحساب المالي
 */
export async function getTeacherWalletSummary(
  teacherProfileId: string,
  client: Prisma.TransactionClient = prisma
) {
  const profile = await client.teacherProfile.findUnique({
    where: { id: teacherProfileId },
    include: {
      earnings: { orderBy: { createdAt: "desc" }, include: { order: { select: { orderNo: true, title: true } } } },
      withdrawals: { orderBy: { createdAt: "desc" }, include: { payoutMethod: true } },
      payoutMethods: { orderBy: { isDefault: "desc" } },
    },
  });

  if (!profile) throw notFound("ملف المدرس غير موجود");

  // إجمالي الأرباح المستحقة المكتملة
  const earnedTotal = profile.earnings
    .filter((e) => e.status === "AVAILABLE" || e.status === "WITHDRAWN")
    .reduce((sum, e) => sum + e.netAmount, 0);

  // أرباح قيد المقاصة (Pending Clearing)
  const pendingClearing = profile.earnings
    .filter((e) => e.status === "PENDING_CLEARING")
    .reduce((sum, e) => sum + e.netAmount, 0);

  // إجمالي المبالغ المسحوبة والمحولة بالفعل
  const withdrawnTotal = profile.withdrawals
    .filter((w) => w.status === "PAID")
    .reduce((sum, w) => sum + w.amount, 0);

  // المبالغ المحجوزة لطلبات سحب جارية (منع الازدواج المالي)
  const reservedTotal = profile.withdrawals
    .filter((w) => ["PENDING", "UNDER_REVIEW", "APPROVED", "PROCESSING"].includes(w.status))
    .reduce((sum, w) => sum + w.amount, 0);

  // الرصيد الصافي المتاح للسحب
  const availableBalance = Math.max(
    0,
    Math.round((earnedTotal - withdrawnTotal - reservedTotal) * 100) / 100
  );

  return {
    teacherId: profile.id,
    currency: "SAR",
    availableBalance,
    reservedBalance: Math.round(reservedTotal * 100) / 100,
    earnedTotal: Math.round(earnedTotal * 100) / 100,
    withdrawnTotal: Math.round(withdrawnTotal * 100) / 100,
    pendingClearing: Math.round(pendingClearing * 100) / 100,
    payoutMethods: profile.payoutMethods.map((pm) => ({
      id: pm.id,
      bankName: pm.bankName,
      accountHolderName: pm.accountHolderName,
      ibanMasked: pm.ibanMasked,
      isDefault: pm.isDefault,
      isVerified: pm.isVerified,
    })),
    recentEarnings: profile.earnings.slice(0, 20),
    recentWithdrawals: profile.withdrawals.slice(0, 20),
  };
}

/**
 * إضافة أو تحديث وسيلة سحب بنكية للمدرس
 */
export async function addTeacherPayoutMethod(
  teacherProfileId: string,
  data: {
    bankName: string;
    accountHolderName: string;
    iban: string;
    isDefault?: boolean;
  }
) {
  const cleanIban = data.iban.trim().replace(/\s+/g, "").toUpperCase();
  if (!cleanIban.startsWith("SA") || cleanIban.length !== 24) {
    throw badRequest("صيغة الآيبان غير صحيحة، يجب أن يبدأ بـ SA ويتكون من 24 حرفًا ورقمًا");
  }

  return await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.teacherPayoutMethod.updateMany({
        where: { teacherId: teacherProfileId },
        data: { isDefault: false },
      });
    }

    const hasAny = await tx.teacherPayoutMethod.count({ where: { teacherId: teacherProfileId } });

    const method = await tx.teacherPayoutMethod.create({
      data: {
        teacherId: teacherProfileId,
        bankName: data.bankName.trim(),
        accountHolderName: data.accountHolderName.trim(),
        ibanEncrypted: encryptBankDetail(cleanIban),
        ibanMasked: maskIban(cleanIban),
        isDefault: data.isDefault ?? hasAny === 0,
        isVerified: true,
      },
    });

    return {
      id: method.id,
      bankName: method.bankName,
      accountHolderName: method.accountHolderName,
      ibanMasked: method.ibanMasked,
      isDefault: method.isDefault,
    };
  }, { maxWait: 15000, timeout: 30000 });
}

/**
 * تقديم طلب سحب أرباح مع الحجز الذري للرصيد داخل Transaction
 */
export async function submitWithdrawalRequest(
  teacherProfileId: string,
  data: {
    amount: number;
    payoutMethodId: string;
    adminNotes?: string;
  }
) {
  return await prisma.$transaction(async (tx) => {
    const summary = await getTeacherWalletSummary(teacherProfileId, tx);
    const requested = Math.round(data.amount * 100) / 100;

    // الحد الأدنى للسحب هو 50 ريال افتراضياً
    const minWithdrawal = 50;
    if (requested < minWithdrawal) {
      throw badRequest(`الحد الأدنى لطلب السحب هو ${minWithdrawal} ريال`);
    }

    if (requested > summary.availableBalance) {
      throw badRequest(
        `الرصيد المتاح للسحب (${summary.availableBalance} ريال) لا يكفي لتغطية المبلغ المطلوب (${requested} ريال)`
      );
    }

    const method = await tx.teacherPayoutMethod.findFirst({
      where: { id: data.payoutMethodId, teacherId: teacherProfileId },
    });
    if (!method) throw badRequest("وسيلة السحب البنكية المحددة غير صحيحة أو لا تتبع لملفك");

    const count = await tx.teacherWithdrawal.count();
    const withdrawalNo = `WTH-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

    // قيد حجز الرصيد المزدوج: نقل المبلغ من مستحقات متاحة إلى مستحقات محجوزة
    const journalEntry = await recordJournalEntry(
      {
        type: "WITHDRAWAL_RESERVE",
        narrativeAr: `حجز رصيد سحب للمدرس لطلب السحب ${withdrawalNo} بمبلغ ${requested} ريال`,
        narrativeEn: `Balance reservation for withdrawal request ${withdrawalNo}`,
        referenceType: "WITHDRAWAL",
        referenceId: withdrawalNo,
        currency: "SAR",
        lines: [
          { accountCode: "2020", entryType: "DEBIT", amount: requested },
          { accountCode: "2021", entryType: "CREDIT", amount: requested },
        ],
      },
      tx
    );

    const withdrawal = await tx.teacherWithdrawal.create({
      data: {
        withdrawalNo,
        teacherId: teacherProfileId,
        payoutMethodId: method.id,
        amount: requested,
        fee: 0,
        netAmount: requested,
        currency: "SAR",
        status: "PENDING",
        adminNotes: data.adminNotes?.trim() || null,
        journalEntryId: journalEntry.id,
      },
      include: { payoutMethod: true },
    });

    return withdrawal;
  }, { maxWait: 15000, timeout: 30000 });
}

/**
 * مراجعة طلب السحب من الإدارة (اعتماد أو رفض)
 * في حال الرفض: يتم تحرير الرصيد المحجوز وإعادته فوراً للرصيد المتاح
 */
export async function reviewWithdrawalRequest(
  withdrawalId: string,
  reviewerId: string,
  data: {
    decision: "APPROVED" | "REJECTED";
    adminNotes?: string;
    rejectionReason?: string;
  }
) {
  return await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.teacherWithdrawal.findUnique({
      where: { id: withdrawalId },
      include: { payoutMethod: true },
    });

    if (!withdrawal) throw notFound("طلب السحب غير موجود");

    if (withdrawal.status !== "PENDING" && withdrawal.status !== "UNDER_REVIEW") {
      throw badRequest(`لا يمكن مراجعة طلب في حالة ${withdrawal.status}`);
    }

    if (data.decision === "REJECTED") {
      if (!data.rejectionReason || data.rejectionReason.trim().length < 3) {
        throw badRequest("سبب الرفض إلزامي ويجب ألا يقل عن 3 أحرف");
      }

      // قيد تحرير الرصيد المحجوز وإعادته إلى الرصيد المتاح
      await recordJournalEntry(
        {
          type: "WITHDRAWAL_RELEASE",
          narrativeAr: `إلغاء حجز رصيد وإرجاعه للمدرس لطلب السحب ${withdrawal.withdrawalNo} بسبب: ${data.rejectionReason}`,
          narrativeEn: `Release reserved balance for rejected withdrawal ${withdrawal.withdrawalNo}`,
          referenceType: "WITHDRAWAL",
          referenceId: withdrawal.id,
          createdById: reviewerId,
          currency: withdrawal.currency,
          lines: [
            { accountCode: "2021", entryType: "DEBIT", amount: withdrawal.amount },
            { accountCode: "2020", entryType: "CREDIT", amount: withdrawal.amount },
          ],
        },
        tx
      );

      return await tx.teacherWithdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: "REJECTED",
          reviewerId,
          rejectionReason: data.rejectionReason.trim(),
          adminNotes: data.adminNotes?.trim() || null,
        },
      });
    }

    // اعتماد الطلب للمرحلة التالية (تنفيذ التحويل البنكي)
    return await tx.teacherWithdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: "APPROVED",
        reviewerId,
        adminNotes: data.adminNotes?.trim() || null,
      },
    });
  }, { maxWait: 15000, timeout: 30000 });
}

/**
 * تنفيذ التحويل البنكي للمدرس وتوثيق سند الحوالة ورقم العملية
 */
export async function executeWithdrawalTransfer(
  withdrawalId: string,
  executedById: string,
  data: {
    transferProofUrl: string;
    transferReferenceNo: string;
    transferredAt?: Date;
    adminNotes?: string;
  }
) {
  return await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.teacherWithdrawal.findUnique({
      where: { id: withdrawalId },
      include: { payoutMethod: true },
    });

    if (!withdrawal) throw notFound("طلب السحب غير موجود");

    if (withdrawal.status !== "APPROVED" && withdrawal.status !== "PROCESSING") {
      throw badRequest(`لا يمكن تنفيذ تحويل بنكي لطلب في حالة ${withdrawal.status}`);
    }

    if (!data.transferProofUrl || !data.transferReferenceNo) {
      throw badRequest("إشعار التحويل البنكي والرقم المرجعي مطلوبان لتأكيد صرف الحوالة");
    }

    // قيد الصرف النهائي: خصم من حساب البنك التشغيلي وإقفال الالتزام المحجوز
    await recordJournalEntry(
      {
        type: "WITHDRAWAL_PAYOUT",
        narrativeAr: `تنفيذ صرف حوالة أرباح للمدرس لطلب السحب ${withdrawal.withdrawalNo} - حوالة رقم ${data.transferReferenceNo}`,
        narrativeEn: `Execution of teacher payout for withdrawal ${withdrawal.withdrawalNo}`,
        referenceType: "WITHDRAWAL",
        referenceId: withdrawal.id,
        createdById: executedById,
        currency: withdrawal.currency,
        lines: [
          { accountCode: "2021", entryType: "DEBIT", amount: withdrawal.amount },
          { accountCode: "1010", entryType: "CREDIT", amount: withdrawal.amount },
        ],
      },
      tx
    );

    return await tx.teacherWithdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: "PAID",
        executedById,
        transferProofUrl: data.transferProofUrl,
        transferReferenceNo: data.transferReferenceNo,
        transferredAt: data.transferredAt || new Date(),
        adminNotes: data.adminNotes?.trim() || withdrawal.adminNotes,
      },
    });
  }, { maxWait: 15000, timeout: 30000 });
}
