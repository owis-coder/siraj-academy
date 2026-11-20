// ============================================================
// إعدادات مركز الأمن والحماية ووضع الطوارئ (Security Settings & Emergency Mode)
// يتحكم مركزيًا في إعدادات الحماية ويوفر كاش فوري لتفادي استهلاك قاعدة البيانات.
// ============================================================
import { prisma } from "./prisma";
import { securityCache } from "./redis";
import { audit } from "./audit";

export interface SecuritySettings {
  emergencyMode: boolean;
  rateLimitEnabled: boolean;
  recaptchaEnabled: boolean;
  recaptchaMode: "v2" | "v3" | "enterprise" | "simulated";
  recaptchaMinScore: number;
  autoBanEnabled: boolean;
  banDurationMinutes: number;
  failedLoginThreshold: number;
}

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  emergencyMode: process.env.EMERGENCY_MODE === "true",
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== "false",
  recaptchaEnabled: !!process.env.RECAPTCHA_SECRET_KEY,
  recaptchaMode: (process.env.RECAPTCHA_MODE as any) || (process.env.RECAPTCHA_SECRET_KEY ? "v3" : "simulated"),
  recaptchaMinScore: 0.5,
  autoBanEnabled: true,
  banDurationMinutes: 30,
  failedLoginThreshold: 5,
};

let cachedSettings: SecuritySettings | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10000; // 10 ثوانٍ كاش محلي

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const now = Date.now();
  if (cachedSettings && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedSettings;
  }

  // محاولة القراءة من Redis
  const redisVal = await securityCache.get("security:settings");
  if (redisVal) {
    try {
      const parsed: SecuritySettings = { ...DEFAULT_SECURITY_SETTINGS, ...JSON.parse(redisVal) };
      cachedSettings = parsed;
      lastFetchTime = now;
      return parsed;
    } catch {}
  }

  // القراءة من جدول الإعدادات
  try {
    const rows = await prisma.setting.findMany({
      where: {
        key: { startsWith: "sec_" },
      },
    });

    const dbMap: Record<string, string> = {};
    for (const r of rows) dbMap[r.key] = r.value;

    const merged: SecuritySettings = {
      emergencyMode: dbMap["sec_emergency_mode"] ? dbMap["sec_emergency_mode"] === "true" : DEFAULT_SECURITY_SETTINGS.emergencyMode,
      rateLimitEnabled: dbMap["sec_rate_limit_enabled"] ? dbMap["sec_rate_limit_enabled"] === "true" : DEFAULT_SECURITY_SETTINGS.rateLimitEnabled,
      recaptchaEnabled: dbMap["sec_recaptcha_enabled"] ? dbMap["sec_recaptcha_enabled"] === "true" : DEFAULT_SECURITY_SETTINGS.recaptchaEnabled,
      recaptchaMode: (dbMap["sec_recaptcha_mode"] as any) || DEFAULT_SECURITY_SETTINGS.recaptchaMode,
      recaptchaMinScore: dbMap["sec_recaptcha_min_score"] ? parseFloat(dbMap["sec_recaptcha_min_score"]) : DEFAULT_SECURITY_SETTINGS.recaptchaMinScore,
      autoBanEnabled: dbMap["sec_auto_ban_enabled"] ? dbMap["sec_auto_ban_enabled"] === "true" : DEFAULT_SECURITY_SETTINGS.autoBanEnabled,
      banDurationMinutes: dbMap["sec_ban_duration_minutes"] ? parseInt(dbMap["sec_ban_duration_minutes"], 10) : DEFAULT_SECURITY_SETTINGS.banDurationMinutes,
      failedLoginThreshold: dbMap["sec_failed_login_threshold"] ? parseInt(dbMap["sec_failed_login_threshold"], 10) : DEFAULT_SECURITY_SETTINGS.failedLoginThreshold,
    };

    cachedSettings = merged;
    lastFetchTime = now;
    await securityCache.set("security:settings", JSON.stringify(merged), 30);
    return merged;
  } catch {
    return DEFAULT_SECURITY_SETTINGS;
  }
}

export async function updateSecuritySettings(
  updates: Partial<SecuritySettings>,
  adminId?: string,
): Promise<SecuritySettings> {
  const current = await getSecuritySettings();
  const next = { ...current, ...updates };

  const dbEntries: Array<{ key: string; value: string }> = [
    { key: "sec_emergency_mode", value: String(next.emergencyMode) },
    { key: "sec_rate_limit_enabled", value: String(next.rateLimitEnabled) },
    { key: "sec_recaptcha_enabled", value: String(next.recaptchaEnabled) },
    { key: "sec_recaptcha_mode", value: String(next.recaptchaMode) },
    { key: "sec_recaptcha_min_score", value: String(next.recaptchaMinScore) },
    { key: "sec_auto_ban_enabled", value: String(next.autoBanEnabled) },
    { key: "sec_ban_duration_minutes", value: String(next.banDurationMinutes) },
    { key: "sec_failed_login_threshold", value: String(next.failedLoginThreshold) },
  ];

  for (const entry of dbEntries) {
    await prisma.setting.upsert({
      where: { key: entry.key },
      create: { key: entry.key, value: entry.value },
      update: { value: entry.value },
    });
  }

  cachedSettings = next;
  lastFetchTime = Date.now();
  await securityCache.set("security:settings", JSON.stringify(next), 300);

  // توثيق التغيير في سجل التدقيق الأمني
  await audit({
    userId: adminId,
    actorRole: "ADMIN",
    action: "SECURITY_SETTINGS_UPDATED",
    category: "SECURITY",
    result: "SUCCESS",
    oldValues: current as never,
    newValues: next as never,
  });

  return next;
}

export async function toggleEmergencyMode(
  enabled: boolean,
  reason?: string,
  adminId?: string,
): Promise<SecuritySettings> {
  const updated = await updateSecuritySettings({ emergencyMode: enabled }, adminId);

  await audit({
    userId: adminId,
    actorRole: "ADMIN",
    action: enabled ? "EMERGENCY_MODE_ACTIVATED" : "EMERGENCY_MODE_DEACTIVATED",
    category: "SECURITY",
    result: "SUCCESS",
    reason: reason || (enabled ? "تفعيل وضع الطوارئ من مركز الأمن" : "إلغاء وضع الطوارئ واستئناف الوضع الطبيعي"),
  });

  return updated;
}
