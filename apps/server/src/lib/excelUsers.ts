import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { prisma } from "./prisma";

const EXPORT_DIR = path.join(process.cwd(), "uploads", "exports");
const EXPORT_FILE = path.join(EXPORT_DIR, "users.xlsx");

// قفل لتفادي تضارب الكتابة المتزامنة على الملف
let isWriting = false;
let writeQueue: Array<() => void> = [];

function ensureDir() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    return date.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

async function acquireLock(): Promise<void> {
  if (!isWriting) {
    isWriting = true;
    return;
  }
  return new Promise((resolve) => {
    writeQueue.push(() => {
      isWriting = true;
      resolve();
    });
  });
}

function releaseLock(): void {
  isWriting = false;
  const next = writeQueue.shift();
  if (next) {
    next();
  }
}

export async function generateUsersExcel(): Promise<string> {
  await acquireLock();
  try {
    ensureDir();

    // المصدر الرئيسي هو قاعدة البيانات دائمًا
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        university: { select: { name: true } },
        major: { select: { name: true } },
        teacherProfile: { select: { status: true, universitiesText: true, specialties: true } },
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "أكاديمية سراج التعليمية";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("المستخدمون", {
      views: [{ rightToLeft: true }],
    });

    sheet.columns = [
      { header: "رقم المستخدم الداخلي", key: "id", width: 28 },
      { header: "الاسم الكامل", key: "fullName", width: 28 },
      { header: "اسم المستخدم", key: "username", width: 18 },
      { header: "البريد الإلكتروني", key: "email", width: 32 },
      { header: "رقم الهاتف", key: "whatsapp", width: 18 },
      { header: "نوع الحساب", key: "role", width: 14 },
      { header: "الجامعة", key: "university", width: 28 },
      { header: "التخصص", key: "major", width: 26 },
      { header: "المستوى الدراسي", key: "level", width: 18 },
      { header: "تاريخ التسجيل", key: "createdAt", width: 16 },
      { header: "حالة الحساب", key: "status", width: 16 },
      { header: "حالة اعتماد المدرس", key: "teacherStatus", width: 20 },
    ];

    for (const u of users) {
      // استخراج الجامعة والتخصص بحسب نوع الحساب إن كان طالبًا أو مدرسًا
      const uniName = u.university?.name || u.teacherProfile?.universitiesText || "";
      const majorName = u.major?.name || (u.teacherProfile?.specialties || []).join("، ") || "";

      sheet.addRow({
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        email: u.email,
        whatsapp: u.whatsapp || "",
        role:
          u.role === "STUDENT"
            ? "طالب"
            : u.role === "TEACHER"
            ? "مدرس"
            : u.role === "ADMIN"
            ? "مدير"
            : u.role,
        university: uniName,
        major: majorName,
        level: u.level || "",
        createdAt: formatDate(u.createdAt),
        status:
          u.status === "ACTIVE"
            ? "نشط"
            : u.status === "PENDING"
            ? "معلق"
            : u.status === "SUSPENDED"
            ? "موقوف"
            : u.status,
        teacherStatus: u.teacherProfile?.status
          ? u.teacherProfile.status === "APPROVED"
            ? "معتمد"
            : u.teacherProfile.status === "PENDING"
            ? "قيد المراجعة"
            : u.teacherProfile.status === "REJECTED"
            ? "مرفوض"
            : u.teacherProfile.status === "SUSPENDED"
            ? "موقوف"
            : u.teacherProfile.status
          : "",
      });
    }

    // تنسيق شريط العناوين
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2937" }, // لون داكن مناسب للهوية
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 28;

    // كتابة الملف بطريقة آمنة
    await workbook.xlsx.writeFile(EXPORT_FILE);
    return EXPORT_FILE;
  } finally {
    releaseLock();
  }
}

export function getUsersExcelPath(): string {
  ensureDir();
  return EXPORT_FILE;
}

// دالة لتحديث السجل في الخلفية دون تعطيل العمليات الأساسية
export function triggerUsersExcelSync(): void {
  generateUsersExcel().catch((err) => {
    console.error("[EXCEL] خطأ أثناء تحديث سجل المستخدمين التلقائي:", err?.message || err);
  });
}
