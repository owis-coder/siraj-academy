import crypto from "crypto";

// خوارزمية التشفير المعتمدة للبيانات البنكية
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12 بايت لـ GCM
const AUTH_TAG_LENGTH = 16;

/**
 * جلب مفتاح التشفير 256 بت من متغيرات البيئة.
 * إذا لم يكن معرفًا في بيئة التطوير، يتم اشتقاق مفتاح ثابت ومؤمن لمنع الانهيار.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.FINANCE_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      // 64-char hex string
      return Buffer.from(envKey, "hex");
    }
    return crypto.createHash("sha256").update(envKey).digest();
  }
  // مفتاح اشتقاق بديل لبيئة التطوير والاختبار المحلي
  const fallbackSecret = process.env.JWT_SECRET || "siraj-financial-secure-encryption-seed-2026";
  return crypto.createHash("sha256").update(fallbackSecret).digest();
}

/**
 * تشفير النص العادي (مثل IBAN أو رقم الحساب)
 * النتيجة بصيغة: iv:authTag:ciphertext (Base64)
 */
export function encryptBankDetail(plainText: string): string {
  if (!plainText || typeof plainText !== "string") {
    throw new Error("قيمة غير صالحة للتشفير");
  }
  const trimmed = plainText.trim().replace(/\s+/g, "");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  const encrypted = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * فك تشفير النص المشفر
 */
export function decryptBankDetail(encryptedData: string): string {
  if (!encryptedData || typeof encryptedData !== "string") {
    throw new Error("بيانات مشفرة غير صالحة");
  }
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("تنسيق البيانات المشفرة غير مطابق لمعيار AES-256-GCM");
  }

  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = Buffer.from(parts[2], "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * قناع الآيبان لحماية الخصوصية في واجهات العرض (Masking)
 * مثال: SA1234567890123456789012 -> SA****************9012
 */
export function maskIban(iban: string): string {
  if (!iban) return "";
  const cleaned = iban.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length < 8) return cleaned;
  const prefix = cleaned.slice(0, 2); // مثل SA
  const suffix = cleaned.slice(-4);   // آخر 4 أرقام
  const stars = "*".repeat(cleaned.length - 6);
  return `${prefix}${stars}${suffix}`;
}

/**
 * قناع رقم الحساب البنكي
 */
export function maskAccountNumber(acc: string): string {
  if (!acc) return "";
  const cleaned = acc.replace(/\s+/g, "");
  if (cleaned.length <= 4) return cleaned;
  const suffix = cleaned.slice(-4);
  const stars = "*".repeat(cleaned.length - 4);
  return `${stars}${suffix}`;
}
