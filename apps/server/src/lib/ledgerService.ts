import { prisma } from "./prisma";
import type { Prisma, JournalEntryType, JournalEntryStatus, DebitCredit } from "@prisma/client";

export const CHART_OF_ACCOUNTS = [
  { code: "1010", nameAr: "حساب البنك التشغيلي للمنصة", nameEn: "Platform Operating Bank Account", type: "ASSET" as const },
  { code: "1020", nameAr: "ذمم الطلاب المدينة", nameEn: "Student Receivables", type: "ASSET" as const },
  { code: "2010", nameAr: "ودائع وأمانات الطلاب", nameEn: "Student Funds Liability", type: "LIABILITY" as const },
  { code: "2020", nameAr: "مستحقات المدرسين المتاحة للسحب", nameEn: "Teacher Payable - Available", type: "LIABILITY" as const },
  { code: "2021", nameAr: "مستحقات المدرسين المحجوزة قيد السحب", nameEn: "Teacher Payable - Reserved", type: "LIABILITY" as const },
  { code: "2030", nameAr: "مستحقات الاسترداد قيد التحويل", nameEn: "Refund Clearing Payable", type: "LIABILITY" as const },
  { code: "4010", nameAr: "إيرادات عمولات المنصة", nameEn: "Platform Commission Revenue", type: "REVENUE" as const },
  { code: "5010", nameAr: "رسوم الحوالات البنكية", nameEn: "Bank Transfer Fees Expense", type: "EXPENSE" as const },
  { code: "5020", nameAr: "تسويات وفروقات مالية", nameEn: "Financial Adjustments", type: "EXPENSE" as const },
];

/**
 * التأكد من وجود دليل الحسابات المعتمد في قاعدة البيانات
 */
export async function ensureFinancialAccountsExist(client: Prisma.TransactionClient = prisma) {
  for (const acc of CHART_OF_ACCOUNTS) {
    await client.financialAccount.upsert({
      where: { code: acc.code },
      update: { nameAr: acc.nameAr, nameEn: acc.nameEn, type: acc.type },
      create: {
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        type: acc.type,
      },
    });
  }
}

export interface JournalLineInput {
  accountCode: string; // كود الحساب (مثل 1010)
  entryType: DebitCredit; // DEBIT أو CREDIT
  amount: number;
  userId?: string | null;
  notes?: string | null;
}

export interface RecordJournalInput {
  type: JournalEntryType;
  narrativeAr: string;
  narrativeEn?: string;
  referenceType?: "ORDER" | "PAYMENT" | "REFUND" | "WITHDRAWAL" | "ADJUSTMENT" | string;
  referenceId?: string;
  createdById?: string;
  currency?: string;
  lines: JournalLineInput[];
}

/**
 * تسجيل قيد يومية مزدوج (Double-Entry Journal Entry) مع فحص التوازن الصارم: مجموع المدين = مجموع الدائن
 */
export async function recordJournalEntry(
  input: RecordJournalInput,
  client: Prisma.TransactionClient = prisma
) {
  if (!input.lines || input.lines.length < 2) {
    throw new Error("قيد اليومية يجب أن يتكون من سطرين على الأقل (قيد مزدوج)");
  }

  const currency = input.currency || "SAR";
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of input.lines) {
    if (typeof line.amount !== "number" || isNaN(line.amount) || line.amount <= 0) {
      throw new Error(`مبلغ غير صالح في سطر الحساب ${line.accountCode}: ${line.amount}`);
    }
    const rounded = Math.round(line.amount * 100) / 100;
    if (line.entryType === "DEBIT") {
      totalDebit += rounded;
    } else if (line.entryType === "CREDIT") {
      totalCredit += rounded;
    } else {
      throw new Error(`نوع قيد غير صالح: ${line.entryType}`);
    }
  }

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;

  // فحص التوازن المحاسبي الصارم
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `قيد اليومية غير متوازن محاسبياً! إجمالي المدين (${totalDebit}) لا يساوي إجمالي الدائن (${totalCredit})`
    );
  }

  // التأكد من وجود الحسابات وجلب معرفاتها
  await ensureFinancialAccountsExist(client);
  const accountCodes = [...new Set(input.lines.map((l) => l.accountCode))];
  const accounts = await client.financialAccount.findMany({
    where: { code: { in: accountCodes } },
  });
  const accountMap = new Map(accounts.map((a) => [a.code, a.id]));

  for (const code of accountCodes) {
    if (!accountMap.has(code)) {
      throw new Error(`الحساب المالي بالكود ${code} غير مسجل في شجرة الحسابات`);
    }
  }

  // توليد رقم قيد فريد وتسلسلي
  const entryCount = await client.financialJournalEntry.count();
  const entryNo = `JRN-${new Date().getFullYear()}-${String(entryCount + 1).padStart(6, "0")}`;

  const journalEntry = await client.financialJournalEntry.create({
    data: {
      entryNo,
      type: input.type,
      status: "POSTED",
      currency,
      totalAmount: totalDebit,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      narrativeAr: input.narrativeAr,
      narrativeEn: input.narrativeEn,
      createdById: input.createdById,
      lines: {
        create: input.lines.map((line) => ({
          accountId: accountMap.get(line.accountCode)!,
          entryType: line.entryType,
          amount: Math.round(line.amount * 100) / 100,
          currency,
          userId: line.userId || null,
          notes: line.notes || null,
        })),
      },
    },
    include: {
      lines: {
        include: { account: true },
      },
    },
  });

  return journalEntry;
}

/**
 * إنشاء قيد عكسي لتصحيح أو إلغاء قيد يومية سابق (Reversal Entry)
 */
export async function reverseJournalEntry(
  journalEntryId: string,
  reasonAr: string,
  actorId?: string,
  client: Prisma.TransactionClient = prisma
) {
  const original = await client.financialJournalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: { include: { account: true } } },
  });

  if (!original) {
    throw new Error("قيد اليومية المراد عكسه غير موجود");
  }

  if (original.status === "REVERSED") {
    throw new Error("هذا القيد تم عكسه مسبقًا ولا يمكن عكسه مرة أخرى");
  }

  // تحديث حالة القيد الأصلي إلى REVERSED
  await client.financialJournalEntry.update({
    where: { id: original.id },
    data: { status: "REVERSED" },
  });

  // إنشاء القيد العكسي (عكس أطراف المدين والدائن)
  const reversingLines: JournalLineInput[] = original.lines.map((l) => ({
    accountCode: l.account.code,
    entryType: l.entryType === "DEBIT" ? "CREDIT" : "DEBIT",
    amount: l.amount,
    userId: l.userId,
    notes: `قيد عكسي للقيد ${original.entryNo}: ${reasonAr}`,
  }));

  return await recordJournalEntry(
    {
      type: "ADJUSTMENT",
      narrativeAr: `قيد عكسي للقيد ${original.entryNo} - السبب: ${reasonAr}`,
      narrativeEn: `Reversal entry for ${original.entryNo}`,
      referenceType: "ADJUSTMENT",
      referenceId: original.id,
      createdById: actorId,
      currency: original.currency,
      lines: reversingLines,
    },
    client
  );
}
