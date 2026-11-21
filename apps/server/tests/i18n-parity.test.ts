import { describe, it, expect } from "vitest";
import ar from "../../web/src/i18n/ar.json";
import en from "../../web/src/i18n/en.json";

/**
 * يضمن أن كل مفتاح ترجمة موجود في العربية له مقابل إنجليزي والعكس،
 * حتى لا تظهر نصوص خام أو مفاتيح ناقصة عند تبديل اللغة.
 */
describe("i18n parity (ar/en)", () => {
  const arKeys = new Set(Object.keys(ar as Record<string, string>));
  const enKeys = new Set(Object.keys(en as Record<string, string>));

  it("has no keys missing from English", () => {
    const missing = [...arKeys].filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("has no keys missing from Arabic", () => {
    const missing = [...enKeys].filter((k) => !arKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("contains the offering review statuses in both languages", () => {
    for (const key of ["status.offering.NEEDS_REVISION", "status.offering.PENDING_REVIEW", "status.offering.PUBLISHED"]) {
      expect((ar as Record<string, string>)[key]).toBeTruthy();
      expect((en as Record<string, string>)[key]).toBeTruthy();
    }
  });
});
