// ============================================================
// إزالة البيانات التجريبية التي أنشأها seed-demo.ts فقط.
// تعتمد على مانيفست المعرّفات + نطاق البريد @demo.siraj.local.
// لا تحذف أي سجل حقيقي، وترفض العمل خارج بيئة محلية غير إنتاجية.
// التشغيل: npm run seed:demo:clean
// ============================================================
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const DEMO_DOMAIN = "demo.siraj.local";
const MANIFEST_PATH = path.resolve(__dirname, "demo-seed.manifest.json");
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.cwd(), process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "..", "uploads");

function assertSafeEnvironment(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL غير معرّف");
  const url = new URL(raw);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (process.env.NODE_ENV === "production") throw new Error("مرفوض: NODE_ENV=production");
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`مرفوض: قاعدة البيانات غير محلية (${url.hostname})`);
  }
  if (/prod|live|main/i.test(dbName)) throw new Error(`مرفوض: اسم قاعدة البيانات (${dbName})`);
  console.log(`[demo-clean] قاعدة البيانات: ${dbName} — مقبولة`);
}

interface Manifest {
  generatedAt?: string;
  userIds?: string[];
  courseIds?: string[];
  collegeIds?: string[];
  majorIds?: string[];
  offeringIds?: string[];
  serviceIds?: string[];
  adIds?: string[];
  orderIds?: string[];
  roomIds?: string[];
  files?: string[];
}

async function main() {
  assertSafeEnvironment();
  const manifest: Manifest = fs.existsSync(MANIFEST_PATH)
    ? (JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest)
    : {};

  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = [...new Set([...(manifest.userIds ?? []), ...demoUsers.map((u) => u.id)])];

  // المحادثات أولًا (الغرف لا تُحذف تلقائيًا بحذف المستخدم لأن المالك SetNull)
  const rooms = await prisma.chatRoom.deleteMany({
    where: {
      OR: [
        ...(manifest.roomIds?.length ? [{ id: { in: manifest.roomIds } }] : []),
        { participants: { some: { userId: { in: userIds } } } },
        { ownerId: { in: userIds } },
      ],
    },
  });

  const orders = await prisma.order.deleteMany({ where: { id: { in: manifest.orderIds ?? [] } } });

  const ads = await prisma.ad.deleteMany({ where: { id: { in: manifest.adIds ?? [] } } });
  const services = await prisma.service.deleteMany({ where: { slug: { startsWith: "demo-" } } });

  // المستخدمون التجريبيون: يحذفون ملفاتهم ودوراتهم/عروضهم/طلباتهم/مدفوعاتهم بالتتابع
  const users = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  const paymentsLeft = await prisma.payment.deleteMany({ where: { order: { studentId: { in: userIds } } } });

  // المقررات التجريبية (code يبدأ بـDEMO-) وما تحتها
  const courses = await prisma.course.deleteMany({ where: { code: { startsWith: "DEMO-" } } });
  const offerings = await prisma.courseOffering.deleteMany({ where: { id: { in: manifest.offeringIds ?? [] } } });

  // التخصصات والكليات التي أنشأها السكربت فقط
  const majors = await prisma.major.deleteMany({ where: { id: { in: manifest.majorIds ?? [] } } });
  const colleges = await prisma.college.deleteMany({ where: { id: { in: manifest.collegeIds ?? [] } } });

  // حذف الملفات التي أنشأها السكربت (أسماء بلا مسارات)
  const files = new Set<string>(manifest.files ?? []);
  // احتياط: ملفات بادئتها من السكربت أو تخص حسابات التجربة (لو فُقد المانيفست)
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const name of fs.readdirSync(UPLOAD_DIR)) {
      if (/^seed-(cover|logo)-/.test(name) || userIds.some((id) => name.startsWith(`${id}-demo-`))) {
        files.add(name);
      }
    }
  }
  let filesRemoved = 0;
  for (const name of files) {
    if (!name || name.includes("/") || name.includes("\\") || name.startsWith(".")) continue;
    const abs = path.join(UPLOAD_DIR, name);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
      filesRemoved++;
    }
  }

  if (fs.existsSync(MANIFEST_PATH)) fs.unlinkSync(MANIFEST_PATH);

  console.log("[demo-clean] تمت الإزالة:");
  console.log(
    JSON.stringify(
      {
        users: users.count,
        orders: orders.count,
        payments: paymentsLeft.count,
        courses: courses.count,
        offerings: offerings.count,
        majors: majors.count,
        colleges: colleges.count,
        services: services.count,
        ads: ads.count,
        rooms: rooms.count,
        files: filesRemoved,
      },
      null,
      2,
    ),
  );
  console.log("[demo-clean] لم تُحذف أي بيانات حقيقية — فقط سجلات التجربة والملفات المسجلة في المانيفست.");
}

main()
  .catch((e) => {
    console.error("[demo-clean] فشل:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
