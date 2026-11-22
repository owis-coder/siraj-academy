import { describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
  ALLOWED_EXTENSIONS,
  buildStoredFileName,
  categoryAllowedForRole,
  contentMatchesExtension,
  sanitizeOriginalFileName,
  validateUploadedFile,
} from "../src/lib/fileSecurity";
import { decryptSecret, encryptSecret, driveConfigStatus } from "../src/lib/googleDriveConfig";
import { buildUserFolderName } from "../src/lib/driveFolders";

function tempFile(name: string, bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "siraj-file-test-"));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]);

describe("file naming", () => {
  it("يحافظ على الامتداد ويضيف التاريخ وUUID", () => {
    const stored = buildStoredFileName("Lecture Notes.pdf", new Date("2026-11-22T14:35:20Z"));
    expect(stored).toMatch(/^Lecture Notes_2026-11-22_14-35-20_[0-9a-f-]{36}\.pdf$/);
  });

  it("يمنع Path Traversal في الاسم الأصلي", () => {
    const clean = sanitizeOriginalFileName("../../etc/passwd.pdf");
    expect(clean).not.toContain("/");
    expect(clean).not.toContain("\\");
    expect(clean.endsWith(".pdf")).toBe(true);
  });

  it("يبقي الحروف العربية وينظّف المحارف الخطرة", () => {
    const clean = sanitizeOriginalFileName("ملخص: المحاضرة <1>.pdf");
    expect(clean).toContain("ملخص");
    expect(clean).not.toContain(":");
    expect(clean).not.toContain("<");
  });

  it("لا ينتج نفس الاسم مرتين لنفس الملف", () => {
    const a = buildStoredFileName("same.pdf");
    const b = buildStoredFileName("same.pdf");
    expect(a).not.toBe(b);
  });
});

describe("content signature validation", () => {
  it("يقبل PDF ببصمة صحيحة", () => {
    expect(contentMatchesExtension(".pdf", PDF.subarray(0, 16))).toBe(true);
  });
  it("يرفض PDF يحمل محتوى آخر", () => {
    expect(contentMatchesExtension(".pdf", Buffer.from("<html>hello</html>"))).toBe(false);
  });
  it("يقبل PNG", () => {
    expect(contentMatchesExtension(".png", PNG.subarray(0, 16))).toBe(true);
  });
  it("يعامل DOCX/PPTX/XLSX كأرشيف ZIP", () => {
    expect(contentMatchesExtension(".docx", ZIP.subarray(0, 16))).toBe(true);
    expect(contentMatchesExtension(".pdf", ZIP.subarray(0, 16))).toBe(false);
  });
  it("يرفض الملفات التنفيذية", () => {
    expect(ALLOWED_EXTENSIONS.has(".exe")).toBe(false);
    expect(ALLOWED_EXTENSIONS.has(".js")).toBe(false);
    expect(ALLOWED_EXTENSIONS.has(".svg")).toBe(false);
  });
});

describe("upload validation", () => {
  it("يرفض امتدادًا غير مسموح", async () => {
    const p = tempFile("malware.exe", Buffer.from("MZ"));
    const result = await validateUploadedFile({ path: p, originalname: "malware.exe", mimetype: "application/octet-stream", size: 2 });
    expect(result.ok).toBe(false);
  });

  it("يرفض محتوى لا يطابق الامتداد المعلن", async () => {
    const p = tempFile("fake.pdf", Buffer.from("not a pdf at all"));
    const result = await validateUploadedFile({ path: p, originalname: "fake.pdf", mimetype: "application/pdf", size: 17 });
    expect(result.ok).toBe(false);
  });

  it("يقبل PDF حقيقيًا", async () => {
    const p = tempFile("real.pdf", PDF);
    const result = await validateUploadedFile({ path: p, originalname: "real.pdf", mimetype: "application/pdf", size: PDF.length });
    expect(result.ok).toBe(true);
  });

  it("يرفض ملفًا أكبر من الحد", async () => {
    const p = tempFile("big.pdf", PDF);
    const result = await validateUploadedFile({
      path: p,
      originalname: "big.pdf",
      mimetype: "application/pdf",
      size: 10 * 1024 * 1024 * 1024,
    });
    expect(result.ok).toBe(false);
  });
});

describe("category permissions", () => {
  it("الطالب لا يستطيع استخدام تصنيفات المدرس", () => {
    expect(categoryAllowedForRole("STUDENT", "PAYMENTS")).toBe(true);
    expect(categoryAllowedForRole("STUDENT", "COURSE_MATERIALS")).toBe(false);
  });
  it("المدرس لا يستطيع استخدام مجلد مدفوعات الطالب", () => {
    expect(categoryAllowedForRole("TEACHER", "PAYMENTS")).toBe(false);
    expect(categoryAllowedForRole("TEACHER", "LESSON_FILES")).toBe(true);
  });
  it("الأدمن يستطيع كل التصنيفات", () => {
    expect(categoryAllowedForRole("ADMIN", "PAYMENTS")).toBe(true);
    expect(categoryAllowedForRole("ADMIN", "ASSIGNMENT_MATERIALS")).toBe(true);
  });
});

describe("folder naming and uniqueness", () => {
  it("يبني اسم المجلد بالمعرّف الثابت", () => {
    const name = buildUserFolderName({ id: "clx1234567890", fullName: "Owis Mohammad", username: "lo0py0ol", role: "STUDENT" });
    expect(name).toMatch(/^Owis_Mohammad_lo0py0ol_STU/);
    expect(name).toContain("clx1234567890".slice(-8));
  });

  it("يفرّق بين اسمين متشابهين بمعرّف مختلف", () => {
    const a = buildUserFolderName({ id: "aaaa11112222", fullName: "محمد علي", username: "moh", role: "STUDENT" });
    const b = buildUserFolderName({ id: "bbbb33334444", fullName: "محمد علي", username: "moh", role: "STUDENT" });
    expect(a).not.toBe(b);
  });
});

describe("OAuth token encryption", () => {
  it("يشفّر ويفك التشفير دون إظهار القيمة", () => {
    process.env.FILE_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    const encrypted = encryptSecret("1//refresh-token-value");
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(encrypted).not.toContain("refresh-token-value");
    expect(decryptSecret(encrypted)).toBe("1//refresh-token-value");
  });

  it("لا يفك تشفيرًا بمفتاح مختلف", () => {
    process.env.FILE_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    const encrypted = encryptSecret("secret");
    process.env.FILE_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it("لا يعرض حالة الإعداد أي سر", () => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "id.apps.googleusercontent.com";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "super-secret";
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "token-value";
    const status = driveConfigStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("token-value");
    expect(status.configured).toBe(true);
  });
});
