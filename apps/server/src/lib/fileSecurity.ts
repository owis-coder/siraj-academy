import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "./prisma";

/**
 * قواعد أمان الملفات المركزية — تُستخدم من كل مسارات الرفع.
 * نوع MIME القادم من المتصفح لا يُصدَّق وحده: نقارن بصمة البايتات الأولى.
 */

export const DEFAULT_MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 100);
export const MAX_FILES_PER_REQUEST = 10;

const MB = 1024 * 1024;

/** امتدادات مسموحة صراحةً — لا شيء غيرها (لا تنفيذي، لا سكربتات، لا SVG/HTML) */
export const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".zip",
  ".rar",
  ".txt",
]);

/** نوع MIME المتوقع لكل امتداد */
export const MIME_BY_EXTENSION: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword", "application/vnd.ms-word"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".ppt": ["application/vnd.ms-powerpoint"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".rar": ["application/vnd.rar", "application/x-rar-compressed", "application/rar"],
  ".txt": ["text/plain"],
};

/** مجلد Drive الذي ينتمي إليه كل تصنيف */
export const CATEGORY_FOLDER: Record<string, string> = {
  PAYMENTS: "PAYMENTS",
  MAIN_FILES: "MAIN_FILES",
  CUSTOM_REQUESTS: "CUSTOM_REQUESTS",
  PRIVATE_EXPLANATIONS: "PRIVATE_EXPLANATIONS",
  COURSE_ATTACHMENTS: "COURSE_ATTACHMENTS",
  OTHER_ATTACHMENTS: "OTHER_ATTACHMENTS",
  COURSE_MATERIALS: "COURSE_MATERIALS",
  LESSON_FILES: "LESSON_FILES",
  VIDEO_REFERENCES: "VIDEO_REFERENCES",
  SERVICE_ATTACHMENTS: "SERVICE_ATTACHMENTS",
  ASSIGNMENT_MATERIALS: "ASSIGNMENT_MATERIALS",
};

const STUDENT_CATEGORIES = new Set([
  "PAYMENTS",
  "MAIN_FILES",
  "CUSTOM_REQUESTS",
  "PRIVATE_EXPLANATIONS",
  "COURSE_ATTACHMENTS",
  "OTHER_ATTACHMENTS",
]);

const TEACHER_CATEGORIES = new Set([
  "COURSE_MATERIALS",
  "LESSON_FILES",
  "VIDEO_REFERENCES",
  "SERVICE_ATTACHMENTS",
  "ASSIGNMENT_MATERIALS",
  "OTHER_ATTACHMENTS",
]);

/** الحد الأقصى للحجم — يُقرأ من إعدادات الإدارة (Setting.max_file_size_mb) مع حد أعلى أمان */
export async function getMaxFileSizeBytes(): Promise<number> {
  const hardCap = Number(process.env.MAX_FILE_SIZE_HARD_CAP_MB || 500) * MB;
  // في الاختبارات لا نتصل بقاعدة البيانات: نستخدم الافتراضي/البيئة
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return Math.min(DEFAULT_MAX_FILE_SIZE_MB * MB, hardCap);
  }
  try {
    const row = await prisma.setting.findUnique({ where: { key: "max_file_size_mb" } });
    const configured = row ? Number(row.value) : NaN;
    if (Number.isFinite(configured) && configured > 0) {
      return Math.min(Math.floor(configured * MB), hardCap);
    }
  } catch {
    // إعداد غير متاح — نعود للافتراضي
  }
  return Math.min(DEFAULT_MAX_FILE_SIZE_MB * MB, hardCap);
}

export function categoryAllowedForRole(role: "STUDENT" | "TEACHER" | "ADMIN", category: string): boolean {
  if (role === "ADMIN") return category in CATEGORY_FOLDER;
  if (role === "STUDENT") return STUDENT_CATEGORIES.has(category);
  if (role === "TEACHER") return TEACHER_CATEGORIES.has(category);
  return false;
}

export function extensionOf(name: string): string {
  return path.extname(name).toLowerCase();
}

/** تنظيف الاسم الأصلي: منع المسارات والأحرف الخطرة دون فقدان الحروف العربية */
export function sanitizeOriginalFileName(raw: string): string {
  const base = path.basename(String(raw || "file")).normalize("NFKC");
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  const safe = cleaned.replace(/^\.+/, "").slice(0, 160);
  return safe || "file";
}

/** الصيغة: OriginalFileName_YYYY-MM-DD_HH-mm-ss_UUID.ext */
export function buildStoredFileName(originalName: string, at = new Date()): string {
  const safe = sanitizeOriginalFileName(originalName);
  const ext = extensionOf(safe);
  const stem = ext ? safe.slice(0, -ext.length) : safe;
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}` +
    `_${pad(at.getUTCHours())}-${pad(at.getUTCMinutes())}-${pad(at.getUTCSeconds())}`;
  const uuid = crypto.randomUUID();
  return `${stem}_${stamp}_${uuid}${ext}`;
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function readHead(filePath: string, length = 16): Buffer {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const read = fs.readSync(fd, buf, 0, length, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

const startsWithAscii = (buf: Buffer, ascii: string) =>
  buf.length >= ascii.length && buf.subarray(0, ascii.length).toString("ascii") === ascii;

const isZip = (buf: Buffer) =>
  buf.length >= 4 &&
  buf[0] === 0x50 &&
  buf[1] === 0x4b &&
  ((buf[2] === 0x03 && buf[3] === 0x04) || (buf[2] === 0x05 && buf[3] === 0x06) || (buf[2] === 0x07 && buf[3] === 0x08));

const isRar = (buf: Buffer) =>
  startsWithAscii(buf, "Rar!\x1a\x07\x00") || startsWithAscii(buf, "Rar!\x1a\x07\x01\x00");

/**
 * التحقق من أن محتوى الملف الفعلي يطابق امتداده المعلن.
 * DOCX/PPTX/XLSX هي أرشيف ZIP، وDOC/XLS/PPT القديمة لها بصمات OLE.
 */
export function contentMatchesExtension(ext: string, head: Buffer): boolean {
  switch (ext) {
    case ".pdf":
      return startsWithAscii(head, "%PDF-");
    case ".jpg":
    case ".jpeg":
      return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case ".png":
      return head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case ".webp":
      return head.length >= 12 && startsWithAscii(head, "RIFF") && head.subarray(8, 12).toString("ascii") === "WEBP";
    case ".zip":
      return isZip(head);
    case ".rar":
      return isRar(head);
    case ".docx":
    case ".pptx":
    case ".xlsx":
      return isZip(head);
    case ".doc":
    case ".xls":
    case ".ppt":
      return head.length >= 4 && head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
    case ".txt": {
      // نص عادي: لا بايتات NUL في بداية الملف (يرفض الملفات الثنائية المتنكرة)
      return !head.includes(0);
    }
    default:
      return false;
  }
}

export type FileValidationResult =
  | { ok: true; extension: string; mimeType: string; size: number }
  | { ok: false; reason: string };

export async function validateUploadedFile(file: {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}): Promise<FileValidationResult> {
  const original = sanitizeOriginalFileName(file.originalname);
  const ext = extensionOf(original);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: "نوع الملف غير مدعوم" };
  }

  const maxBytes = await getMaxFileSizeBytes();
  if (!file.size || file.size <= 0) return { ok: false, reason: "الملف فارغ" };
  if (file.size > maxBytes) {
    return { ok: false, reason: `حجم الملف يتجاوز الحد المسموح (${Math.round(maxBytes / MB)} ميجابايت)` };
  }

  const allowedMimes = MIME_BY_EXTENSION[ext] ?? [];
  // بعض المتصفحات ترسل application/octet-stream؛ نقبلها فقط إن طابق المحتوى امتداده
  const mimeOk = allowedMimes.includes(file.mimetype) || file.mimetype === "application/octet-stream" || !file.mimetype;
  if (!mimeOk) return { ok: false, reason: "نوع MIME لا يطابق امتداد الملف" };

  let head: Buffer;
  try {
    head = readHead(file.path, 16);
  } catch {
    return { ok: false, reason: "تعذر قراءة الملف" };
  }
  if (!contentMatchesExtension(ext, head)) {
    return { ok: false, reason: "محتوى الملف لا يطابق نوعه المعلن" };
  }

  return { ok: true, extension: ext, mimeType: allowedMimes[0] ?? file.mimetype, size: file.size };
}

/** حذف ملف مؤقت دون إفشاء الخطأ */
export function discardTempFile(filePath?: string): void {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // تجاهل — الملف قد يكون محذوفًا
  }
}
