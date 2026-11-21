/**
 * ContentModerationService — خدمة مركزية لفحص المحتوى الذي ينشئه المستخدم
 * (خصوصًا المدرّس) لمنع نقل التواصل خارج المنصة.
 *
 * لا تعتمد على Regex بسيط فقط: تُطبّع النص أولًا (Unicode، الأرقام العربية/الهندية،
 * الرموز المخفية، الحروف المزخرفة، المسافات والفواصل) ثم تفحص عدة فئات.
 *
 * الحالات: APPROVED | NEEDS_REVIEW | REJECTED
 * - REJECTED: بيانات اتصال صريحة (هاتف/بريد/منصة/عبارة نقل التواصل) — يُمنع الحفظ.
 * - NEEDS_REVIEW: محتوى مشروع لكنه يحتاج قرار الإدارة (روابط YouTube، روابط قصيرة، أسماء منصات).
 */

export type ModerationStatus = "APPROVED" | "NEEDS_REVIEW" | "REJECTED";

export type ModerationCategory =
  | "PHONE"
  | "OBFUSCATED_CONTACT"
  | "EMAIL"
  | "SOCIAL_PLATFORM"
  | "CONTACT_PHRASE"
  | "EXTERNAL_LINK"
  | "SHORT_LINK"
  | "YOUTUBE_LINK"
  | "DISALLOWED_FILE";

export interface ModerationFinding {
  category: ModerationCategory;
  reason: string;
}

export interface ModerationResult {
  status: ModerationStatus;
  findings: ModerationFinding[];
  /** أكواد الأسباب للتسجيل في قاعدة البيانات */
  reasons: string[];
  /** مقتطف منقّح — لا يحتوي البيانات الحساسة كاملة */
  snippet?: string;
  normalized: string;
}

export interface ModerationOptions {
  /** حقول تحتوي روابط مسموحة أصلًا (مثل رابط مستندات يفحصه مسار آخر) */
  allowExternalLinks?: boolean;
  /** الروابط القصيرة: NEEDS_REVIEW (افتراضي) أو REJECTED */
  shortLinkStatus?: "NEEDS_REVIEW" | "REJECTED";
  /** نص قصير جدًا (اسم ملف) — لا نطبّق فحص العبارات عليه */
  shortField?: boolean;
}

// ---------- التطبيع ----------

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

const ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u061c]/g;
const TATWEEL = /\u0640/g;
const DIACRITICS = /[\u064b-\u065f\u0670]/g;

/** يحوّل الأرقام العربية والهندية إلى لاتينية ويطبّع النص */
export function normalizeForModeration(input: string | null | undefined): string {
  let s = String(input ?? "");
  try {
    s = s.normalize("NFKC");
  } catch {
    /* محرّكات قديمة — نكمل بدون NFKC */
  }
  s = s.replace(ZERO_WIDTH, "").replace(TATWEEL, "").replace(DIACRITICS, "");
  s = s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));
  s = s.replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_INDIC.indexOf(d)));

  // خرائط حروف/رموز شائعة للتحايل (تشابه بصري)
  s = s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[＠﹫]/g, "@")
    .replace(/[。｡]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/[／]/g, "/")
    .replace(/[＋]/g, "+")
    .replace(/[،؛]/g, (c) => (c === "،" ? "," : ";"));

  return s.toLowerCase();
}

// ---------- أنماط الفحص ----------

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const OBFUSCATED_EMAIL_RE =
  /[a-z0-9._%+-]+\s*(?:\[at\]|\(at\)|@|\bat\b)\s*[a-z0-9-]+(?:\s*(?:\[dot\]|\(dot\)|\.|dot)\s*[a-z0-9-]+)*\s*(?:\[dot\]|\(dot\)|\.|dot)\s*[a-z]{2,}/i;

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const BARE_DOMAIN_RE =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|me|ly|co|sa|info|xyz|link|site|online|app|dev|edu|store|shop|pro|club|cc|tv|fm)\b/gi;

const DIGIT_SEQUENCE_RE = /\+?\d(?:[\d\s\-._()\u00a0\u2013\u2014]{5,})\d/g;

const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com", "m.youtube.com"];
const SHORT_LINK_HOSTS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "cutt.ly",
  "is.gd",
  "rb.gy",
  "shorturl.at",
  "rebrand.ly",
  "linktr.ee",
  "tiny.cc",
  "ow.ly",
  "buff.ly",
  "s.id",
];
const SOCIAL_DOMAINS: Array<[RegExp, string]> = [
  [/t\.me|telegram\.(?:me|org|dog)/, "telegram"],
  [/wa\.me|whatsapp\.com|whatsapp\.net|api\.whatsapp\.com/, "whatsapp"],
  [/facebook\.com|fb\.me|fb\.com/, "facebook"],
  [/instagram\.com|instagr\.am/, "instagram"],
  [/snapchat\.com|snap\.com/, "snapchat"],
  [/tiktok\.com|vm\.tiktok\.com/, "tiktok"],
  [/discord\.(?:gg|com)/, "discord"],
  [/(?:twitter|x)\.com/, "twitter"],
  [/threads\.net/, "threads"],
  [/linkedin\.com/, "linkedin"],
];

const SOCIAL_NAMES: Array<[RegExp, string]> = [
  [/تليجرام|تلجرام|تليغرام|تيليغرام|تلغرام|telegram/i, "telegram"],
  [/واتس\s?اب|واتساب|واتس|whats\s?app|whatsapp/i, "whatsapp"],
  [/فيسبوك|فيس\s?بوك|facebook|فيس بوك/i, "facebook"],
  [/انستقرام|إنستقرام|انستغرام|إنستغرام|انستجرام|instagram|insta/i, "instagram"],
  [/سناب\s?شات|سنابchat|snapchat|snap\s?chat/i, "snapchat"],
  [/تيك\s?توك|tiktok/i, "tiktok"],
  [/ديسكورد|discord/i, "discord"],
  [/تويتر|twitter/i, "twitter"],
];

const CONTACT_PHRASES: Array<[RegExp, string]> = [
  [/تواصل\s*معي|تواصلوا\s*معي|تواصل\s*مباشر|راسلني|راسلوني|كلمني|كلموني|اتصل\s*بي|اتصلوا\s*بي|أضفني|اضفني|ضيفني|تابعني|تابعوني|حسابي\s*الشخصي|رقمي\s*الشخصي|بريدي\s*الشخصي|خارج\s*المنصة|خارج\s*الموقع|على\s*الخاص|الخاص\s*على/i, "contact_intent_ar"],
  [/my\s*(?:phone|number|email|whatsapp|telegram|account)|contact\s*me|message\s*me|dm\s*me|reach\s*me|text\s*me|call\s*me|follow\s*me|add\s*me|outside\s*the\s*platform|off\s*the\s*platform|personal\s*account/i, "contact_intent_en"],
];

const NUMBER_WORDS = new Map<string, number>([
  ["صفر", 0], ["واحد", 1], ["واحدة", 1], ["اثنان", 2], ["اثنين", 2], ["اثنتان", 2], ["ثلاثة", 3], ["ثلاث", 3],
  ["أربعة", 4], ["اربعة", 4], ["أربع", 4], ["خمسة", 5], ["خمس", 5], ["ستة", 6], ["ست", 6],
  ["سبعة", 7], ["سبع", 7], ["ثمانية", 8], ["ثمان", 8], ["تسعة", 9], ["تسع", 9],
  ["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9],
]);

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function hostOf(url: string): string {
  const cleaned = url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").split(/[/?#:]/)[0];
  return cleaned.toLowerCase();
}

function isYoutubeHost(host: string): boolean {
  return YOUTUBE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function isShortHost(host: string): boolean {
  return SHORT_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** أحرف/كلمات يمكن أن تُستخدم لكتابة رقم هاتف مجزأ */
function hasSpelledPhone(normalized: string): boolean {
  const tokens = normalized.split(/[^\p{L}\d]+/u).filter(Boolean);
  let run = 0;
  for (const token of tokens) {
    if (NUMBER_WORDS.has(token)) {
      run += 1;
      if (run >= 8) return true;
    } else if (/\d{2,}/.test(token)) {
      // أرقام لاتينية داخل الكلمات لا تكسر السلسلة — تُعد جزءًا من رقم مكتوب
      continue;
    } else {
      run = 0;
    }
  }
  return false;
}

function redactSnippet(input: string, max = 160): string {
  let s = String(input ?? "").replace(/[\u200b-\u200f\ufeff]/g, " ").trim();
  s = s.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[بريد محجوب]");
  s = s.replace(/\+?\d[\d\s\-._()]{6,}\d/g, "[رقم محجوب]");
  s = s.replace(/(https?:\/\/|www\.)\S+/gi, "[رابط محجوب]");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * فحص نص واحد.
 * يعيد الحالة والأسباب. لا يرمي استثناءً — القرار للمسار المستدعي.
 */
export function moderateText(input: string | null | undefined, options: ModerationOptions = {}): ModerationResult {
  const raw = String(input ?? "");
  const normalized = normalizeForModeration(raw);
  const findings: ModerationFinding[] = [];
  const push = (category: ModerationCategory, reason: string) => findings.push({ category, reason });

  if (!normalized.trim()) {
    return { status: "APPROVED", findings: [], reasons: [], normalized };
  }

  // ---------- البريد الإلكتروني ----------
  if (EMAIL_RE.test(normalized) || OBFUSCATED_EMAIL_RE.test(normalized)) {
    push("EMAIL", "EMAIL_ADDRESS");
  }

  // ---------- أرقام الهاتف ----------
  let phoneHit = false;
  for (const match of normalized.matchAll(DIGIT_SEQUENCE_RE)) {
    const digits = digitsOnly(match[0]);
    if (digits.length >= 9 && digits.length <= 15) {
      phoneHit = true;
      break;
    }
  }
  if (phoneHit) push("PHONE", "PHONE_NUMBER");
  if (hasSpelledPhone(normalized)) push("OBFUSCATED_CONTACT", "OBFUSCATED_SPELLED_OUT_NUMBERS");

  // أرقام مكتوبة بمسافات/شرطات كثيفة (>= 9 أرقام إجمالًا في سطر قصير)
  if (!phoneHit && normalized.trim().length <= 40 && /^[+\d\s\-._()]+$/.test(normalized.trim())) {
    const compact = digitsOnly(normalized);
    if (compact.length >= 9 && compact.length <= 15) {
      push("PHONE", "COMPACT_PHONE_LIKE_NUMBER");
    }
  }

  // ---------- الروابط ----------
  const urlMatches = [...normalized.matchAll(URL_RE)].map((m) => m[0]);
  const bareMatches = [...normalized.matchAll(BARE_DOMAIN_RE)].map((m) => m[0]);
  const allLinks = [...urlMatches, ...bareMatches];

  for (const link of allLinks) {
    const host = hostOf(link);
    if (!host) continue;

    const social = SOCIAL_DOMAINS.find(([re]) => re.test(host) || re.test(link));
    if (social) {
      push("SOCIAL_PLATFORM", `SOCIAL_DOMAIN_${social[1].toUpperCase()}`);
      continue;
    }
    if (isYoutubeHost(host)) {
      // روابط YouTube مسموحة مبدئيًا لكنها تحتاج اعتماد الإدارة قبل الظهور
      push("YOUTUBE_LINK", "YOUTUBE_LINK_REQUIRES_REVIEW");
      continue;
    }
    if (isShortHost(host)) {
      const shortStatus = options.shortLinkStatus ?? "NEEDS_REVIEW";
      push("SHORT_LINK", `SHORT_LINK_${shortStatus}`);
      continue;
    }
    if (!options.allowExternalLinks) {
      push("EXTERNAL_LINK", "EXTERNAL_LINK_NOT_ALLOWED");
    }
  }

  // معرّفات التواصل داخل النص: @handle مع كلمة منصة
  if (/(?:^|\s)@[a-z0-9_.]{3,}\b/i.test(normalized)) {
    const nearPlatform = SOCIAL_NAMES.some(([re]) => re.test(normalized));
    if (nearPlatform) push("SOCIAL_PLATFORM", "SOCIAL_HANDLE");
  }

  // ---------- أسماء منصات التواصل ----------
  if (!options.shortField) {
    for (const [re, name] of SOCIAL_NAMES) {
      if (re.test(normalized) && !findings.some((f) => f.reason === `SOCIAL_DOMAIN_${name.toUpperCase()}`)) {
        push("SOCIAL_PLATFORM", `SOCIAL_PLATFORM_NAME_${name.toUpperCase()}`);
      }
    }
    // ---------- عبارات نقل التواصل ----------
    for (const [re, reason] of CONTACT_PHRASES) {
      if (re.test(normalized)) push("CONTACT_PHRASE", reason.toUpperCase());
    }
  }

  const hasReject = findings.some((f) => isRejectReason(f.reason));
  const status: ModerationStatus = hasReject
    ? "REJECTED"
    : findings.length > 0
      ? "NEEDS_REVIEW"
      : "APPROVED";

  return {
    status,
    findings,
    reasons: [...new Set(findings.map((f) => f.reason))],
    snippet: status === "APPROVED" ? undefined : redactSnippet(raw),
    normalized,
  };
}

/** الأسباب التي تفرض الرفض القاطع */
export function isRejectReason(reason: string): boolean {
  if (reason.startsWith("SHORT_LINK_")) return reason.endsWith("REJECTED");
  if (reason === "EXTERNAL_LINK_NOT_ALLOWED") return true;
  if (reason.startsWith("YOUTUBE_LINK")) return false;
  if (reason.startsWith("SOCIAL_PLATFORM_NAME_")) return false; // اسم منصة فقط => مراجعة
  if (reason.startsWith("SOCIAL_HANDLE")) return false;
  return (
    reason.startsWith("EMAIL") ||
    reason.startsWith("PHONE") ||
    reason.startsWith("OBFUSCATED") ||
    reason.startsWith("COMPACT_PHONE") ||
    reason.startsWith("SOCIAL_DOMAIN_") ||
    reason.startsWith("CONTACT_INTENT") ||
    reason.startsWith("CONTACT_PHRASE") ||
    reason === "DISALLOWED_FILE"
  );
}

/** فحص اسم ملف مرفوع */
export function moderateFileName(name: string | null | undefined): ModerationResult {
  const result = moderateText(name, { shortField: true });
  const lower = String(name ?? "").toLowerCase();
  if (/(whatsapp|telegram|wa\.me|t\.me|اتصل|رقمي|تواصل|contact)/i.test(lower)) {
    result.findings.push({ category: "DISALLOWED_FILE", reason: "DISALLOWED_FILE_NAME" });
    result.reasons = [...new Set(result.findings.map((f) => f.reason))];
    result.status = "REJECTED";
  }
  return result;
}

/** يجمع نتائج عدة حقول في نتيجة واحدة */
export function mergeModerationResults(results: ModerationResult[]): ModerationResult {
  const findings = results.flatMap((r) => r.findings);
  const status: ModerationStatus = findings.some((f) => isRejectReason(f.reason))
    ? "REJECTED"
    : findings.length > 0
      ? "NEEDS_REVIEW"
      : "APPROVED";
  return {
    status,
    findings,
    reasons: [...new Set(findings.map((f) => f.reason))],
    snippet: results.find((r) => r.snippet)?.snippet,
    normalized: "",
  };
}

/** رسالة عربية/إنجليزية مفهومة للمستخدم تشرح سبب الرفض */
export function moderationUserMessage(result: ModerationResult): string {
  if (result.status === "APPROVED") return "";
  const categories = new Set(result.findings.map((f) => f.category));
  const parts: string[] = [];
  if (categories.has("PHONE") || categories.has("OBFUSCATED_CONTACT")) {
    parts.push("أرقام الهاتف / WhatsApp غير مسموح بها (Phone numbers are not allowed).");
  }
  if (categories.has("EMAIL")) parts.push("البريد الإلكتروني الشخصي غير مسموح (Personal email is not allowed).");
  if (categories.has("SOCIAL_PLATFORM")) {
    parts.push("روابط أو أسماء منصات التواصل غير مسموحة (Social media contacts are not allowed).");
  }
  if (categories.has("CONTACT_PHRASE")) {
    parts.push("عبارات نقل التواصل خارج المنصة غير مسموحة (Contact redirection is not allowed).");
  }
  if (categories.has("EXTERNAL_LINK")) {
    parts.push("الروابط الخارجية غير مسموحة (External links are not allowed).");
  }
  if (categories.has("SHORT_LINK")) parts.push("الروابط المختصرة تحتاج مراجعة الإدارة (Short links require review).");
  if (categories.has("YOUTUBE_LINK")) parts.push("روابط YouTube تحتاج اعتماد الإدارة (YouTube links require review).");
  if (categories.has("DISALLOWED_FILE")) parts.push("اسم الملف يحتوي على بيانات تواصل (File name contains contact details).");
  if (parts.length === 0) parts.push("المحتوى يحتاج مراجعة الإدارة (Content requires administrative review).");
  return `${parts.join(" · ")} — عدّل المحتوى وأعد المحاولة.`;
}

/** هل الرابط رابط YouTube صحيح؟ */
export function isYoutubeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return isYoutubeHost(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** هل الروابط كلها YouTube ومسموحة مبدئيًا؟ */
export function youtubeLinksFrom(text: string | null | undefined): string[] {
  const normalized = normalizeForModeration(text);
  const links = [...normalized.matchAll(URL_RE)].map((m) => m[0]);
  return links.filter((l) => isYoutubeHost(hostOf(l)));
}

export const ContentModerationService = {
  normalizeForModeration,
  moderateText,
  moderateFileName,
  mergeModerationResults,
  moderationUserMessage,
  isRejectReason,
  isYoutubeUrl,
  youtubeLinksFrom,
};

export default ContentModerationService;
