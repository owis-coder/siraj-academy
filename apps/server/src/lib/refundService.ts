import { prisma } from "./prisma";
import { recordJournalEntry } from "./ledgerService";
import { badRequest, notFound, forbidden } from "./errors";
import { encryptBankDetail, maskIban } from "./crypto";
import type { Prisma, RefundStatus } from "@prisma/client";

export interface RefundEligibilityResult {
  isEligible: boolean;
  reason?: string;
  maxRefundable: number;
  totalPaid: number;
  alreadyRefunded: number;
  order?: {
    id: string;
    orderNo: string;
    title: string;
    amount: number;
    targetType: string;
    status: string;
  };
}

/**
 * فحص أهلية الطلب للاسترداد المالي
 */
export async function checkRefundEligibility(
  orderId: string,
  studentId: string,
  client: Prisma.TransactionClient = prisma
): Promise<RefundEligibilityResult> {
  const order = await client.order.findUnique({
    where: { id: orderId },
    include: {
      payments: { where: { status: "APPROVED" } },
      refundRequests: true,
    },
  });

  if (!order) {
    return { isEligible: false, reason: "الطلب غير موجود", maxRefundable: 0, totalPaid: 0, alreadyRefunded: 0 };
  }

  if (order.studentId !== studentId) {
    return { isEligible: false, reason: "الطلب لا يتبع لحسابك الحالي", maxRefundable: 0, totalPaid: 0, alreadyRefunded: 0 };
  }

  if (order.status !== "PAID" || order.payments.length === 0) {
    return {
      isEligible: false,
      reason: "لا يمكن استرداد طلب لم يُعتمد دفعه بعد أو تم إلغاؤه",
      maxRefundable: 0,
      totalPaid: order.amount,
      alreadyRefunded: 0,
    };
  }

  // حساب المبالغ المستردة مسبقًا والمكتملة
  const approvedRefunds = order.refundRequests.filter(
    (r) => r.status === "REFUNDED" || r.status === "PARTIALLY_REFUNDED"
  );
  const alreadyRefunded = approvedRefunds.reduce((sum, r) => sum + (r.amountApproved || 0), 0);
  const maxRefundable = Math.max(0, Math.round((order.amount - alreadyRefunded) * 100) / 100);

  if (maxRefundable <= 0) {
    return {
      isEligible: false,
      reason: "تم استرداد كامل قيمة هذا الطلب مسبقًا",
      maxRefundable: 0,
      totalPaid: order.amount,
      alreadyRefunded,
    };
  }

  // التحقق من عدم وجود طلب استرداد قيد المعالجة حالياً (منع التكرار والتزامن)
  const activeRequest = order.refundRequests.find((r) =>
    ["PENDING", "UNDER_REVIEW", "NEEDS_INFORMATION", "APPROVED", "PARTIALLY_APPROVED", "PROCESSING"].includes(r.status)
  );

  if (activeRequest) {
    return {
      isEligible: false,
      reason: `يوجد طلب استرداد قيد الإجراء حالياً لهذا الطلب (رقم: ${activeRequest.refundNo})`,
      maxRefundable,
      totalPaid: order.amount,
      alreadyRefunded,
    };
  }

  return {
    isEligible: true,
    maxRefundable,
    totalPaid: order.amount,
    alreadyRefunded,
    order: {
      id: order.id,
      orderNo: order.orderNo,
      title: order.title,
      amount: order.amount,
      targetType: order.targetType,
      status: order.status,
    },
  };
}

/**
 * تقديم طلب استرداد جديد من الطالب
 */
export async function submitRefundRequest(
  studentId: string,
  data: {
    orderId: string;
    amountRequested: number;
    reason: string;
    notes?: string;
    attachments?: unknown[];
    bankName?: string;
    iban?: string;
    accountHolderName?: string;
  }
) {
  return await prisma.$transaction(async (tx) => {
    const eligibility = await checkRefundEligibility(data.orderId, studentId, tx);
    if (!eligibility.isEligible) {
      throw badRequest(eligibility.reason || "الطلب غير مؤهل للاسترداد");
    }

    const requested = Math.round(data.amountRequested * 100) / 100;
    if (requested <= 0 || requested > eligibility.maxRefundable) {
      throw badRequest(
        `المبلغ المطلوب (${requested} ريال) يتجاوز الحد الأقصى القابل للاسترداد (${eligibility.maxRefundable} ريال)`
      );
    }

    // تشفير بيانات الحساب البنكي للطالب وحفظها مقنعة
    let bankDetails = null;
    if (data.iban) {
      const cleanIban = data.iban.replace(/\s+/g, "").toUpperCase();
      bankDetails = {
        bankName: data.bankName || "البنك المحلي",
        accountHolderName: data.accountHolderName || "",
        ibanEncrypted: encryptBankDetail(cleanIban),
        ibanMasked: maskIban(cleanIban),
      };
    }

    const count = await tx.refundRequest.count();
    const refundNo = `RFD-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

    const refund = await tx.refundRequest.create({
      data: {
        refundNo,
        orderId: data.orderId,
        studentId,
        amountRequested: requested,
        currency: "SAR",
        reason: data.reason.trim(),
        notes: data.notes?.trim() || null,
        attachments: (data.attachments as Prisma.InputJsonValue) || undefined,
        status: "PENDING",
        bankDetails: bankDetails as Prisma.InputJsonValue,
      },
      include: {
        order: { select: { id: true, orderNo: true, title: true, amount: true } },
      },
    });

    return refund;
  }, { maxWait: 15000, timeout: 30000 });
}

/**
 * مراجعة طلب الاسترداد من قبل الإدارة المالية
 */
export async function reviewRefundRequest(
  refundId: string,
  reviewerId: string,
  data: {
    decision: "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" | "NEEDS_INFORMATION";
    amountApproved?: number;
    adminNotes?: string;
    rejectionReason?: string;
  }
) {
  return await prisma.$transaction(async (tx) => {
    const refund = await tx.refundRequest.findUnique({
      where: { id: refundId },
      include: { order: true },
    });

    if (!refund) throw notFound("طلب الاسترداد غير موجود");

    const validStatuses: RefundStatus[] = ["PENDING", "UNDER_REVIEW", "NEEDS_INFORMATION"];
    if (!validStatuses.includes(refund.status)) {
      throw badRequest(`لا يمكن مراجعة طلب في حالة ${refund.status}`);
    }

    if (data.decision === "REJECTED") {
      if (!data.rejectionReason || data.rejectionReason.trim().length < 3) {
        throw badRequest("سبب الرفض إلزامي ويجب ألا يقل عن 3 أحرف");
      }
      return await tx.refundRequest.update({
        where: { id: refund.id },
        data: {
          status: "REJECTED",
          reviewerId,
          adminNotes: data.adminNotes?.trim() || null,
          rejectionReason: data.rejectionReason.trim(),
        },
      });
    }

    if (data.decision === "NEEDS_INFORMATION") {
      return await tx.refundRequest.update({
        where: { id: refund.id },
        data: {
          status: "NEEDS_INFORMATION",
          reviewerId,
          adminNotes: data.adminNotes?.trim() || "يرجى تزويد الإدارة بمعلومات إضافية",
        },
      });
    }

    // الاعتماد (كلي أو جزئي)
    const approvedAmount =
      data.decision === "PARTIALLY_APPROVED"
        ? Math.round((data.amountApproved || 0) * 100) / 100
        : refund.amountRequested;

    if (approvedAmount <= 0 || approvedAmount > refund.amountRequested) {
      throw badRequest(`المبلغ المعتمد (${approvedAmount}) غير صالح مقارنة بالمبلغ المطلوب`);
    }

    // قيد محاسبي مزدوج: تحويل المبلغ المعتمد من أمانات الطلاب إلى مستحقات الاسترداد
    const journalEntry = await recordJournalEntry(
      {
        type: "REFUND_APPROVE",
        narrativeAr: `اعتماد استرداد طلب ${refund.order.orderNo} بمبلغ ${approvedAmount} ريال`,
        narrativeEn: `Approval of refund request ${refund.refundNo}`,
        referenceType: "REFUND",
        referenceId: refund.id,
        createdById: reviewerId,
        currency: refund.currency,
        lines: [
          { accountCode: "2010", entryType: "DEBIT", amount: approvedAmount, userId: refund.studentId },
          { accountCode: "2030", entryType: "CREDIT", amount: approvedAmount, userId: refund.studentId },
        ],
      },
      tx
    );

    const updated = await tx.refundRequest.update({
      where: { id: refund.id },
      data: {
        status: data.decision === "PARTIALLY_APPROVED" ? "PARTIALLY_APPROVED" : "APPROVED",
        amountApproved: approvedAmount,
        reviewerId,
        adminNotes: data.adminNotes?.trim() || null,
        journalEntryId: journalEntry.id,
      },
      include: { order: true },
    });

    return updated;
  }, { maxWait: 15000, timeout: 30000 });
}

/**
 * تنفيذ التحويل البنكي الفعلي للاسترداد ورفع إشعار التحويل البنكي
 * ⚠️ سحب الصلاحية الأكاديمية يتم حصرياً وقطعياً في هذه النقطة بعد نجاح التحويل البنكي
 */
export async function executeRefundTransfer(
  refundId: string,
  executedById: string,
  data: {
    transferProofUrl: string;
    transferReferenceNo: string;
    transferredAt?: Date;
    adminNotes?: string;
  }
) {
  return await prisma.$transaction(async (tx) => {
    const refund = await tx.refundRequest.findUnique({
      where: { id: refundId },
      include: { order: true },
    });

    if (!refund) throw notFound("طلب الاسترداد غير موجود");

    if (!["APPROVED", "PARTIALLY_APPROVED", "PROCESSING"].includes(refund.status)) {
      throw badRequest(`لا يمكن تنفيذ تحويل مالي لطلب في حالة ${refund.status}`);
    }

    if (!refund.amountApproved || refund.amountApproved <= 0) {
      throw badRequest("لا يوجد مبلغ معتمد للتنفيذ في هذا الطلب");
    }

    if (!data.transferProofUrl || !data.transferReferenceNo) {
      throw badRequest("إشعار التحويل البنكي والرقم المرجعي إلزاميان لإتمام التحويل");
    }

    // قيد الصرف البنكي المزدوج: خصم من حساب البنك التشغيلي وإقفال مستحقات الاسترداد
    await recordJournalEntry(
      {
        type: "REFUND_PAYOUT",
        narrativeAr: `تنفيذ تحويل استرداد بنكي للطلب ${refund.order.orderNo} - حوالة رقم ${data.transferReferenceNo}`,
        narrativeEn: `Execution of bank payout for refund ${refund.refundNo}`,
        referenceType: "REFUND",
        referenceId: refund.id,
        createdById: executedById,
        currency: refund.currency,
        lines: [
          { accountCode: "2030", entryType: "DEBIT", amount: refund.amountApproved, userId: refund.studentId },
          { accountCode: "1010", entryType: "CREDIT", amount: refund.amountApproved, userId: refund.studentId },
        ],
      },
      tx
    );

    const finalStatus: RefundStatus =
      refund.status === "PARTIALLY_APPROVED" ? "PARTIALLY_REFUNDED" : "REFUNDED";

    const updated = await tx.refundRequest.update({
      where: { id: refund.id },
      data: {
        status: finalStatus,
        executedById,
        transferProofUrl: data.transferProofUrl,
        transferReferenceNo: data.transferReferenceNo,
        transferredAt: data.transferredAt || new Date(),
        adminNotes: data.adminNotes?.trim() || refund.adminNotes,
      },
    });

    // سحب الصلاحية الأكاديمية للطالب الآن فقط بعد تأكيد التحويل المالي
    await revokeAccess(refund.orderId, finalStatus, tx);

    return updated;
  }, { maxWait: 15000, timeout: 30000 });
}

/**
 * سحب الصلاحية الأكاديمية عند تأكيد التحويل المالي المسترد
 */
async function revokeAccess(orderId: string, refundType: RefundStatus, tx: Prisma.TransactionClient) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
  });
  if (!order) return;

  if (order.targetType === "OFFERING" && order.targetId) {
    // إلغاء تسجيل الطالب في الدورة
    await tx.enrollment.deleteMany({
      where: {
        userId: order.studentId,
        offeringId: order.targetId,
      },
    });
  }

  // إذا كان الاسترداد كاملاً، نحدث حالة الطلب إلى CANCELLED
  if (refundType === "REFUNDED") {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
  }
}
