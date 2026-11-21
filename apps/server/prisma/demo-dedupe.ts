/**
 * فحص/تنظيف تكرار أسماء المقررات التجريبية — آمن افتراضيًا.
 *
 * افتراضيًا: Dry-run — يعرض التكرار فقط ولا يغيّر شيئًا.
 *   npx tsx prisma/demo-dedupe.ts
 *
 * للتطبيق على بيئة تطوير/اختبار فقط (لا يحذف أي سجل، بل يخفي المقرر المكرر
 * الذي لا يملك دورات ولا اشتراكات):
 *   npx tsx prisma/demo-dedupe.ts --apply
 */
import dotenv from "dotenv";
dotenv.config();
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

function normalize(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

async function main() {
  const courses = await prisma.course.findMany({
    select: {
      id: true,
      title: true,
      code: true,
      isVisible: true,
      createdAt: true,
      universityId: true,
      _count: { select: { offerings: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof courses>();
  for (const course of courses) {
    const key = normalize(course.title);
    const list = groups.get(key) ?? [];
    list.push(course);
    groups.set(key, list);
  }

  const duplicateGroups = [...groups.entries()].filter(([, list]) => list.length > 1);
  let hidden = 0;

  console.log(`إجمالي المقررات: ${courses.length}`);
  console.log(`مجموعات الأسماء المكررة: ${duplicateGroups.length}`);
  console.log(APPLY ? "الوضع: تطبيق (إخفاء المكرر الفارغ فقط)" : "الوضع: فحص فقط (dry-run)");

  for (const [title, list] of duplicateGroups) {
    console.log(`\n«${title}» — ${list.length} نسخة`);
    for (let i = 1; i < list.length; i++) {
      const candidate = list[i];
      const enrollments = await prisma.enrollment.count({ where: { offering: { courseId: candidate.id } } });
      const safe = candidate._count.offerings === 0 && enrollments === 0;
      console.log(
        `  - ${candidate.id} | code=${candidate.code ?? "—"} | university=${candidate.universityId} | ` +
          `offerings=${candidate._count.offerings} | enrollments=${enrollments} | ${safe ? "مرشح آمن للإخفاء" : "محمي (له بيانات)"}`,
      );
      if (APPLY && safe && candidate.isVisible) {
        await prisma.course.update({ where: { id: candidate.id }, data: { isVisible: false } });
        hidden++;
      }
    }
  }

  console.log(`\n${APPLY ? `أُخفي ${hidden} مقررًا مكررًا فارغًا.` : "لم يُغيَّر أي سجل. أعد التشغيل مع --apply للتطبيق."}`);
}

main()
  .catch((e) => {
    console.error("فشل فحص التكرار:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
