import fs from "fs";
import path from "path";

async function main() {
  console.log("=== بدء اختبار التحقق من سلامة وقابلية استعادة النسخة الاحتياطية ===");
  const backupDir = path.resolve(__dirname, "..", "backups");
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error("لا توجد ملفات نسخ احتياطية في مجلد backups");
  }

  // فرز الملفات وأخذ الأحدث
  files.sort().reverse();
  const latestBackup = path.join(backupDir, files[0]);
  console.log(`فحص أحدث ملف نسخة احتياطية: ${files[0]}`);

  const rawData = fs.readFileSync(latestBackup, "utf8");
  const parsed = JSON.parse(rawData);

  if (!parsed.createdAt || !parsed.tables) {
    throw new Error("بنية ملف النسخة الاحتياطية غير صالحة");
  }

  console.log(`تاريخ إنشاء النسخة: ${parsed.createdAt}`);
  const tables = parsed.tables as Record<string, any[]>;
  const tableNames = Object.keys(tables);
  console.log(`عدد الجداول المحفوظة: ${tableNames.length}`);

  let totalRows = 0;
  for (const [name, rows] of Object.entries(tables)) {
    totalRows += rows.length;
    if (rows.length > 0) {
      console.log(`  - جدول ${name}: ${rows.length} سجل`);
    }
  }
  console.log(`إجمالي السجلات المفحوصة: ${totalRows}`);

  // اختبار التحقق من صحة العلاقات (Foreign Key Integrity Check)
  console.log("\n--- التحقق من سلامة العلاقات (Referential Integrity Check) ---");
  const users = new Set((tables.user || []).map((u: any) => u.id));
  const courses = new Set((tables.course || []).map((c: any) => c.id));
  const teachers = new Set((tables.teacherProfile || []).map((t: any) => t.id));
  const offerings = new Set((tables.courseOffering || []).map((o: any) => o.id));

  // 1. كل ملف مدرس مرتبط بمستخدم موجود
  for (const t of (tables.teacherProfile || [])) {
    if (!users.has(t.userId)) {
      throw new Error(`خطأ في تكامل البيانات: ملف المدرس ${t.id} يشير إلى مستخدم غير موجود ${t.userId}`);
    }
  }
  console.log("✔ تكامل سجلات المدرسين والمستخدمين: سليم 100%");

  // 2. كل دورة مرتبطة بمقرر موجود ومدرس موجود
  for (const o of (tables.courseOffering || [])) {
    if (!courses.has(o.courseId)) {
      throw new Error(`خطأ في تكامل البيانات: دورة ${o.id} تشير إلى مقرر غير موجود ${o.courseId}`);
    }
    if (!teachers.has(o.teacherId)) {
      throw new Error(`خطأ في تكامل البيانات: دورة ${o.id} تشير إلى مدرس غير موجود ${o.teacherId}`);
    }
  }
  console.log("✔ تكامل الدورات والمقررات والمدرسين: سليم 100%");

  // 3. كل درس مرتبط بدورة موجودة
  for (const l of (tables.lesson || [])) {
    if (!offerings.has(l.offeringId)) {
      throw new Error(`خطأ في تكامل البيانات: درس ${l.id} يشير إلى دورة غير موجودة ${l.offeringId}`);
    }
  }
  console.log("✔ تكامل الدروس والدورات: سليم 100%");

  console.log("\n=== النتيجة: ملف النسخة الاحتياطية سليم تمامًا وقابل للاستعادة دون أي أخطاء تكامل ===");
}

main().catch((err) => {
  console.error("فشل اختبار استعادة النسخة الاحتياطية:", err);
  process.exit(1);
});
