import type { Request } from "express";
import type multer from "multer";
import multer_ from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { badRequest } from "../lib/errors";

export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "..", "..", "uploads");

if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// الامتداد يُشتق من نوع MIME المعروف فقط (لا من اسم الملف القادم من العميل)
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
};

// الامتدادات المحظورة قطعًا (حتى وإن تم إعلان نوع MIME مزيف)
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".php", ".phtml", ".php5", ".js", ".py", ".pl",
  ".cgi", ".svg", ".html", ".htm", ".xhtml", ".jsp", ".asp", ".aspx", ".jar", ".vbs",
  ".scr", ".dll", ".so", ".bin",
]);

export function isDangerousFilename(originalName: string): boolean {
  const lower = originalName.toLowerCase();
  for (const ext of BLOCKED_EXTENSIONS) {
    if (lower.endsWith(ext) || lower.includes(`${ext}.`)) {
      return true;
    }
  }
  // فحص المسارات النسبية (Path Traversal)
  if (lower.includes("..") || lower.includes("/") || lower.includes("\\")) {
    return true;
  }
  return false;
}

export const isDangerousExtension = isDangerousFilename;

const storage = multer_.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (req, file, cb) => {
    if (isDangerousFilename(file.originalname)) {
      return cb(new Error("امتداد الملف أو اسمه غير مسموح به لأسباب أمنية"), "");
    }
    // البادئة = معرّف الرافع، ويُستخدم لاحقًا لتفويض الوصول للملف نفسه
    const owner = ((req as Request).user?.id ?? "guest").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "guest";
    const ext = EXT_BY_MIME[file.mimetype] ?? "";
    const token = crypto.randomBytes(9).toString("hex");
    cb(null, `${owner}-${Date.now()}-${token}${ext}`);
  },
});

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DOC_MIME = new Set([...IMAGE_MIME, "application/pdf", "application/zip", "application/x-zip-compressed"]);

const MB25 = 25 * 1024 * 1024;

// رفع عام: صور/PDF/ZIP حتى 25MB
export const uploadAny: multer.Multer = multer_({
  storage,
  limits: { fileSize: MB25, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!DOC_MIME.has(file.mimetype)) {
      return cb(new Error("نوع الملف غير مدعوم. المسموح: صور، PDF، ZIP"));
    }
    cb(null, true);
  },
});

// سند الحوالة: صور فقط
export const uploadReceipt: multer.Multer = multer_({
  storage,
  limits: { fileSize: MB25, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIME.has(file.mimetype)) {
      return cb(new Error("يجب رفع صورة للسند (JPG/PNG/WebP/GIF)"));
    }
    cb(null, true);
  },
});

// صورة الملف الشخصي: صور فقط وبحد 3 ميجابايت — الامتداد يُشتق من نوع MIME المعروف،
// والاسم يُولَّد على الخادم (بادئة معرّف المستخدم + قيمة عشوائية).
const MB3 = 3 * 1024 * 1024;
export const uploadAvatar: multer.Multer = multer_({
  storage,
  limits: { fileSize: MB3, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIME.has(file.mimetype)) {
      return cb(new Error("صورة الملف الشخصي يجب أن تكون JPG أو PNG أو WebP أو GIF"));
    }
    cb(null, true);
  },
});

// ---------- التحقق الحقيقي من محتوى الملف (بصمة البايتات الأولى) ----------
// نوع MIME قادم من العميل لا يُصدَّق وحده: نقارن أول بايتات الملف المكتوب بنوعه المعلن.
const startsWith = (buf: Buffer, bytes: number[], ascii?: string): boolean => {
  if (buf.length < Math.max(bytes.length, ascii?.length ?? 0)) return false;
  if (ascii) return buf.subarray(0, ascii.length).toString("ascii") === ascii;
  return bytes.every((b, i) => buf[i] === b);
};

const SIGNATURE_CHECKS: Record<string, (head: Buffer) => boolean> = {
  "image/jpeg": (h) => h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  "image/png": (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": (h) => startsWith(h, [], "GIF87a") || startsWith(h, [], "GIF89a"),
  "image/webp": (h) =>
    h.length >= 12 && h.subarray(0, 4).toString("ascii") === "RIFF" && h.subarray(8, 12).toString("ascii") === "WEBP",
  "application/pdf": (h) => startsWith(h, [], "%PDF-"),
  "application/zip": (h) =>
    h.length >= 4 &&
    h[0] === 0x50 &&
    h[1] === 0x4b &&
    ((h[2] === 0x03 && h[3] === 0x04) || (h[2] === 0x05 && h[3] === 0x06) || (h[2] === 0x07 && h[3] === 0x08)),
  "application/x-zip-compressed": (h) =>
    h.length >= 4 &&
    h[0] === 0x50 &&
    h[1] === 0x4b &&
    ((h[2] === 0x03 && h[3] === 0x04) || (h[2] === 0x05 && h[3] === 0x06) || (h[2] === 0x07 && h[3] === 0x08)),
};

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

function discardFile(file?: Express.Multer.File): void {
  if (!file?.path) return;
  try {
    fs.unlinkSync(file.path);
  } catch {
    // الملف قد يكون محذوفًا مسبقًا — لا شيء إضافي
  }
}

// غلاف multer: يحوّل الأخطاء للمعالج المركزي، ويتحقق من محتوى الملف ويحذفه إن لم يطابق نوعه
export function multerSingle(
  field: string,
  instance: multer.Multer,
  sizeLimitLabel = "25 ميجابايت",
): (req: Request, res: unknown, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    instance.single(field)(req, res as never, (err?: unknown) => {
      if (err) {
        const message =
          err instanceof Error && (err.message.includes("الحد") || (err as { code?: string }).code === "LIMIT_FILE_SIZE")
            ? `حجم الملف يتجاوز ${sizeLimitLabel}`
            : err instanceof Error
              ? err.message
              : String(err);
        return next(badRequest(message));
      }

      const file = req.file;
      if (!file) return next();

      const check = SIGNATURE_CHECKS[file.mimetype];
      let matches = false;
      try {
        matches = !!check && check(readHead(file.path));
      } catch {
        matches = false;
      }
      if (!matches) {
        discardFile(file);
        return next(badRequest("محتوى الملف لا يطابق نوعه المعلن — أعد رفع ملف صورة/PDF/ZIP صحيح"));
      }
      next();
    });
  };
}
