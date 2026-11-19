// ============================================================
// حزمة الاختبارات الأمنية الشاملة لمنصة Siraj Academy
// Comprehensive Security Test Suite (Unit & Integration)
// ============================================================
import crypto from "crypto";
import { totpService } from "../src/lib/totp";
import { totpCipher } from "../src/lib/totpCipher";
import { signToken, verifyToken } from "../src/lib/jwt";
import { hashPassword, comparePassword, needsRehash } from "../src/lib/passwordSecurity";
import { isCloudflareIp, isLocalProxy, getSubnetIdentifier } from "../src/lib/ipShield";
import { recaptchaService } from "../src/lib/recaptcha";
import { ipBanService } from "../src/lib/ipBan";
import { getSecuritySettings, toggleEmergencyMode } from "../src/lib/securitySettings";
import { isDangerousExtension } from "../src/middleware/upload";
import { securityCache } from "../src/lib/redis";
import { prisma } from "../src/lib/prisma";
import { Role } from "@prisma/client";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: any) {
  if (condition) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m ${name}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m ${name}`, detail !== undefined ? detail : "");
    failed++;
  }
}

async function runSecuritySuite() {
  console.log("\n========================================================");
  console.log("   🚀 بدء فحص منظومة الحماية والأمان (Siraj Security Suite)");
  console.log("========================================================\n");

  // -------------------------------------------------------------------------
  // 1. اختبارات المصادقة الثنائية وتشفير الأسرار (TOTP RFC 6238 & AES-256-GCM)
  // -------------------------------------------------------------------------
  console.log("--- 1. اختبارات المصادقة الثنائية وتشفير الأسرار (TOTP & AES-256-GCM) ---");
  const testEmail = "test-sec@siraj.sa";
  const setup = totpService.generateSecret(testEmail, "Siraj Academy");

  assert("توليد مفتاح Base32 بطول لا يقل عن 16 حرفًا", setup.secret.length >= 16);
  assert("رابط otpauth يحمل البروتوكول والنطاق والبريد الصحيح",
    setup.otpauthUri.startsWith("otpauth://totp/") &&
    setup.otpauthUri.includes("test-sec%40siraj.sa") &&
    setup.otpauthUri.includes(`secret=${setup.secret}`)
  );

  // تشفير وفك تشفير السر عبر AES-256-GCM
  const encryptedSecret = totpCipher.encrypt(setup.secret);
  assert("تشفير السر بصيغة versioned v1:iv:ciphertext:tag", encryptedSecret.startsWith("v1:") && encryptedSecret.split(":").length === 4);
  assert("المفتاح المشفر لا يطابق النص الصريح", encryptedSecret !== setup.secret);
  assert("التعرف على التشفير عبر isEncrypted", totpCipher.isEncrypted(encryptedSecret) === true);

  const decryptedSecret = totpCipher.decrypt(encryptedSecret);
  assert("فك التشفير بنجاح ومطابق للسر الأصلي", decryptedSecret === setup.secret);

  // التوافق مع البيانات القديمة غير المشفرة (Legacy Base32 Plaintext)
  const legacySecret = "JBSWY3DPEHPK3PXP";
  assert("فك تشفير القيم القديمة يعيد النص الصريح بأمان دون كسر", totpCipher.decrypt(legacySecret) === legacySecret);

  // فحص رفض التلاعب في البيانات المشفرة (Tamper Resistance / AuthTag)
  const tampered = encryptedSecret.slice(0, -4) + "AAAA";
  let tamperCaught = false;
  try {
    totpCipher.decrypt(tampered);
  } catch {
    tamperCaught = true;
  }
  assert("رفض فك التشفير عند التلاعب في النص المشفر أو AuthTag", tamperCaught === true);

  // توليد رمز صحيح ومطابق للوقت الحالي
  const currentToken = totpService.generateToken(setup.secret);
  assert("توليد رمز مكون من 6 أرقام", /^\d{6}$/.test(currentToken));

  const isValidCurrent = totpService.verify(currentToken, setup.secret);
  assert("التحقق من صحة الرمز الحالي بنجاح", isValidCurrent === true);

  const isInvalidToken = totpService.verify("000000", setup.secret);
  assert("رفض الرمز الخاطئ أو العشوائي", isInvalidToken === false || currentToken === "000000");

  // اختبار رموز الاسترجاع الاحتياطية (Single-Use Backup Codes)
  const backupCodes = totpService.generateBackupCodes(8);
  assert("توليد 8 رموز استرجاع احتياطية فريدة", backupCodes.plainCodes.length === 8);

  const firstCode = backupCodes.plainCodes[0];
  const consumeRes1 = totpService.consumeBackupCode(firstCode, backupCodes.hashedCodesJson);
  assert("استهلاك رمز الاسترجاع لأول مرة بنجاح", consumeRes1.valid === true);

  // إعادة استخدام نفس الرمز يجب أن تفشل (Replay Attack Prevention)
  const consumeRes2 = totpService.consumeBackupCode(firstCode, consumeRes1.remainingHashedJson);
  assert("منع إعادة استخدام رمز الاسترجاع لمرة ثانية (Single-Use Guarantee)", consumeRes2.valid === false);

  // -------------------------------------------------------------------------
  // 2. اختبارات تذكرة المصادقة الثنائية (MFA Ticket Security)
  // -------------------------------------------------------------------------
  console.log("\n--- 2. اختبارات تذكرة المصادقة الثنائية (MFA Ticket Lifecycle) ---");
  const testUserId = "usr_test_" + Date.now();
  const mfaTicket = signToken(testUserId, Role.ADMIN, {
    sid: "mfa_pending",
    tokenType: "mfa_pending",
    expiresIn: "5m",
  });

  const verifiedTicket = verifyToken(mfaTicket);
  assert("التذكرة تحمل tokenType: mfa_pending صريح", verifiedTicket?.tokenType === "mfa_pending");
  assert("التذكرة مربوطة بحالة sid: mfa_pending", verifiedTicket?.sid === "mfa_pending");

  // فحص انتهاء صلاحية التذكرة (5 دقائق = 300 ثانية وليس 30 يوماً)
  const decodedRaw = JSON.parse(Buffer.from(mfaTicket.split(".")[1], "base64").toString("utf8"));
  const expiryWindowSec = decodedRaw.exp - decodedRaw.iat;
  assert("صلاحية تذكرة MFA محدودة بـ 5 دقائق (300 ثانية)", expiryWindowSec === 300);

  // -------------------------------------------------------------------------
  // 3. اختبارات تشفير كلمات المرور والترقية التلقائية
  // -------------------------------------------------------------------------
  console.log("\n--- 3. اختبارات تشفير كلمات المرور والترقية التلقائية ---");
  const plainPw = "SuperSecretPassword123!";
  const hash = await hashPassword(plainPw);

  assert("التجزئة بمعامل الصعوبة المتقدم 12 ($2a$12$ أو $2b$12$)", hash.startsWith("$2a$12$") || hash.startsWith("$2b$12$"));
  const pwMatches = await comparePassword(plainPw, hash);
  assert("التحقق من كلمة المرور المشفرة بنجاح", pwMatches === true);

  const pwMismatch = await comparePassword("WrongPassword123!", hash);
  assert("رفض كلمة المرور غير المطابقة", pwMismatch === false);

  assert("التجزئة الحالية لا تحتاج لإعادة تجزئة", needsRehash(hash) === false);
  const legacyHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  assert("اكتشاف التجزئات القديمة ذات المعامل الأقل (needsRehash = true)", needsRehash(legacyHash) === true);

  // -------------------------------------------------------------------------
  // 4. اختبارات حماية تزييف عناوين IP وشبكة Cloudflare (IP Shield)
  // -------------------------------------------------------------------------
  console.log("\n--- 4. اختبارات حماية تزييف عناوين IP وفلترة الوكلاء ---");
  assert("التعرف على نطاقات Cloudflare IPv4 (173.245.48.5)", isCloudflareIp("173.245.48.5") === true);
  assert("التعرف على نطاقات Cloudflare IPv4 (104.16.1.1)", isCloudflareIp("104.16.1.1") === true);
  assert("رفض عناوين خارجية عشوائية كـ Cloudflare (8.8.8.8)", isCloudflareIp("8.8.8.8") === false);

  assert("التعرف على شبكات الاستضافة المحلية والخاصة (127.0.0.1)", isLocalProxy("127.0.0.1") === true);
  assert("التعرف على شبكة خاصة فئة A (10.0.4.15)", isLocalProxy("10.0.4.15") === true);
  assert("التعرف على شبكة خاصة فئة C (192.168.1.100)", isLocalProxy("192.168.1.100") === true);
  assert("عدم اعتبار العناوين العامة كوكيل خاص (1.1.1.1)", isLocalProxy("1.1.1.1") === false);

  assert("عزل وتجميع عناوين IPv4 على مستوى العنوان المفرد لحماية شبكات الجامعات",
    getSubnetIdentifier("203.0.113.195") === "203.0.113.195"
  );
  assert("عزل وتجميع عناوين IPv6 على مستوى شبكة /64 الفرعية لمنع هجمات التوزيع",
    getSubnetIdentifier("2001:db8:abcd:0012:0000:0000:0000:0001") === "2001:db8:abcd:0012::/64"
  );

  // -------------------------------------------------------------------------
  // 5. اختبارات Google reCAPTCHA ومنع هجمات إعادة الرموز (Anti-Replay)
  // -------------------------------------------------------------------------
  console.log("\n--- 5. اختبارات Google reCAPTCHA ومكافحة إعادة الرموز ---");
  // رمز وهمي في وضع المحاكاة
  const simToken = "simulated_token_" + Date.now();
  const captchaCheck1 = await recaptchaService.verifyToken(simToken, "LOGIN", "127.0.0.1");
  assert("قبول الرمز في وضع المحاكاة بنتيجة مقبولة", captchaCheck1.success === true && (captchaCheck1.score ?? 0) >= 0.5);

  // إعادة نفس الرمز تمامًا (Replay Attack) يجب أن ترفض
  const captchaCheck2 = await recaptchaService.verifyToken(simToken, "LOGIN", "127.0.0.1");
  assert("صد هجوم إعادة استخدام نفس الرمز (Anti-Replay Protection)",
    captchaCheck2.success === false && captchaCheck2.reasons?.includes("REPLAY_TOKEN")
  );

  // فحص رفض رموز المحاكاة عند وضع الإنتاج (Production Fail-Safe)
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const prodSimCheck = await recaptchaService.verifyToken("test_captcha_valid_999", "LOGIN", "127.0.0.1");
    assert("رفض رموز المحاكاة الصورية في بيئة الإنتاج (Fail-Closed)",
      prodSimCheck.success === false && prodSimCheck.reasons?.includes("MOCK_FORBIDDEN_IN_PROD")
    );
  } finally {
    process.env.NODE_ENV = prevEnv;
  }

  // -------------------------------------------------------------------------
  // 6. اختبارات الحظر التلقائي واليدوي (IP Ban Engine)
  // -------------------------------------------------------------------------
  console.log("\n--- 6. اختبارات محرك حظر العناوين المشبوهة (IP Ban Service) ---");
  const testBadIp = "198.51.100.99";

  // التأكد من عدم حظره مسبقًا
  const initiallyBanned = (await ipBanService.isIpBlocked(testBadIp)).blocked;
  assert("العنوان غير محظور في البداية", initiallyBanned === false);

  // حظر العنوان لمدة 10 دقائق
  await ipBanService.banIp(testBadIp, "اختبار أمني آلي", 10, "SYSTEM_TEST");
  const isNowBanned = (await ipBanService.isIpBlocked(testBadIp)).blocked;
  assert("تطبيق الحظر الفوري بنجاح", isNowBanned === true);

  // رفع الحظر
  const unbanned = await ipBanService.unbanIp(testBadIp);
  assert("رفع الحظر بنجاح", unbanned === true);
  const afterUnban = (await ipBanService.isIpBlocked(testBadIp)).blocked;
  assert("تأكيد إزالة العنوان من قائمة الحظر", afterUnban === false);

  // -------------------------------------------------------------------------
  // 7. اختبارات وضع الطوارئ وخفض الحدود للنصف (Emergency Mode)
  // -------------------------------------------------------------------------
  console.log("\n--- 7. اختبارات وضع الطوارئ (Emergency Mode Dynamics) ---");
  // تفعيل وضع الطوارئ
  const turnedOn = await toggleEmergencyMode(true, "اختبار الطوارئ الآلي");
  assert("تفعيل وضع الطوارئ في الإعدادات", turnedOn.emergencyMode === true);

  // إلغاء وضع الطوارئ
  const turnedOff = await toggleEmergencyMode(false, "إنهاء الاختبار");
  assert("إلغاء وضع الطوارئ واستعادة الحالة الطبيعية", turnedOff.emergencyMode === false);

  // -------------------------------------------------------------------------
  // 8. اختبارات تصفية وحظر الملفات الخطرة والامتدادات القابلة للتنفيذ
  // -------------------------------------------------------------------------
  console.log("\n--- 8. اختبارات تصفية الملفات الخبيثة (Malicious Upload Guard) ---");
  assert("حظر الامتدادات القابلة للتنفيذ (.exe)", isDangerousExtension("malware.exe") === true);
  assert("حظر ملفات Shell Scripts (.sh)", isDangerousExtension("script.sh") === true);
  assert("حظر ملفات دفعات الأوامر (.bat)", isDangerousExtension("payload.bat") === true);
  assert("حظر سكريبتات PHP المرفوعة (.php)", isDangerousExtension("shell.php") === true);
  assert("حظر ملفات SVG القابلة لاحتواء XSS مخفي (.svg)", isDangerousExtension("vector.svg") === true);
  assert("حظر الامتدادات المزدوجة والتنكرية (.png.exe)", isDangerousExtension("invoice.png.exe") === true);
  assert("السماح بالامتدادات الآمنة المصرح بها (.pdf)", isDangerousExtension("document.pdf") === false);
  assert("السماح بالصور الآمنة (.jpg)", isDangerousExtension("photo.jpg") === false);
  assert("السماح بالصور الآمنة (.png)", isDangerousExtension("screenshot.png") === false);

  // -------------------------------------------------------------------------
  // النتائج النهائية
  // -------------------------------------------------------------------------
  console.log("\n========================================================");
  console.log(`   🏁 النتيجة النهائية للاختبارات: ${passed} ناجح | ${failed} فاشل`);
  console.log("========================================================\n");

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

void runSecuritySuite();
