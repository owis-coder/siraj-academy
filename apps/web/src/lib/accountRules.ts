/* قواعد التحقق المعروضة في الواجهة — مطابقة لقواعد الخادم (الخادم هو المرجع النهائي).
   الدوال تُعيد مفاتيح ترجمة، وتُترجم في الواجهة عبر t(). */

export const FULL_NAME_RE = /^[\u0621-\u064Aa-zA-Z\s'’\u0640-]+$/;
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^(?:\+?9665\d{8}|05\d{8})$/;

export function fullNameError(name: string): string | null {
  const v = name.trim();
  if (v.length < 3) return 'validation.fullNameMin';
  if (v.length > 120) return 'validation.fullNameMax';
  if (!FULL_NAME_RE.test(v)) return 'validation.fullNameChars';
  return null;
}

export function usernameError(username: string): string | null {
  const v = username.trim();
  if (v.length < 3) return 'validation.usernameMin';
  if (v.length > 30) return 'validation.usernameMax';
  if (!USERNAME_RE.test(v)) return 'validation.usernameChars';
  return null;
}

export interface PasswordCheck {
  key: string;
  labelKey: string;
  ok: boolean;
}

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { key: 'len', labelKey: 'validation.pwLen', ok: pw.length >= 9 },
    { key: 'upper', labelKey: 'validation.pwUpper', ok: /[A-Z]/.test(pw) },
    { key: 'lower', labelKey: 'validation.pwLower', ok: /[a-z]/.test(pw) },
    { key: 'digit', labelKey: 'validation.pwDigit', ok: /[0-9]/.test(pw) },
    { key: 'charset', labelKey: 'validation.pwCharset', ok: /^[A-Za-z0-9]+$/.test(pw) && pw.length > 0 },
  ];
}

export function isPasswordValid(pw: string): boolean {
  return passwordChecks(pw).every((c) => c.ok);
}

/** استنتاج المتصفح ونظام التشغيل — تقديري؛ تُعرض أسماء عامة دون ذكر التقنية */
export function describeUserAgent(ua: string | null | undefined): { browserKey: string; osKey: string; deviceKey: string } {
  if (!ua) return { browserKey: 'device.unknown', osKey: 'device.unknown', deviceKey: 'device.unknown' };
  const browserKey = /Edg\//.test(ua)
    ? 'device.browser.edge'
    : /OPR\/|Opera/.test(ua)
      ? 'device.browser.opera'
      : /Firefox\//.test(ua)
        ? 'device.browser.firefox'
        : /Chrome\//.test(ua)
          ? 'device.browser.chrome'
          : /Safari\//.test(ua)
            ? 'device.browser.safari'
            : 'device.browser.other';
  const osKey = /Windows NT/.test(ua)
    ? 'device.os.windows'
    : /Android/.test(ua)
      ? 'device.os.android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'device.os.ios'
        : /Mac OS X/.test(ua)
          ? 'device.os.macos'
          : /Linux/.test(ua)
            ? 'device.os.linux'
            : 'device.unknown';
  const deviceKey = /Mobile|Android|iPhone/.test(ua)
    ? 'device.type.phone'
    : /iPad|Tablet/.test(ua)
      ? 'device.type.tablet'
      : 'device.type.desktop';
  return { browserKey, osKey, deviceKey };
}
