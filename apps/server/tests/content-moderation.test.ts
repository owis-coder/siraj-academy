import { describe, it, expect } from "vitest";
import {
  moderateText,
  moderateFileName,
  normalizeForModeration,
  isYoutubeUrl,
} from "../src/lib/contentModeration";

/**
 * اختبارات وحدة لخدمة فحص المحتوى — لا تحتاج قاعدة بيانات.
 * تُشغَّل من apps/server:  npx vitest run tests/content-moderation.test.ts
 */
describe("normalizeForModeration", () => {
  it("converts Arabic-Indic and Extended Arabic-Indic digits", () => {
    expect(normalizeForModeration("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeForModeration("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("removes zero-width and tatweel characters", () => {
    expect(normalizeForModeration("تو\u200cاصل\u0640ني")).toBe("تواصلني");
  });
});

describe("moderateText — allowed content", () => {
  it("accepts normal Arabic course descriptions", () => {
    const r = moderateText("دورة متكاملة في قواعد البيانات تغطي SQL والتطبيع مع تمارين محلولة.");
    expect(r.status).toBe("APPROVED");
  });

  it("accepts normal English content", () => {
    const r = moderateText("An introduction to database design, normalization, and SQL joins.");
    expect(r.status).toBe("APPROVED");
  });

  it("does not treat course numbers or years as phone numbers", () => {
    expect(moderateText("مقرر CS 101 — المستوى الأول 2026").status).toBe("APPROVED");
    expect(moderateText("الرياضيات 2، الفصل 3، الوحدة 12").status).toBe("APPROVED");
  });
});

describe("moderateText — phone numbers", () => {
  it("rejects a local Saudi mobile number", () => {
    expect(moderateText("رقمي 0551234567").status).toBe("REJECTED");
  });

  it("rejects an international number with plus", () => {
    expect(moderateText("+966551234567").status).toBe("REJECTED");
  });

  it("rejects Arabic-Indic digits", () => {
    expect(moderateText("اتصل ٠٥٥١٢٣٤٥٦٧").status).toBe("REJECTED");
  });

  it("rejects numbers split by spaces or dashes", () => {
    expect(moderateText("055 123 4567").status).toBe("REJECTED");
    expect(moderateText("055-123-4567").status).toBe("REJECTED");
    expect(moderateText("05.51.23.45.67").status).toBe("REJECTED");
  });

  it("rejects numbers written with Arabic number words", () => {
    expect(
      moderateText("صفر خمسة خمسة واحد اثنان ثلاثة أربعة خمسة ستة سبعة").status,
    ).toBe("REJECTED");
  });
});

describe("moderateText — email", () => {
  it("rejects a plain email address", () => {
    expect(moderateText("راسلني على teacher@example.com").status).toBe("REJECTED");
  });

  it("rejects an obfuscated email address", () => {
    expect(moderateText("teacher [at] example [dot] com").status).toBe("REJECTED");
  });
});

describe("moderateText — social platforms and contact redirection", () => {
  it("rejects Telegram links", () => {
    expect(moderateText("انضم إلى https://t.me/siraj_channel").status).toBe("REJECTED");
  });

  it("rejects WhatsApp links", () => {
    expect(moderateText("https://wa.me/966551234567").status).toBe("REJECTED");
  });

  it("rejects Instagram handles near a platform name", () => {
    expect(moderateText("تابعني على انستقرام @teacher.name").status).toBe("REJECTED");
  });

  it("rejects contact-intent phrases", () => {
    expect(moderateText("تواصل معي على الخاص").status).toBe("REJECTED");
    expect(moderateText("راسلني خارج المنصة").status).toBe("REJECTED");
    expect(moderateText("contact me on my personal number").status).toBe("REJECTED");
  });

  it("flags a bare platform name for administrative review", () => {
    const r = moderateText("لمتابعة إضافية يمكنك البحث عن قناتي على تلجرام");
    expect(r.status).toBe("NEEDS_REVIEW");
    expect(r.reasons.some((x) => x.includes("SOCIAL_PLATFORM"))).toBe(true);
  });
});

describe("moderateText — links", () => {
  it("rejects a general external link", () => {
    expect(moderateText("زيارة https://example.com/course").status).toBe("REJECTED");
  });

  it("accepts a YouTube link only for administrative review", () => {
    const r = moderateText("https://www.youtube.com/watch?v=abc12345678");
    expect(r.status).toBe("NEEDS_REVIEW");
    expect(r.reasons).toContain("YOUTUBE_LINK_REQUIRES_REVIEW");
  });

  it("sends short links to review, not automatic publication", () => {
    const r = moderateText("https://bit.ly/3xYzAbC");
    expect(r.status).toBe("NEEDS_REVIEW");
    expect(r.reasons.some((x) => x.startsWith("SHORT_LINK"))).toBe(true);
  });
});

describe("moderateFileName", () => {
  it("accepts a normal academic file name", () => {
    expect(moderateFileName("chapter-1-notes.pdf").status).toBe("APPROVED");
  });

  it("rejects a file name carrying contact details", () => {
    expect(moderateFileName("whatsapp-0551234567.pdf").status).toBe("REJECTED");
    expect(moderateFileName("تواصل-معي.pdf").status).toBe("REJECTED");
  });
});

describe("isYoutubeUrl", () => {
  it("accepts valid YouTube URLs", () => {
    expect(isYoutubeUrl("https://www.youtube.com/watch?v=abc12345678")).toBe(true);
    expect(isYoutubeUrl("https://youtu.be/abc12345678")).toBe(true);
  });

  it("rejects non-YouTube and malformed URLs", () => {
    expect(isYoutubeUrl("https://vimeo.com/123456")).toBe(false);
    expect(isYoutubeUrl("javascript:alert(1)")).toBe(false);
    expect(isYoutubeUrl("not a url")).toBe(false);
  });
});
