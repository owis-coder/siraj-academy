import crypto from "crypto";

/**
 * إعداد Google Drive + تشفير Refresh Token.
 *
 * لا تُطبع أي قيمة سرية من هذا الملف — الدوال تُعيد حالة الإعداد فقط.
 * الصلاحية المطلوبة: https://www.googleapis.com/auth/drive.file
 * (وصول إلى الملفات التي أنشأها التطبيق فقط، وليس كل محتوى الحساب).
 */

const ENC_PREFIX = "enc:v1:";

export type DriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  rootFolderId: string | null;
  sharedDriveId: string | null;
  uploadChunkSizeBytes: number;
};

function encryptionKey(): Buffer | null {
  const raw = process.env.FILE_TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  if (!/^[a-fA-F0-9]{64}$/.test(raw.trim())) return null;
  return Buffer.from(raw.trim(), "hex");
}

/** تشفير Refresh Token (AES-256-GCM) — يُستخدم في سكربت الإعداد فقط */
export function encryptSecret(plain: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("FILE_TOKEN_ENCRYPTION_KEY غير مضبوط أو ليس 64 حرفًا Hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** فك تشفير Secret — يدعم القيم غير المشفرة للتطوير المحلي فقط */
export function decryptSecret(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value;
  const key = encryptionKey();
  if (!key) throw new Error("FILE_TOKEN_ENCRYPTION_KEY مطلوب لفك تشفير الرمز");
  const [ivB64, tagB64, payloadB64] = value.slice(ENC_PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !payloadB64) throw new Error("صيغة الرمز المشفر غير صحيحة");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payloadB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

/** حالة الإعداد — بلا أسرار */
export function driveConfigStatus(): {
  configured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasRefreshToken: boolean;
  hasEncryptionKey: boolean;
  refreshTokenEncrypted: boolean;
  hasRootFolderId: boolean;
  missing: string[];
} {
  const clientId = (process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const refreshTokenRaw = (process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim();
  const hasEncryptionKey = !!encryptionKey();
  const refreshTokenEncrypted = refreshTokenRaw.startsWith(ENC_PREFIX);

  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_DRIVE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_DRIVE_CLIENT_SECRET");
  if (!refreshTokenRaw) missing.push("GOOGLE_DRIVE_REFRESH_TOKEN");
  if (refreshTokenEncrypted && !hasEncryptionKey) missing.push("FILE_TOKEN_ENCRYPTION_KEY");

  return {
    configured: missing.length === 0,
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    hasRefreshToken: !!refreshTokenRaw,
    hasEncryptionKey,
    refreshTokenEncrypted,
    hasRootFolderId: !!(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim(),
    missing,
  };
}

export function readDriveConfig(): DriveConfig {
  const status = driveConfigStatus();
  if (!status.configured) {
    throw new Error(`Google Drive غير مهيأ — متغيرات ناقصة: ${status.missing.join(", ")}`);
  }
  const refreshTokenRaw = (process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim();
  const chunkMb = Number(process.env.GOOGLE_DRIVE_UPLOAD_CHUNK_MB || 8);
  return {
    clientId: (process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: (process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    refreshToken: decryptSecret(refreshTokenRaw),
    rootFolderId: (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim() || null,
    sharedDriveId: (process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID || "").trim() || null,
    // الحد الأدنى في Drive هو 256KB ومضاعفات 256KB
    uploadChunkSizeBytes: Math.max(256 * 1024, Math.floor(chunkMb * 1024 * 1024 / (256 * 1024)) * 256 * 1024),
  };
}
