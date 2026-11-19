// ============================================================
// بيانات تجريبية مترابطة لأكاديمية سراج (بيئة تطوير فقط).
//
// - بيانات اصطناعية بالكامل، حساباتها على نطاق @demo.siraj.local وكلمة مرور واحدة.
// - قابل لإعادة التشغيل: لا يكرر السجلات ولا يعيد تعيين كلمات مرور موجودة.
// - لا يحذف بيانات ولا يكتب فوق سجلات حقيقية (كل إنشاء يسبقه بحث عن مفتاح طبيعي).
// - يرفض العمل على الإنتاج أو على قاعدة غير محلية.
// - يكتب prisma/demo-seed.manifest.json لاستخدامه في التنظيف الآمن.
//
// التشغيل: npm run seed:demo
// التنظيف: npm run seed:demo:clean
// ============================================================
import { Prisma, PrismaClient, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";

const prisma = new PrismaClient();

const DEMO_DOMAIN = "demo.siraj.local";
const DEMO_PASSWORD = "Demo@2026!";
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.cwd(), process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "..", "uploads");
const MANIFEST_PATH = path.resolve(__dirname, "demo-seed.manifest.json");

// ---------- حماية: تطوير محلي فقط ----------
function assertSafeEnvironment(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL غير معرّف — لا يمكن المتابعة");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL غير صالح");
  }
  const host = url.hostname;
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (process.env.NODE_ENV === "production") {
    throw new Error("مرفوض: NODE_ENV=production — السكربت للتطوير المحلي فقط");
  }
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(`مرفوض: قاعدة البيانات غير محلية (${host})`);
  }
  if (/prod|live|main/i.test(dbName)) {
    throw new Error(`مرفوض: اسم قاعدة البيانات يشير إلى بيئة حقيقية (${dbName})`);
  }
  console.log(`[demo-seed] قاعدة البيانات: ${dbName} على ${host} — مقبولة للتجريب`);
}

// ---------- توليد صور PNG بسيطة (بدون مكتبات خارجية) ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** صورة PNG متدرجة لونيًا */
function gradientPng(width: number, height: number, from: [number, number, number], to: [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      for (let c = 0; c < 3; c++) {
        raw[row + 1 + x * 3 + c] = Math.round(from[c] + (to[c] - from[c]) * t);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const DEMO_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8",
);

// ---------- أدوات ----------
interface Manifest {
  generatedAt: string;
  userIds: string[];
  courseIds: string[];
  collegeIds: string[];
  majorIds: string[];
  offeringIds: string[];
  serviceIds: string[];
  adIds: string[];
  orderIds: string[];
  roomIds: string[];
  files: string[];
}

const manifest: Manifest = {
  generatedAt: new Date().toISOString(),
  userIds: [],
  courseIds: [],
  collegeIds: [],
  majorIds: [],
  offeringIds: [],
  serviceIds: [],
  adIds: [],
  orderIds: [],
  roomIds: [],
  files: [],
};

// يُحفظ المانيفست بعد كل إضافة حتى لا تضيع المعرّفات إن توقف السكربت في المنتصف
let previousManifest: Partial<Manifest> = {};
function saveManifest(): void {
  const merged: Manifest = {
    generatedAt: new Date().toISOString(),
    userIds: [...new Set([...(previousManifest.userIds ?? []), ...manifest.userIds])],
    courseIds: [...new Set([...(previousManifest.courseIds ?? []), ...manifest.courseIds])],
    collegeIds: [...new Set([...(previousManifest.collegeIds ?? []), ...manifest.collegeIds])],
    majorIds: [...new Set([...(previousManifest.majorIds ?? []), ...manifest.majorIds])],
    offeringIds: [...new Set([...(previousManifest.offeringIds ?? []), ...manifest.offeringIds])],
    serviceIds: [...new Set([...(previousManifest.serviceIds ?? []), ...manifest.serviceIds])],
    adIds: [...new Set([...(previousManifest.adIds ?? []), ...manifest.adIds])],
    orderIds: [...new Set([...(previousManifest.orderIds ?? []), ...manifest.orderIds])],
    roomIds: [...new Set([...(previousManifest.roomIds ?? []), ...manifest.roomIds])],
    files: [...new Set([...(previousManifest.files ?? []), ...manifest.files])],
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(merged, null, 2), "utf8");
}

function track(list: keyof Pick<Manifest, "userIds" | "courseIds" | "collegeIds" | "majorIds" | "offeringIds" | "serviceIds" | "adIds" | "orderIds" | "roomIds" | "files">, id: string) {
  if (!manifest[list].includes(id)) manifest[list].push(id);
  saveManifest();
}

function writeFileSafe(name: string, data: Buffer): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), data);
  track("files", name);
  return `/uploads/${name}`;
}

function daysAgo(days: number, hours = 0): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000);
}

async function ensureUser(input: {
  username: string;
  fullName: string;
  email?: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  whatsapp?: string;
  universityId?: string | null;
  majorId?: string | null;
}): Promise<User> {
  const email = input.email ?? `${input.username}@${DEMO_DOMAIN}`;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing; // لا نلمس كلمة مرور حساب موجود
  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      username: input.username,
      email,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: input.role,
      status: "ACTIVE",
      emailVerified: true,
      whatsapp: input.whatsapp,
      universityId: input.universityId ?? undefined,
      majorId: input.majorId ?? undefined,
    },
  });
  track("userIds", user.id);
  return user;
}

async function ensureUniversity(name: string, city: string, order: number, logoName?: string): Promise<string> {
  const slug = name
    .trim()
    .replace(/[\s/\\]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  const existing = await prisma.university.findFirst({ where: { OR: [{ slug }, { name }] } });
  if (existing) {
    // نضيف شعارًا فقط إن لم يكن هناك شعار (لا نلمس بيانات موجودة)
    if (logoName && !existing.logoUrl) {
      const url = writeFileSafe(logoName, gradientPng(256, 256, [13, 42, 63], [183, 148, 74]));
      await prisma.university.update({ where: { id: existing.id }, data: { logoUrl: url } });
    }
    return existing.id;
  }
  const url = logoName ? writeFileSafe(logoName, gradientPng(256, 256, [13, 42, 63], [183, 148, 74])) : null;
  const created = await prisma.university.create({
    data: { name, city, slug, order, logoUrl: url, isVisible: true },
  });
  return created.id;
}

async function ensureCollege(universityId: string, name: string): Promise<string> {
  const existing = await prisma.college.findFirst({ where: { universityId, name } });
  if (existing) return existing.id;
  const created = await prisma.college.create({ data: { universityId, name } });
  track("collegeIds", created.id);
  return created.id;
}

async function ensureMajor(universityId: string, collegeId: string, name: string): Promise<string> {
  const existing = await prisma.major.findFirst({ where: { universityId, name, collegeId } });
  if (existing) return existing.id;
  const created = await prisma.major.create({ data: { universityId, collegeId, name } });
  track("majorIds", created.id);
  return created.id;
}

async function ensureCourse(input: {
  universityId: string;
  collegeId: string;
  majorId: string;
  code: string;
  title: string;
  level: string;
  description: string;
  coverName: string;
  coverColors: [[number, number, number], [number, number, number]];
}): Promise<string> {
  const existing = await prisma.course.findFirst({ where: { code: input.code } });
  if (existing) return existing.id;
  const coverUrl = writeFileSafe(input.coverName, gradientPng(800, 450, ...input.coverColors));
  const created = await prisma.course.create({
    data: {
      universityId: input.universityId,
      collegeId: input.collegeId,
      majorId: input.majorId,
      title: input.title,
      code: input.code,
      level: input.level,
      description: input.description,
      coverUrl,
      isVisible: true,
    },
  });
  track("courseIds", created.id);
  return created.id;
}

async function ensureOffering(input: {
  courseId: string;
  teacherId: string;
  title: string;
  summary: string;
  price: number;
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "HIDDEN" | "REJECTED";
  trialVideoUrl?: string;
  adminNote?: string;
  createdAt?: Date;
}): Promise<string> {
  const existing = await prisma.courseOffering.findFirst({
    where: { courseId: input.courseId, teacherId: input.teacherId, title: input.title },
  });
  if (existing) return existing.id;
  const created = await prisma.courseOffering.create({
    data: {
      courseId: input.courseId,
      teacherId: input.teacherId,
      title: input.title,
      summary: input.summary,
      price: input.price,
      status: input.status,
      accessType: input.price === 0 ? "TRIAL" : "PAID",
      trialVideoUrl: input.trialVideoUrl,
      adminNote: input.adminNote,
      createdAt: input.createdAt,
    },
  });
  track("offeringIds", created.id);
  return created.id;
}

async function ensureLesson(offeringId: string, title: string, videoUrl: string, access: "TRIAL" | "PAID", order: number) {
  const existing = await prisma.lesson.findFirst({ where: { offeringId, title } });
  if (existing) return existing.id;
  const created = await prisma.lesson.create({ data: { offeringId, title, videoUrl, access, order } });
  return created.id;
}

async function ensureOrder(input: {
  orderNo: string;
  studentId: string;
  targetType: "OFFERING" | "SERVICE" | "OFFER" | "CUSTOM";
  targetId?: string;
  amount: number;
  title: string;
  status: "AWAITING_PAYMENT" | "AWAITING_REVIEW" | "REJECTED" | "PAID" | "CANCELLED";
  providerId?: string;
  createdAt?: Date;
  notes?: string;
}): Promise<string> {
  const existing = await prisma.order.findUnique({ where: { orderNo: input.orderNo } });
  if (existing) return existing.id;
  const created = await prisma.order.create({
    data: {
      orderNo: input.orderNo,
      studentId: input.studentId,
      targetType: input.targetType,
      targetId: input.targetId,
      amount: input.amount,
      title: input.title,
      status: input.status,
      providerId: input.providerId,
      notes: input.notes,
      createdAt: input.createdAt,
    },
  });
  track("orderIds", created.id);
  return created.id;
}

async function ensurePayment(input: {
  orderId: string;
  status: "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  receiptUrl?: string | null;
  reviewerId?: string;
  reviewNote?: string;
  paidAt?: Date;
  createdAt?: Date;
}) {
  const existing = await prisma.payment.findFirst({ where: { orderId: input.orderId } });
  if (existing) return existing.id;
  const created = await prisma.payment.create({
    data: {
      orderId: input.orderId,
      method: "TRANSFER",
      receiptUrl: input.receiptUrl ?? null,
      status: input.status,
      reviewerId: input.reviewerId,
      reviewNote: input.reviewNote,
      paidAt: input.paidAt,
      createdAt: input.createdAt,
    },
  });
  return created.id;
}

async function ensureEnrollment(userId: string, offeringId: string) {
  await prisma.enrollment.upsert({
    where: { userId_offeringId: { userId, offeringId } },
    update: {},
    create: { userId, offeringId },
  });
}

async function ensureDirectRoom(a: string, b: string): Promise<string> {
  const rooms = await prisma.chatRoom.findMany({
    where: { type: "DIRECT", participants: { some: { userId: a } } },
    include: { participants: { select: { userId: true } } },
  });
  const found = rooms.find((r) => r.participants.length === 2 && r.participants.some((p) => p.userId === b));
  if (found) return found.id;
  const created = await prisma.chatRoom.create({
    data: {
      type: "DIRECT",
      ownerId: a,
      participants: { create: [{ userId: a }, { userId: b }] },
    },
  });
  track("roomIds", created.id);
  return created.id;
}

async function ensureGroupRoom(ownerId: string, title: string, members: string[]): Promise<string> {
  const existing = await prisma.chatRoom.findFirst({ where: { type: "GROUP", title } });
  if (existing) return existing.id;
  const created = await prisma.chatRoom.create({
    data: {
      type: "GROUP",
      ownerId,
      title,
      participants: {
        create: [...new Set([ownerId, ...members])].map((id) => ({
          userId: id,
          role: id === ownerId ? ("ADMIN" as const) : ("MEMBER" as const),
        })),
      },
    },
  });
  track("roomIds", created.id);
  return created.id;
}

async function ensureMessage(roomId: string, senderId: string, body: string, minutesAgo: number, attachmentUrl?: string) {
  const existing = await prisma.message.findFirst({ where: { roomId, body } });
  if (existing) return existing.id;
  const created = await prisma.message.create({
    data: {
      roomId,
      senderId,
      body,
      attachmentUrl,
      createdAt: new Date(Date.now() - minutesAgo * 60 * 1000),
    },
  });
  return created.id;
}

async function ensureNotification(userId: string, title: string, body: string, type: string, link?: string, minutesAgo = 60) {
  const existing = await prisma.notification.findFirst({ where: { userId, title, type } });
  if (existing) return;
  await prisma.notification.create({
    data: { userId, title, body, type, link, createdAt: new Date(Date.now() - minutesAgo * 60 * 1000) },
  });
}

// ---------- البيانات ----------
async function main() {
  assertSafeEnvironment();
  await prisma.$connect();
  previousManifest = fs.existsSync(MANIFEST_PATH)
    ? (JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Partial<Manifest>)
    : {};

  // 0) إعدادات الدفع: نملأ الحقول الفارغة فقط إن كانت فارغة (لا نلمس إعدادات حقيقية)
  const bankDefaults: Array<{ key: string; value: string }> = [
    { key: "iban", value: "SA0000000000000000000000" },
    { key: "bank_name", value: "بنك تجريبي — البيانات وهمية للعرض" },
  ];
  for (const s of bankDefaults) {
    const current = await prisma.setting.findUnique({ where: { key: s.key } });
    if (current && !current.value.trim()) {
      await prisma.setting.update({ where: { key: s.key }, data: { value: s.value } });
    }
  }

  // 1) الجامعات الخمس + الكليات + التخصصات
  const uniIds = {
    ksu: await ensureUniversity("جامعة الملك سعود", "الرياض", 1, "seed-logo-ksu.png"),
    kau: await ensureUniversity("جامعة الملك عبد العزيز", "جدة", 2, "seed-logo-kau.png"),
    kfupm: await ensureUniversity("جامعة الملك فهد للبترول والمعادن", "الظهران", 3, "seed-logo-kfupm.png"),
    kfu: await ensureUniversity("جامعة الملك فيصل", "الأحساء", 4, "seed-logo-kfu.png"),
    taibah: await ensureUniversity("جامعة طيبة", "المدينة المنورة", 5, "seed-logo-taibah.png"),
  };

  const collegeIds = {
    ksuCs: await ensureCollege(uniIds.ksu, "كلية علوم الحاسب والمعلومات"),
    ksuEng: await ensureCollege(uniIds.ksu, "كلية الهندسة"),
    kauEng: await ensureCollege(uniIds.kau, "كلية الهندسة"),
    kauEcon: await ensureCollege(uniIds.kau, "كلية الاقتصاد والإدارة"),
    kfupmCs: await ensureCollege(uniIds.kfupm, "كلية علوم الحاسب وهندسة البرمجيات"),
    kfupmSci: await ensureCollege(uniIds.kfupm, "كلية العلوم"),
    kfuBus: await ensureCollege(uniIds.kfu, "كلية العلوم الإدارية"),
    kfuSci: await ensureCollege(uniIds.kfu, "كلية العلوم"),
    taibahCs: await ensureCollege(uniIds.taibah, "كلية علوم الحاسب"),
    taibahEng: await ensureCollege(uniIds.taibah, "كلية الهندسة"),
  };

  const majorIds = {
    ksuCs: await ensureMajor(uniIds.ksu, collegeIds.ksuCs, "علوم الحاسب"),
    ksuSe: await ensureMajor(uniIds.ksu, collegeIds.ksuCs, "هندسة البرمجيات"),
    ksuEe: await ensureMajor(uniIds.ksu, collegeIds.ksuEng, "الهندسة الكهربائية"),
    kauIe: await ensureMajor(uniIds.kau, collegeIds.kauEng, "الهندسة الصناعية"),
    kauAcc: await ensureMajor(uniIds.kau, collegeIds.kauEcon, "المحاسبة"),
    kfupmCs: await ensureMajor(uniIds.kfupm, collegeIds.kfupmCs, "علوم الحاسب"),
    kfupmMath: await ensureMajor(uniIds.kfupm, collegeIds.kfupmSci, "الرياضيات"),
    kfuEng: await ensureMajor(uniIds.kfu, collegeIds.kfuSci, "اللغة الإنجليزية"),
    kfuMgt: await ensureMajor(uniIds.kfu, collegeIds.kfuBus, "إدارة المشاريع"),
    taibahAi: await ensureMajor(uniIds.taibah, collegeIds.taibahCs, "الذكاء الاصطناعي"),
    taibahEng: await ensureMajor(uniIds.taibah, collegeIds.taibahEng, "الهندسة المدنية"),
  };

  // 2) الحسابات: مدير المحتوى + المدرسون
  const manager = await ensureUser({
    username: "demo_manager",
    fullName: "منال العتيبي (مدير محتوى تجريبي)",
    role: "ADMIN",
    whatsapp: "0500000001",
  });

  const teacherUsers = {
    sara: await ensureUser({
      username: "demo_sara",
      fullName: "د. سارة القحطاني",
      role: "TEACHER",
      whatsapp: "0500000011",
      universityId: uniIds.ksu,
    }),
    abdullah: await ensureUser({
      username: "demo_abdullah",
      fullName: "د. عبدالله الحربي",
      role: "TEACHER",
      whatsapp: "0500000012",
      universityId: uniIds.kfupm,
    }),
    noura: await ensureUser({
      username: "demo_noura",
      fullName: "أ. نورة الشمري",
      role: "TEACHER",
      whatsapp: "0500000013",
      universityId: uniIds.kfu,
    }),
    khalid: await ensureUser({
      username: "demo_khalid",
      fullName: "د. خالد الدوسري",
      role: "TEACHER",
      whatsapp: "0500000014",
      universityId: uniIds.kau,
    }),
  };

  async function ensureTeacherProfile(
    userId: string,
    data: { degree: string; bio: string; specialties: string[]; universitiesText: string; status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"; docsUrl?: string },
  ): Promise<string> {
    const existing = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (existing) return existing.id;
    const created = await prisma.teacherProfile.create({ data: { userId, ...data } });
    return created.id;
  }

  const teacherDocsBy = (user: User) =>
    writeFileSafe(`${user.id}-demo-docs.pdf`, DEMO_PDF);

  const profileIds = {
    sara: await ensureTeacherProfile(teacherUsers.sara.id, {
      degree: "دكتوراه في علوم الحاسب — جامعة الملك سعود",
      bio: "أستاذة مساعدة في قواعد البيانات وهندسة البرمجيات، خبرة 8 سنوات في التدريس الجامعي والتدريب العملي.",
      specialties: ["قواعد البيانات", "هندسة البرمجيات", "SQL"],
      universitiesText: "جامعة الملك سعود",
      status: "APPROVED",
      docsUrl: teacherDocsBy(teacherUsers.sara),
    }),
    abdullah: await ensureTeacherProfile(teacherUsers.abdullah.id, {
      degree: "دكتوراه في الرياضيات التطبيقية — جامعة الملك فهد",
      bio: "مدرّس رياضيات تطبيقية، أهتم بتبسيط التفاضل والجبر الخطي عبر أمثلة هندسية ومسائل متدرجة.",
      specialties: ["التفاضل والتكامل", "الجبر الخطي", "الرياضيات الهندسية"],
      universitiesText: "جامعة الملك فهد للبترول والمعادن",
      status: "APPROVED",
      docsUrl: teacherDocsBy(teacherUsers.abdullah),
    }),
    noura: await ensureTeacherProfile(teacherUsers.noura.id, {
      degree: "ماجستير في اللغة الإنجليزية — جامعة الملك فيصل",
      bio: "مدرّبة كتابة أكاديمية وترجمة، أقدّم ورشًا تطبيقية على صياغة الفقرات والمراجع.",
      specialties: ["الترجمة", "الكتابة الأكاديمية"],
      universitiesText: "جامعة الملك فيصل",
      status: "PENDING",
      docsUrl: teacherDocsBy(teacherUsers.noura),
    }),
    khalid: await ensureTeacherProfile(teacherUsers.khalid.id, {
      degree: "دكتوراه في المحاسبة — جامعة الملك عبد العزيز",
      bio: "محاسب قانوني، طلب انضمامه لم يُعتمد لعدم اكتمال وثائق التحقق في هذا السيناريو التجريبي.",
      specialties: ["المحاسبة المالية", "التدقيق"],
      universitiesText: "جامعة الملك عبد العزيز",
      status: "REJECTED",
    }),
  };

  // 3) الطلاب العشرة
  const studentDefs: Array<{ key: string; username: string; name: string; uniId: string; majorId: string; whatsapp: string }> = [
    { key: "lama", username: "demo_lama", name: "لمى العسيري", uniId: uniIds.ksu, majorId: majorIds.ksuCs, whatsapp: "0500000101" },
    { key: "faisal", username: "demo_faisal", name: "فيصل الغامدي", uniId: uniIds.kfupm, majorId: majorIds.kfupmCs, whatsapp: "0500000102" },
    { key: "reem", username: "demo_reem", name: "ريم الزهراني", uniId: uniIds.ksu, majorId: majorIds.ksuSe, whatsapp: "0500000103" },
    { key: "majed", username: "demo_majed", name: "ماجد القحطاني", uniId: uniIds.kfupm, majorId: majorIds.kfupmCs, whatsapp: "0500000104" },
    { key: "hessa", username: "demo_hessa", name: "حصة المطيري", uniId: uniIds.kau, majorId: majorIds.kauAcc, whatsapp: "0500000105" },
    { key: "turki", username: "demo_turki", name: "تركي العنزي", uniId: uniIds.taibah, majorId: majorIds.taibahAi, whatsapp: "0500000106" },
    { key: "amal", username: "demo_amal", name: "أمل السبيعي", uniId: uniIds.kfu, majorId: majorIds.kfuEng, whatsapp: "0500000107" },
    { key: "bandar", username: "demo_bandar", name: "بندر الشهري", uniId: uniIds.kau, majorId: majorIds.kauIe, whatsapp: "0500000108" },
    { key: "jawaher", username: "demo_jawaher", name: "جواهر الحارثي", uniId: uniIds.taibah, majorId: majorIds.taibahEng, whatsapp: "0500000109" },
    { key: "mohammed", username: "demo_mohammed", name: "محمد بن سالم", uniId: uniIds.kfu, majorId: majorIds.kfuMgt, whatsapp: "0500000110" },
  ];

  const students: Record<string, User> = {};
  for (const s of studentDefs) {
    students[s.key] = await ensureUser({
      username: s.username,
      fullName: s.name,
      role: "STUDENT",
      whatsapp: s.whatsapp,
      universityId: s.uniId,
      majorId: s.majorId,
    });
  }

  // 4) المقررات (12)
  const courseIds = {
    db101: await ensureCourse({
      universityId: uniIds.ksu, collegeId: collegeIds.ksuCs, majorId: majorIds.ksuCs,
      code: "DEMO-DB101", title: "مقدمة في قواعد البيانات", level: "المستوى الرابع",
      description: "مقرر يغطي تصميم قواعد البيانات العلائقية، لغة SQL، التطبيع، والاستعلامات المتقدمة عبر أمثلة عملية.",
      coverName: "seed-cover-db101.png", coverColors: [[13, 42, 63], [56, 132, 149]],
    }),
    se201: await ensureCourse({
      universityId: uniIds.ksu, collegeId: collegeIds.ksuCs, majorId: majorIds.ksuSe,
      code: "DEMO-SE201", title: "هندسة البرمجيات", level: "المستوى الخامس",
      description: "دورة حياة تطوير البرمجيات، جمع المتطلبات، التصميم المعماري، الاختبار، وإدارة الإصدارات.",
      coverName: "seed-cover-se201.png", coverColors: [[45, 27, 60], [132, 96, 149]],
    }),
    sec301: await ensureCourse({
      universityId: uniIds.ksu, collegeId: collegeIds.ksuCs, majorId: majorIds.ksuCs,
      code: "DEMO-SEC301", title: "أمن المعلومات", level: "المستوى السابع",
      description: "أساسيات التشفير، إدارة الهوية، الثغرات الشائعة، وبناء عقلية دفاعية لدى المطوّر.",
      coverName: "seed-cover-sec301.png", coverColors: [[40, 20, 20], [160, 70, 60]],
    }),
    math101: await ensureCourse({
      universityId: uniIds.ksu, collegeId: collegeIds.ksuEng, majorId: majorIds.ksuEe,
      code: "DEMO-MATH101", title: "التفاضل والتكامل 1", level: "المستوى الأول",
      description: "النهايات والاشتقاق والتكامل الأساسي مع تطبيقات هندسية وحل مسائل متدرجة.",
      coverName: "seed-cover-math101.png", coverColors: [[18, 37, 52], [90, 140, 120]],
    }),
    phy101: await ensureCourse({
      universityId: uniIds.kau, collegeId: collegeIds.kauEng, majorId: majorIds.kauIe,
      code: "DEMO-PHY101", title: "الفيزياء العامة", level: "المستوى الثاني",
      description: "الميكانيكا والحركة والقوى والطاقة، بأمثلة صناعية وتجارب بسيطة.",
      coverName: "seed-cover-phy101.png", coverColors: [[20, 30, 50], [70, 110, 170]],
    }),
    acc101: await ensureCourse({
      universityId: uniIds.kau, collegeId: collegeIds.kauEcon, majorId: majorIds.kauAcc,
      code: "DEMO-ACC101", title: "مبادئ المحاسبة", level: "المستوى الأول",
      description: "القوائم المالية، القيود، التسويات، وتحليل الأرقام المالية بأسلوب تدريبي.",
      coverName: "seed-cover-acc101.png", coverColors: [[30, 40, 30], [110, 140, 90]],
    }),
    cs201: await ensureCourse({
      universityId: uniIds.kfupm, collegeId: collegeIds.kfupmCs, majorId: majorIds.kfupmCs,
      code: "DEMO-CS201", title: "هياكل البيانات", level: "المستوى الخامس",
      description: "القوائم والأشجار والجداول، تحليل التعقيد، وتطبيقات عملية بلغة بايثون.",
      coverName: "seed-cover-cs201.png", coverColors: [[12, 33, 46], [40, 130, 160]],
    }),
    math204: await ensureCourse({
      universityId: uniIds.kfupm, collegeId: collegeIds.kfupmSci, majorId: majorIds.kfupmMath,
      code: "DEMO-MATH204", title: "الجبر الخطي", level: "المستوى الثالث",
      description: "المصفوفات والفضاءات المتجهية والتحويلات الخطية، مع تطبيقات حاسوبية.",
      coverName: "seed-cover-math204.png", coverColors: [[25, 25, 45], [110, 90, 150]],
    }),
    eng101: await ensureCourse({
      universityId: uniIds.kfu, collegeId: collegeIds.kfuSci, majorId: majorIds.kfuEng,
      code: "DEMO-ENG101", title: "الكتابة الأكاديمية باللغة الإنجليزية", level: "المستوى الثاني",
      description: "بناء الفقرة الأكاديمية، صياغة الأطروحة، الاقتباس، وتجنّب الانتحال.",
      coverName: "seed-cover-eng101.png", coverColors: [[35, 30, 20], [150, 120, 70]],
    }),
    mgt210: await ensureCourse({
      universityId: uniIds.kfu, collegeId: collegeIds.kfuBus, majorId: majorIds.kfuMgt,
      code: "DEMO-MGT210", title: "إدارة المشاريع", level: "المستوى السادس",
      description: "دورة حياة المشروع، النطاق والجدولة والمخاطر، مع محاكاة خطة مشروع كاملة.",
      coverName: "seed-cover-mgt210.png", coverColors: [[22, 35, 30], [80, 140, 120]],
    }),
    ai101: await ensureCourse({
      universityId: uniIds.taibah, collegeId: collegeIds.taibahCs, majorId: majorIds.taibahAi,
      code: "DEMO-AI101", title: "أساسيات الذكاء الاصطناعي", level: "المستوى الرابع",
      description: "مقدمة في البحث والاستدلال والتعلم الآلي، مع أمثلة تمهيدية بلغة بايثون.",
      coverName: "seed-cover-ai101.png", coverColors: [[28, 22, 40], [120, 90, 160]],
    }),
    cs110: await ensureCourse({
      universityId: uniIds.taibah, collegeId: collegeIds.taibahEng, majorId: majorIds.taibahEng,
      code: "DEMO-CS110", title: "مبادئ البرمجة بلغة بايثون", level: "المستوى الأول",
      description: "المتغيرات، الشروط، الحلقات، الدوال، ومشروع صغير لتثبيت الأساسيات.",
      coverName: "seed-cover-cs110.png", coverColors: [[16, 34, 40], [60, 130, 140]],
    }),
  };

  // 5) الدورات (9)
  const V = {
    sql: "https://www.youtube.com/watch?v=HXV3zeQKqGY",
    python: "https://www.youtube.com/watch?v=rfscVS0vtbw",
    ml: "https://www.youtube.com/watch?v=aircAruvnKk",
    math: "https://www.youtube.com/watch?v=WUvTyaaNkzM",
  };

  const offeringIds = {
    o1: await ensureOffering({
      courseId: courseIds.db101, teacherId: profileIds.sara, title: "قواعد البيانات من الصفر — SQL عملي",
      summary: "مسار متكامل يبدأ من تصميم الجداول وينتهي باستعلامات JOIN المتقدمة، مع تمارين مصححة وأمثلة من أنظمة حقيقية.",
      price: 149, status: "PUBLISHED", trialVideoUrl: V.sql, createdAt: daysAgo(24),
    }),
    o2: await ensureOffering({
      courseId: courseIds.se201, teacherId: profileIds.sara, title: "هندسة البرمجيات — من المتطلبات إلى الإصدار",
      summary: "دورة عملية في دورة حياة البرمجيات: كتابة متطلبات واضحة، تصميم معماري، اختبارات، وإدارة إصدارات فريق صغير.",
      price: 199, status: "PUBLISHED", trialVideoUrl: V.python, createdAt: daysAgo(20),
    }),
    o3: await ensureOffering({
      courseId: courseIds.ai101, teacherId: profileIds.sara, title: "تمهيد الذكاء الاصطناعي (مسودة)",
      summary: "نسخة أولية قيد الإعداد تغطي مفاهيم البحث والاستدلال وتطبيقات التعلم الآلي التمهيدية.",
      price: 179, status: "DRAFT", createdAt: daysAgo(6),
    }),
    o4: await ensureOffering({
      courseId: courseIds.db101, teacherId: profileIds.abdullah, title: "مراجعة قواعد البيانات — حل مسائل الاختبار",
      summary: "جلسات مراجعة مركّزة على مسائل الاختبارات: التطبيع، المفاتيح، والاستعلامات المتداخلة، مع بنك أسئلة محلول.",
      price: 129, status: "PUBLISHED", trialVideoUrl: V.math, createdAt: daysAgo(15),
    }),
    o5: await ensureOffering({
      courseId: courseIds.math101, teacherId: profileIds.abdullah, title: "التفاضل والتكامل بأسلوب بصري",
      summary: "شرح مفاهيم النهايات والاشتقاق بالرسوم والأمثلة، ثم تدريب متدرج على مسائل الاختبارات الجامعية.",
      price: 99, status: "PUBLISHED", trialVideoUrl: V.math, createdAt: daysAgo(12),
    }),
    o6: await ensureOffering({
      courseId: courseIds.math204, teacherId: profileIds.abdullah, title: "الجبر الخطي — نسخة تجريبية مرفوضة",
      summary: "نسخة تجريبية أُوقفت لأنها تحتوي مواد خارجية غير مصرح بها في هذا السيناريو التجريبي.",
      price: 119, status: "REJECTED", adminNote: "المواد الثالثة تحتوي على ملفات لا نملك حقوقها؛ استبدلها ثم أعد التقديم.", createdAt: daysAgo(10),
    }),
    o7: await ensureOffering({
      courseId: courseIds.eng101, teacherId: profileIds.noura, title: "الكتابة الأكاديمية — مسودة مدرّسة غير معتمدة",
      summary: "مسودة شخصية لم تُنشر لعدم اعتماد المدرس بعد؛ تبقى في لوحة المدرس فقط.",
      price: 89, status: "DRAFT", createdAt: daysAgo(3),
    }),
    o8: await ensureOffering({
      courseId: courseIds.acc101, teacherId: profileIds.khalid, title: "مبادئ المحاسبة — مسودة مدرّس مرفوض",
      summary: "مسودة محفوظة لمدرس رُفض طلبه لعدم اكتمال وثائق التحقق، لا تظهر للطلاب.",
      price: 79, status: "DRAFT", createdAt: daysAgo(4),
    }),
    o9: await ensureOffering({
      courseId: courseIds.sec301, teacherId: profileIds.sara, title: "أمن المعلومات — دورة مخفية مؤقتًا",
      summary: "دورة مكتملة أوقفتها الإدارة مؤقتًا لحين مراجعة التحديثات على قسم الثغرات.",
      price: 159, status: "HIDDEN", adminNote: "إخفاء مؤقت لحين مراجعة محدثات 2026.", createdAt: daysAgo(18),
    }),
    o10: await ensureOffering({
      courseId: courseIds.eng101, teacherId: profileIds.abdullah, title: "الكتابة الأكاديمية — بانتظار اعتماد الإدارة",
      summary: "دورة مكتملة الدروس قدّمها المدرس للمراجعة، لا تظهر للزوار حتى تعتمدها الإدارة.",
      price: 109, status: "PENDING_REVIEW", createdAt: daysAgo(2),
    }),
  };

  const lessons: Array<[keyof typeof offeringIds, string, string, "TRIAL" | "PAID"]> = [
    ["o1", "تمهيد: كيف تفكر كمن يصمم قاعدة بيانات؟", V.sql, "TRIAL"],
    ["o1", "بناء الجداول والمفاتيح مع SQL", V.sql, "PAID"],
    ["o1", "استعلامات JOIN المتقدمة + تمرين محلول", V.sql, "PAID"],
    ["o1", "تطبيع قاعدة بيانات متجر إلكتروني", V.sql, "PAID"],
    ["o2", "معاينة: لماذا تفشل المشاريع البرمجية؟", V.python, "TRIAL"],
    ["o2", "جمع المتطلبات وكتابة قصص المستخدم", V.python, "PAID"],
    ["o2", "الاختبارات الآلية وخطة الإصدار", V.python, "PAID"],
    ["o4", "معاينة: خريطة أسئلة قواعد البيانات", V.math, "TRIAL"],
    ["o4", "التطبيع والمخططات — بنك أسئلة محلول", V.math, "PAID"],
    ["o4", "استعلامات متداخلة وتجميع", V.math, "PAID"],
    ["o5", "معاينة: النهاية والاشتقاق بصريًا", V.math, "TRIAL"],
    ["o5", "قواعد الاشتقاق مع أمثلة محلولة", V.math, "PAID"],
    ["o3", "مسودة درس: مقدمة في البحث", V.ml, "TRIAL"],
    ["o6", "درس تجريبي لنسخة مرفوضة", V.math, "TRIAL"],
    ["o7", "مسودة درس: الفقرة الأكاديمية", V.python, "TRIAL"],
    ["o8", "مسودة درس: مدخل إلى القيد المزدوج", V.math, "TRIAL"],
    ["o9", "معاينة: أساسيات التشفير", V.python, "TRIAL"],
    ["o9", "ثغرات SQL Injection عمليًا", V.sql, "PAID"],
    ["o10", "معاينة: بنية الفقرة الأكاديمية", V.python, "TRIAL"],
    ["o10", "بناء الحجة والاستشهاد", V.python, "PAID"],
  ];
  for (let i = 0; i < lessons.length; i++) {
    const [key, title, url, access] = lessons[i];
    await ensureLesson(offeringIds[key], title, url, access, i);
  }

  // 6) الخدمات
  const serviceDefs: Array<{ slug: string; title: string; category: "SUMMARY" | "TRANSLATION" | "PPT" | "PROGRAMMING_PROJECT" | "PROOFREADING" | "RESEARCH_REVIEW" | "HOMEWORK_TRAINING" | "ACADEMIC_CONSULT"; description: string; price: number | null; providerId?: string; featured?: boolean }> = [
    { slug: "demo-summary", title: "تلخيص وتدريب على التلخيص", category: "SUMMARY", description: "جلسة تدريب على اختيار الأفكار الرئيسة وتلخيص مقرر كامل بأسلوبك، مع تغذية راجعة على الملخص الأول.", price: 80, providerId: profileIds.sara, featured: true },
    { slug: "demo-translation", title: "ترجمة أكاديمية (تدريب)", category: "TRANSLATION", description: "تدريب على ترجمة الفقرات الأكاديمية والمراجع مع مراجعة لغوية للخيارات والصياغة.", price: 60, providerId: profileIds.noura },
    { slug: "demo-ppt", title: "إعداد عرض تقديمي تدريبي", category: "PPT", description: "ورشة قصيرة لبناء عرض تقديمي منظم: القصة، الشرائح، التصميم، ومهارات التقديم.", price: 120, providerId: profileIds.abdullah },
    { slug: "demo-programming", title: "جلسة تدريب على مشروع برمجي", category: "PROGRAMMING_PROJECT", description: "جلسة واحدة أو أكثر لمرافقتك أثناء بناء مشروعك البرمجي بنفسك: التخطيط، المراجعة، وتصحيح المفاهيم.", price: 250, providerId: profileIds.sara },
    { slug: "demo-proofreading", title: "تدقيق لغوي وتحرير", category: "PROOFREADING", description: "تدقيق نص عربي أو إنجليزي مع شرح مواضع الخطأ لتطوير كتابتك.", price: 50, providerId: profileIds.noura },
    { slug: "demo-research", title: "مراجعة بحث وتوجيه منهجي", category: "RESEARCH_REVIEW", description: "توجيه منهجي لخطة بحثك أو ورقتك، بجلسة نقاش مخصصة وملاحظات مكتوبة.", price: null, providerId: profileIds.abdullah },
    { slug: "demo-homework-training", title: "تدريب على حل الواجبات", category: "HOMEWORK_TRAINING", description: "حل مسائل تدريبية مشابهة لواجبك معك خطوة بخطوة، لتتعلم الطريقة لا لتسليمها بدلًا عنك.", price: 40, providerId: profileIds.abdullah },
    { slug: "demo-consult", title: "استشارة أكاديمية قصيرة", category: "ACADEMIC_CONSULT", description: "استشارة 30 دقيقة لترتيب أولويات الفصل واختيار المسار الدراسي.", price: 70, providerId: profileIds.sara },
  ];

  const serviceIds: Record<string, string> = {};
  for (const s of serviceDefs) {
    const existing = await prisma.service.findUnique({ where: { slug: s.slug } });
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const created = await prisma.service.create({
        data: {
          slug: s.slug,
          title: s.title,
          category: s.category,
          description: s.description,
          basePrice: s.price,
          durationDays: s.price ? 3 : null,
          providerId: s.providerId,
          isActive: true,
          isFeatured: s.featured ?? false,
        },
      });
      id = created.id;
      track("serviceIds", id);
    }
    serviceIds[s.slug] = id;
  }

  // 7) طلبات الشرح والعروض
  async function ensureRequest(input: {
    studentId: string;
    universityId: string;
    collegeId: string;
    majorId: string;
    courseTitle: string;
    details: string;
    status: "PENDING_REVIEW" | "OPEN" | "TEACHER_SELECTED" | "CLOSED" | "REJECTED";
    budget?: number;
    deadline?: string;
    attachments?: string[];
    createdAt?: Date;
  }): Promise<string> {
    const existing = await prisma.explainRequest.findFirst({
      where: { studentId: input.studentId, courseTitle: input.courseTitle },
    });
    if (existing) return existing.id;
    const created = await prisma.explainRequest.create({
      data: {
        studentId: input.studentId,
        universityId: input.universityId,
        collegeId: input.collegeId,
        majorId: input.majorId,
        courseTitle: input.courseTitle,
        details: input.details,
        type: "ONLINE",
        urgency: "WEEK",
        budget: input.budget,
        deadline: input.deadline,
        attachments: input.attachments ?? undefined,
        status: input.status,
        createdAt: input.createdAt,
      },
    });
    return created.id;
  }

  async function ensureOffer(requestId: string, teacherId: string, price: number, message: string, status: "PENDING" | "ACCEPTED" | "REJECTED", timelineDays = 3) {
    const existing = await prisma.offer.findUnique({ where: { requestId_teacherId: { requestId, teacherId } } });
    if (existing) return existing.id;
    const created = await prisma.offer.create({
      data: { requestId, teacherId, price, message, status, timelineDays },
    });
    return created.id;
  }

  const attachmentUrl = writeFileSafe(
    `${students.turki.id}-demo-request-db.png`,
    gradientPng(640, 360, [20, 35, 50], [70, 120, 140]),
  );

  const requestIds = {
    r1: await ensureRequest({
      studentId: students.turki.id, universityId: uniIds.ksu, collegeId: collegeIds.ksuCs, majorId: majorIds.ksuCs,
      courseTitle: "DEMO مقدمة في قواعد البيانات — استفسارات",
      details: "أحتاج شرحًا لمسائل التطبيع والاستعلامات المتداخلة قبل اختبار الأسبوع القادم. أرفقت صورة من نموذج الأسئلة.",
      status: "OPEN", budget: 150, deadline: "قبل الأربعاء القادم", attachments: [attachmentUrl], createdAt: daysAgo(2),
    }),
    r2: await ensureRequest({
      studentId: students.amal.id, universityId: uniIds.kfu, collegeId: collegeIds.kfuSci, majorId: majorIds.kfuEng,
      courseTitle: "DEMO الكتابة الأكاديمية — مراجعة فقرة",
      details: "طلب جديد بانتظار مراجعة الإدارة: أريد توجيهًا في صياغة فقرة المقدمة وترتيب المراجع.",
      status: "PENDING_REVIEW", budget: 90, createdAt: daysAgo(1),
    }),
    r3: await ensureRequest({
      studentId: students.bandar.id, universityId: uniIds.kau, collegeId: collegeIds.kauEng, majorId: majorIds.kauIe,
      courseTitle: "DEMO الفيزياء العامة — مسائل الحركة",
      details: "جلسة واحدة لحل مسائل الحركة والقوى مع شرح خطوات الحل، وقد تم اختيار عرض المدرس وإتمام الدفع بنجاح.",
      status: "CLOSED", budget: 150, deadline: "منتصف الأسبوع", createdAt: daysAgo(9),
    }),
    r4: await ensureRequest({
      studentId: students.jawaher.id, universityId: uniIds.taibah, collegeId: collegeIds.taibahEng, majorId: majorIds.taibahEng,
      courseTitle: "DEMO الفيزياء الهندسية — طلب مرفوض",
      details: "طلب رفضته الإدارة في هذا السيناريو التجريبي لأنه يشير إلى تسليم واجب جاهز بدل التدريب.",
      status: "REJECTED", budget: 60, createdAt: daysAgo(7),
    }),
    r5: await ensureRequest({
      studentId: students.reem.id, universityId: uniIds.ksu, collegeId: collegeIds.ksuCs, majorId: majorIds.ksuSe,
      courseTitle: "DEMO هندسة البرمجيات — مراجعة مخططات",
      details: "اخترت عرض مدرّس لمراجعة مخططات UML قبل التسليم، وأنتظر إتمام الدفع.",
      status: "TEACHER_SELECTED", budget: 200, createdAt: daysAgo(3),
    }),
  };

  const offerIds = {
    o1: await ensureOffer(requestIds.r1, profileIds.sara, 120, "جلسة أونلاين 90 دقيقة + ملخص مكتوب لخطوات الحل.", "PENDING", 2),
    o2: await ensureOffer(requestIds.r1, profileIds.abdullah, 100, "أركز على بنك أسئلة مشابه وأشرح التطبيع خطوة بخطوة.", "PENDING", 3),
    o3: await ensureOffer(requestIds.r3, profileIds.abdullah, 150, "حصة واحدة تغطي مسائل الحركة مع أوراق عمل.", "ACCEPTED", 2),
    o4: await ensureOffer(requestIds.r5, profileIds.sara, 200, "مراجعة مخططات UML وتصحيح الملاحظات قبل التسليم.", "ACCEPTED", 2),
  };

  // 8) الطلبات والمدفوعات والاشتراكات
  const s = students;

  const receiptFor = (user: User, tag: string) =>
    writeFileSafe(`${user.id}-demo-receipt-${tag}.png`, gradientPng(480, 640, [240, 240, 235], [200, 210, 220]));

  // سندات بانتظار المراجعة أو مرفوضة فقط؛ المعتمدة يمكن أن تحمل سندًا أيضًا
  const ord1 = await ensureOrder({ orderNo: "DEMO-ORD-0001", studentId: s.lama.id, targetType: "OFFERING", targetId: offeringIds.o1, amount: 149, title: "قواعد البيانات من الصفر — SQL عملي", status: "PAID", providerId: profileIds.sara, createdAt: daysAgo(20) });
  await ensurePayment({ orderId: ord1, status: "APPROVED", receiptUrl: receiptFor(s.lama, "0001"), reviewerId: manager.id, paidAt: daysAgo(19), createdAt: daysAgo(20) });
  await ensureEnrollment(s.lama.id, offeringIds.o1);

  const ord2 = await ensureOrder({ orderNo: "DEMO-ORD-0002", studentId: s.faisal.id, targetType: "OFFERING", targetId: offeringIds.o4, amount: 129, title: "مراجعة قواعد البيانات — حل مسائل الاختبار", status: "PAID", providerId: profileIds.abdullah, createdAt: daysAgo(14) });
  await ensurePayment({ orderId: ord2, status: "APPROVED", receiptUrl: receiptFor(s.faisal, "0002"), reviewerId: manager.id, paidAt: daysAgo(13), createdAt: daysAgo(14) });
  await ensureEnrollment(s.faisal.id, offeringIds.o4);

  await ensureOrder({ orderNo: "DEMO-ORD-0003", studentId: s.reem.id, targetType: "OFFERING", targetId: offeringIds.o1, amount: 149, title: "قواعد البيانات من الصفر — SQL عملي", status: "AWAITING_PAYMENT", providerId: profileIds.sara, createdAt: daysAgo(1) });

  const ord4 = await ensureOrder({ orderNo: "DEMO-ORD-0004", studentId: s.majed.id, targetType: "OFFERING", targetId: offeringIds.o4, amount: 129, title: "مراجعة قواعد البيانات — حل مسائل الاختبار", status: "AWAITING_REVIEW", providerId: profileIds.abdullah, createdAt: daysAgo(2) });
  await ensurePayment({ orderId: ord4, status: "UNDER_REVIEW", receiptUrl: receiptFor(s.majed, "0004"), createdAt: daysAgo(2) });

  const ord5 = await ensureOrder({ orderNo: "DEMO-ORD-0005", studentId: s.hessa.id, targetType: "OFFERING", targetId: offeringIds.o2, amount: 199, title: "هندسة البرمجيات — من المتطلبات إلى الإصدار", status: "REJECTED", providerId: profileIds.sara, createdAt: daysAgo(6) });
  await ensurePayment({ orderId: ord5, status: "REJECTED", receiptUrl: receiptFor(s.hessa, "0005"), reviewerId: manager.id, reviewNote: "السند غير واضح والمبلغ لا يطابق قيمة الدورة.", createdAt: daysAgo(6) });

  await ensureOrder({ orderNo: "DEMO-ORD-0006", studentId: s.turki.id, targetType: "OFFERING", targetId: offeringIds.o5, amount: 99, title: "التفاضل والتكامل بأسلوب بصري", status: "AWAITING_PAYMENT", providerId: profileIds.abdullah, createdAt: daysAgo(1) });

  const ord7 = await ensureOrder({ orderNo: "DEMO-ORD-0007", studentId: s.bandar.id, targetType: "OFFER", targetId: offerIds.o3, amount: 150, title: "طلب شرح: الفيزياء العامة — مسائل الحركة", status: "PAID", providerId: profileIds.abdullah, createdAt: daysAgo(8) });
  await ensurePayment({ orderId: ord7, status: "APPROVED", receiptUrl: receiptFor(s.bandar, "0007"), reviewerId: manager.id, paidAt: daysAgo(7), createdAt: daysAgo(8) });

  const ord8 = await ensureOrder({ orderNo: "DEMO-ORD-0008", studentId: s.turki.id, targetType: "SERVICE", targetId: serviceIds["demo-translation"], amount: 60, title: "ترجمة أكاديمية (تدريب)", status: "AWAITING_PAYMENT", providerId: profileIds.noura, createdAt: daysAgo(1) });

  const ord9 = await ensureOrder({ orderNo: "DEMO-ORD-0009", studentId: s.amal.id, targetType: "SERVICE", targetId: serviceIds["demo-summary"], amount: 80, title: "تلخيص وتدريب على التلخيص", status: "PAID", providerId: profileIds.sara, createdAt: daysAgo(5) });
  await ensurePayment({ orderId: ord9, status: "APPROVED", receiptUrl: receiptFor(s.amal, "0009"), reviewerId: manager.id, paidAt: daysAgo(4), createdAt: daysAgo(5) });

  const ord10 = await ensureOrder({ orderNo: "DEMO-ORD-0010", studentId: s.mohammed.id, targetType: "SERVICE", targetId: serviceIds["demo-ppt"], amount: 120, title: "إعداد عرض تقديمي تدريبي", status: "AWAITING_REVIEW", providerId: profileIds.abdullah, createdAt: daysAgo(2) });
  await ensurePayment({ orderId: ord10, status: "UNDER_REVIEW", receiptUrl: receiptFor(s.mohammed, "0010"), createdAt: daysAgo(2) });

  const ord11 = await ensureOrder({ orderNo: "DEMO-ORD-0011", studentId: s.jawaher.id, targetType: "SERVICE", targetId: serviceIds["demo-programming"], amount: 250, title: "جلسة تدريب على مشروع برمجي", status: "REJECTED", providerId: profileIds.sara, createdAt: daysAgo(6) });
  await ensurePayment({ orderId: ord11, status: "REJECTED", receiptUrl: receiptFor(s.jawaher, "0011"), reviewerId: manager.id, reviewNote: "لم يصل المبلغ إلى الحساب — أعد التحويل.", createdAt: daysAgo(6) });

  const ord12 = await ensureOrder({ orderNo: "DEMO-ORD-0012", studentId: s.reem.id, targetType: "OFFER", targetId: offerIds.o4, amount: 200, title: "طلب شرح: هندسة البرمجيات — مراجعة مخططات", status: "AWAITING_PAYMENT", providerId: profileIds.sara, createdAt: daysAgo(3) });

  // 9) الإعلانات
  const adIds: Record<string, string> = {};
  async function ensureAd(input: { teacherId: string; title: string; body: string; imageUrl?: string; status: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "HIDDEN" | "EXPIRED"; reviewerNote?: string }) {
    const existing = await prisma.ad.findFirst({ where: { teacherId: input.teacherId, title: input.title } });
    if (existing) return existing.id;
    const created = await prisma.ad.create({ data: { ...input, linkUrl: "https://example.com/demo" } });
    track("adIds", created.id);
    return created.id;
  }

  adIds.approved = await ensureAd({
    teacherId: profileIds.sara, title: "مراجعة مكثفة لقواعد البيانات قبل الاختبار",
    body: "جلسات مراجعة جماعية مباشرة يوميًا هذا الأسبوع، مع بنك أسئلة محلول لكل مستوى. مقاعد محدودة.",
    imageUrl: writeFileSafe(`${teacherUsers.sara.id}-demo-ad-db.png`, gradientPng(600, 300, [18, 40, 55], [190, 160, 90])),
    status: "APPROVED",
  });
  adIds.pending = await ensureAd({
    teacherId: profileIds.abdullah, title: "جلسة مفتوحة: التفاضل والتكامل بلا رعب",
    body: "جلسة تعريفية مجانية نرسم فيها المفاهيم قبل المعادلات. سجّل حضورك من صفحة الحصص المباشرة.",
    status: "PENDING_REVIEW",
  });
  adIds.rejected = await ensureAd({
    teacherId: profileIds.sara, title: "خصم 70% على دورة أمن المعلومات",
    body: "عرض تجريبي رفضته الإدارة لعدم دقة نسبة الخصم المعلنة.",
    status: "REJECTED", reviewerNote: "نسبة الخصم لا تطابق السعر الفعلي.",
  });

  // 10) المحادثات
  const room1 = await ensureDirectRoom(s.lama.id, teacherUsers.sara.id);
  await ensureMessage(room1, s.lama.id, "السلام عليكم د. سارة، اشتركت في دورة قواعد البيانات وأحتاج توضيحًا في تمرين JOIN.", 120);
  await ensureMessage(room1, teacherUsers.sara.id, "وعليكم السلام لمى، أرسلي رقم التمرين وسأشرحه لك هنا أو نضيفه لجلسة المراجعة.", 110);
  await ensureMessage(room1, s.lama.id, "التمرين الخامس، أرفقت صورة السؤال من المذكرة.", 100, writeFileSafe(`${s.lama.id}-demo-chat-question.png`, gradientPng(600, 400, [245, 245, 240], [215, 220, 225])));
  await ensureMessage(room1, teacherUsers.sara.id, "وصلتني الصورة. ابدئي بجدول الطلبات ثم اربطي العميل والمنتج عبر جدول وسيط، وسأشرحها في الدرس القادم.", 90);

  const room2 = await ensureDirectRoom(s.faisal.id, manager.id);
  await ensureMessage(room2, s.faisal.id, "مرحبًا، سند التحويل لدورتي اعتُمد؟", 300);
  await ensureMessage(room2, manager.id, "أهلًا فيصل، نعم اعتُمد السند وفتحنا لك الوصول للدورة. بالتوفيق.", 290);
  await ensureMessage(room2, s.faisal.id, "شكرًا جزيلًا لسرعة الرد.", 280);

  const room3 = await ensureGroupRoom(manager.id, "استفسارات طلاب قواعد البيانات (تجريبي)", [s.lama.id, s.reem.id, teacherUsers.sara.id]);
  await ensureMessage(room3, manager.id, "مجموعة تجريبية للاستفسارات العامة عن مسار قواعد البيانات. يُمنع تبادل الواجبات الجاهزة.", 500);
  await ensureMessage(room3, teacherUsers.sara.id, "سأثبت موعد جلسة المراجعة الأسبوعية هنا، وتجدون الدروس في صفحة الدورة.", 480);

  // 11) الإشعارات + التقييمات + المفضلة + الجلسات المباشرة
  await ensureNotification(s.lama.id, "تم اعتماد الدفعة", "اعتُمد سند الطلب DEMO-ORD-0001 وفُتح لك الوصول إلى دورة قواعد البيانات.", "PAYMENT_APPROVED", "/orders/" + ord1, 60 * 24 * 19);
  await ensureNotification(s.faisal.id, "تم اعتماد الدفعة", "اعتُمد سند الطلب DEMO-ORD-0002 وفُتح لك الوصول إلى دورة مراجعة قواعد البيانات.", "PAYMENT_APPROVED", "/orders/" + ord2, 60 * 24 * 13);
  await ensureNotification(s.majed.id, "سندك قيد المراجعة", "رفعت سند الطلب DEMO-ORD-0004، وسيُعتمد بعد مراجعة الإدارة.", "PAYMENT_SUBMITTED", "/orders/" + ord4, 60 * 24 * 2);
  await ensureNotification(s.hessa.id, "لم يُعتمد السند", "سبب الإدارة: السند غير واضح والمبلغ لا يطابق قيمة الدورة.", "PAYMENT_REJECTED", "/orders/" + ord5, 60 * 24 * 6);
  await ensureNotification(teacherUsers.sara.id, "مشترك جديد في دورتك", "لمى العسيري اشتركت في دورة قواعد البيانات من الصفر.", "ENROLLMENT", "/teacher/offerings", 60 * 24 * 19);
  await ensureNotification(teacherUsers.abdullah.id, "دفعة جديدة معتمدة لصالحك", "اعتُمد سند طلب DEMO-ORD-0002 بمبلغ 129 ريالًا.", "PAYMENT_APPROVED", "/teacher/earnings", 60 * 24 * 13);
  await ensureNotification(manager.id, "مدرس جديد بانتظار المراجعة", "نورة الشمري أرسلت طلب انضمام كمدرّبة.", "TEACHER_PENDING", "/admin/teachers?status=PENDING", 60 * 24 * 3);
  await ensureNotification(manager.id, "سند حوالة جديد بانتظار المراجعة", "ماجد القحطاني رفع سندًا للطلب DEMO-ORD-0004.", "PAYMENT_SUBMITTED", "/admin/payments?status=UNDER_REVIEW", 60 * 24 * 2);
  await ensureNotification(s.turki.id, "طلبك منشور للمدرسين", "طلب شرح مقدمة في قواعد البيانات منشور، ووصلت عروض جديدة.", "REQUEST_PUBLISHED", "/requests/" + requestIds.r1, 60 * 24 * 2);

  const review1 = await prisma.review.findUnique({ where: { offeringId_userId: { offeringId: offeringIds.o1, userId: s.lama.id } } });
  if (!review1) {
    await prisma.review.create({
      data: { offeringId: offeringIds.o1, userId: s.lama.id, rating: 5, comment: "شرح مرتب جدًا وتمارين محلولة ساعدتني في الاختبار.", createdAt: daysAgo(10) },
    });
  }
  const review2 = await prisma.review.findUnique({ where: { offeringId_userId: { offeringId: offeringIds.o4, userId: s.faisal.id } } });
  if (!review2) {
    await prisma.review.create({
      data: { offeringId: offeringIds.o4, userId: s.faisal.id, rating: 4, comment: "بنك الأسئلة ممتاز، أتمنى إضافة شرح أطول للاستعلامات المتداخلة.", createdAt: daysAgo(7) },
    });
  }

  for (const fav of [
    { userId: s.lama.id, targetId: offeringIds.o1, targetType: "OFFERING" as const },
    { userId: s.reem.id, targetId: offeringIds.o2, targetType: "OFFERING" as const },
    { userId: s.turki.id, targetId: profileIds.sara, targetType: "TEACHER" as const },
  ]) {
    await prisma.favorite.upsert({
      where: { userId_targetId_targetType: fav },
      update: {},
      create: fav,
    });
  }

  const live1 = await prisma.liveSession.findFirst({ where: { teacherId: profileIds.sara, title: "مراجعة مفتوحة: قواعد البيانات قبل الاختبار" } });
  if (!live1) {
    await prisma.liveSession.create({
      data: {
        offeringId: offeringIds.o1,
        teacherId: profileIds.sara,
        title: "مراجعة مفتوحة: قواعد البيانات قبل الاختبار",
        startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        durationMin: 90,
        price: 0,
        capacity: 25,
      },
    });
  }
  const live2 = await prisma.liveSession.findFirst({ where: { teacherId: profileIds.abdullah, title: "ورشة: التفاضل بصريًا (حصصة مدفوعة)" } });
  if (!live2) {
    await prisma.liveSession.create({
      data: {
        offeringId: offeringIds.o5,
        teacherId: profileIds.abdullah,
        title: "ورشة: التفاضل بصريًا (حصصة مدفوعة)",
        startsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        durationMin: 60,
        price: 39,
        capacity: 30,
      },
    });
  }

  // 12) المانيفست + ملخص
  saveManifest();
  const merged = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;

  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } }, select: { role: true } });
  const roleCounts = demoUsers.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.role]: (acc[u.role] ?? 0) + 1 }), {});
  const [coursesCount, offeringsCount, lessonsCount, enrollmentsCount, ordersCount, paymentsCount, requestsCount, servicesCount, adsCount, roomsCount, messagesCount] =
    await Promise.all([
      prisma.course.count({ where: { code: { startsWith: "DEMO-" } } }),
      prisma.courseOffering.count({ where: { id: { in: merged.offeringIds } } }),
      prisma.lesson.count({ where: { offeringId: { in: merged.offeringIds } } }),
      prisma.enrollment.count({ where: { user: { email: { endsWith: `@${DEMO_DOMAIN}` } } } }),
      prisma.order.count({ where: { id: { in: merged.orderIds } } }),
      prisma.payment.count({ where: { orderId: { in: merged.orderIds } } }),
      prisma.explainRequest.count({ where: { student: { email: { endsWith: `@${DEMO_DOMAIN}` } } } }),
      prisma.service.count({ where: { slug: { startsWith: "demo-" } } }),
      prisma.ad.count({ where: { id: { in: merged.adIds } } }),
      prisma.chatRoom.count({ where: { id: { in: merged.roomIds } } }),
      prisma.message.count({ where: { roomId: { in: merged.roomIds } } }),
    ]);

  console.log("\n[demo-seed] اكتملت البيانات التجريبية:");
  console.log("  الحسابات:", JSON.stringify(roleCounts), `(كلمة المرور للجميع: ${DEMO_PASSWORD})`);
  console.log(`  المقررات: ${coursesCount} · الدورات: ${offeringsCount} · الدروس: ${lessonsCount}`);
  console.log(`  الاشتراكات: ${enrollmentsCount} · الطلبات: ${ordersCount} · المدفوعات: ${paymentsCount}`);
  console.log(`  طلبات الشرح: ${requestsCount} · الخدمات: ${servicesCount} · الإعلانات: ${adsCount}`);
  console.log(`  المحادثات: ${roomsCount} · الرسائل: ${messagesCount}`);
  console.log(`  المانيفست: ${MANIFEST_PATH}`);
  console.log("\n  حسابات الدخول (كلها بكلمة مرور واحدة Demo@2026!):");
  console.log("   ADMIN   demo_manager@demo.siraj.local");
  console.log("   TEACHER demo_sara@demo.siraj.local (معتمدة) · demo_abdullah@demo.siraj.local (معتمد)");
  console.log("           demo_noura@demo.siraj.local (بانتظار الاعتماد) · demo_khalid@demo.siraj.local (مرفوض)");
  console.log("   STUDENT demo_lama@demo.siraj.local (مشتركة) · demo_faisal@demo.siraj.local (مشترك)");
  console.log("           demo_reem / demo_majed / demo_hessa / demo_turki / demo_amal / demo_bandar / demo_jawaher / demo_mohammed");
  console.log("   يمكن الدخول بالبريد الكامل أو باسم المستخدم (مثل demo_lama).\n");
}

main()
  .catch((err: unknown) => {
    console.error("\n[demo-seed] فشل التنفيذ:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
