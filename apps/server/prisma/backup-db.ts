// نسخة احتياطية منطقية كاملة من قاعدة البيانات إلى JSON (قراءة فقط، لا تعدّل شيئًا).
// التشغيل: npx tsx prisma/backup-db.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const MODELS = [
  "user",
  "teacherProfile",
  "university",
  "college",
  "major",
  "course",
  "courseOffering",
  "lesson",
  "enrollment",
  "service",
  "explainRequest",
  "offer",
  "order",
  "payment",
  "chatRoom",
  "chatParticipant",
  "message",
  "chatReport",
  "block",
  "ad",
  "notification",
  "liveSession",
  "liveBooking",
  "setting",
  "review",
  "favorite",
] as const;

async function main() {
  const data: Record<string, unknown[]> = {};
  for (const name of MODELS) {
    // Prisma delegate ديناميكي
    const rows = await (prisma as unknown as Record<string, { findMany: (args?: object) => Promise<unknown[]> }>)[
      name
    ].findMany();
    data[name] = rows;
  }

  const outDir = path.resolve(__dirname, "..", "backups");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `db-backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), tables: data }, null, 2), "utf8");

  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  console.log(`[backup] ${file}`);
  console.log("[backup] الصفوف:", JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error("[backup] فشل:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
