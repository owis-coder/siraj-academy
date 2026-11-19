// ============================================================
// وحدة تشفير أسرار المصادقة الثنائية (AES-256-GCM TOTP Cipher)
// توفر تشفيرًا متماثلاً قوياً للأسرار أثناء التخزين (At Rest)
// مع دعم الترقية التلقائية والرجوع المتوافق مع الصيغ القديمة.
// ============================================================
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const CURRENT_VERSION = "v1";
const IV_LENGTH = 12; // 96-bit recommended for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag

function getEncryptionKey(): Buffer {
  const rawKey = process.env.TOTP_ENCRYPTION_KEY;
  if (!rawKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TOTP_ENCRYPTION_KEY غير معرّف في بيئة الإنتاج");
    }
    // في بيئة التطوير، نشتق مفتاحًا متسقًا عبر SHA-256 من JWT_SECRET أو مفتاح افتراضي للتطوير
    const fallback = process.env.JWT_SECRET || "siraj-dev-totp-fallback-key-32b";
    return crypto.createHash("sha256").update(fallback).digest();
  }

  // إذا تم إدخاله كـ Hex (64 حرفاً = 32 بايت)
  if (/^[0-9a-fA-F]{64}$/.test(rawKey.trim())) {
    return Buffer.from(rawKey.trim(), "hex");
  }

  // إذا كان نصًا بأي طول، نشتق منه 32 بايت عبر SHA-256
  return crypto.createHash("sha256").update(rawKey).digest();
}

export const totpCipher = {
  /**
   * تشفير السر بصيغة Versioned Format:
   * v1:iv:ciphertext:tag (Base64 encoded parts)
   */
  encrypt(plainSecret: string): string {
    if (!plainSecret) return plainSecret;
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainSecret, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return [
      CURRENT_VERSION,
      iv.toString("base64"),
      encrypted.toString("base64"),
      tag.toString("base64"),
    ].join(":");
  },

  /**
   * فك تشفير السر مع التحقق الصارم من التوقيع (Tag)
   * يدعم الشفافية للقيم القديمة (Plaintext Base32) للتوافق وعدم كسر أي حساب
   */
  decrypt(storedData: string | null | undefined): string | null {
    if (!storedData) return null;

    // فحص ما إذا كان السر مشفرًا بالصيغة v1:iv:ciphertext:tag
    if (!storedData.startsWith(`${CURRENT_VERSION}:`)) {
      // صيغة قديمة غير مشفرة (Legacy Base32 Plaintext)
      return storedData;
    }

    const parts = storedData.split(":");
    if (parts.length !== 4) {
      throw new Error("تنسيق بيانات TOTP المشفرة غير صالح");
    }

    const [, ivB64, cipherB64, tagB64] = parts;

    try {
      const key = getEncryptionKey();
      const iv = Buffer.from(ivB64, "base64");
      const ciphertext = Buffer.from(cipherB64, "base64");
      const tag = Buffer.from(tagB64, "base64");

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString("utf8");
    } catch (err) {
      throw new Error("فشل فك تشفير سر TOTP: المفتاح غير مطابق أو تم التلاعب بالبيانات");
    }
  },

  /** فحص ما إذا كانت البيانات مشفرة بالصيغة الحالية */
  isEncrypted(data: string | null | undefined): boolean {
    if (!data) return false;
    return data.startsWith(`${CURRENT_VERSION}:`);
  },
};
