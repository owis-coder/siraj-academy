// ============================================================
// محرك المصادقة الثنائية (TOTP RFC 6238 & HOTP RFC 4226)
// مبني باستخدام Node.js crypto القياسي بنسبة 100% دون مكتبات خارجية غير موثوقة
// يدعم Google Authenticator وMicrosoft Authenticator ورموز الاسترجاع لمرة واحدة.
// ============================================================
import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(base32: string): Buffer {
  const cleaned = base32.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (val === -1) continue;

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateHotp(secretBuffer: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

export const totpService = {
  /**
   * توليد سر جديد للمصادقة الثنائية مع رابط otpauth القياسي لتطبيقات المصادقة
   */
  generateSecret(accountName: string, issuer: string = "Siraj Academy") {
    const randomBytes = crypto.randomBytes(20);
    const secret = base32Encode(randomBytes);
    const label = encodeURIComponent(`${issuer}:${accountName}`);
    const encodedIssuer = encodeURIComponent(issuer);
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    // تنسيق السر بمجموعات لسهولة القراءة اليدوية (e.g. ABCD EFGH ...)
    const formatted = secret.match(/.{1,4}/g)?.join(" ") || secret;

    return { secret, uri, otpauthUri: uri, formatted };
  },

  /**
   * توليد رمز التحقق الحالي (مفيد للاختبارات وللمحاكاة)
   */
  generateToken(secretBase32: string, timeStepOffset: number = 0): string {
    const secretBuffer = base32Decode(secretBase32);
    const currentStep = Math.floor(Date.now() / 1000 / 30) + timeStepOffset;
    return generateHotp(secretBuffer, currentStep);
  },

  /**
   * التحقق من الرمز المكون من 6 أرقام مع سماحية زمنية ±1 خطوة (90 ثانية إجمالاً)
   */
  verify(token: string, secretBase32: string, windowSteps: number = 1): boolean {
    if (!token || !secretBase32) return false;
    const cleanToken = token.trim().replace(/\s/g, "");
    if (!/^\d{6}$/.test(cleanToken)) return false;

    const secretBuffer = base32Decode(secretBase32);
    const currentStep = Math.floor(Date.now() / 1000 / 30);

    for (let step = -windowSteps; step <= windowSteps; step++) {
      const generated = generateHotp(secretBuffer, currentStep + step);
      if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(generated))) {
        return true;
      }
    }

    return false;
  },

  /**
   * توليد رموز استرجاع احتياطية (8 رموز مكونة من 10 خانات)
   */
  generateBackupCodes(count: number = 8) {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(5).toString("hex").toUpperCase();
      plainCodes.push(code);
      const hash = crypto.createHash("sha256").update(code).digest("hex");
      hashedCodes.push(hash);
    }

    return {
      plainCodes,
      hashedCodesJson: JSON.stringify(hashedCodes),
    };
  },

  /**
   * فحص واستهلاك رمز استرجاع احتياطي لمرة واحدة
   */
  consumeBackupCode(
    enteredCode: string,
    hashedCodesJson: string | null,
  ): { valid: boolean; remainingHashedJson: string | null } {
    if (!enteredCode || !hashedCodesJson) {
      return { valid: false, remainingHashedJson: hashedCodesJson };
    }

    try {
      const list = JSON.parse(hashedCodesJson) as string[];
      const enteredHash = crypto.createHash("sha256").update(enteredCode.trim().toUpperCase()).digest("hex");

      const idx = list.indexOf(enteredHash);
      if (idx !== -1) {
        list.splice(idx, 1); // استهلاك الرمز لمرة واحدة
        return { valid: true, remainingHashedJson: JSON.stringify(list) };
      }
    } catch {}

    return { valid: false, remainingHashedJson: hashedCodesJson };
  },
};
