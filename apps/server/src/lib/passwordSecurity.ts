// ============================================================
// أمان كلمات المرور والترقية الشفافة (Password Security & Hash Upgrade)
// يرفع معامل الصعوبة لـ Bcrypt (Cost 12) ويدعم الترقية التلقائية الشفافة
// دون إبطال كلمات المرور الحالية أو فقد أي حساب.
// ============================================================
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const UPGRADED_ROUNDS = 12;

export const passwordService = {
  /** تشفير كلمة مرور جديدة بمعامل أمان متقدم (12 Rounds) */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, UPGRADED_ROUNDS);
  },

  /**
   * مطابقة كلمة المرور مع دعم الترقية التلقائية للهاش عند تسجيل الدخول الناجح
   */
  async verifyAndUpgrade(
    plain: string,
    hash: string,
    userId?: string,
  ): Promise<{ matches: boolean; upgraded: boolean }> {
    const matches = await bcrypt.compare(plain, hash);
    if (!matches) {
      return { matches: false, upgraded: false };
    }

    // فحص ما إذا كان الهاش يحتاج ترقية لمعامل الصعوبة الأحدث (12)
    // تجزئة Bcrypt تحتوي على عدد الجولات في المقطع الثاني: $2a$10$... أو $2b$12$...
    const roundsMatch = hash.match(/^\$2[aby]\$(\d+)\$/);
    const currentRounds = roundsMatch ? parseInt(roundsMatch[1], 10) : 10;

    let upgraded = false;
    if (userId && currentRounds < UPGRADED_ROUNDS) {
      try {
        const newHash = await bcrypt.hash(plain, UPGRADED_ROUNDS);
        await prisma.user.update({
          where: { id: userId },
          data: { passwordHash: newHash },
        });
        upgraded = true;
      } catch {
        // فشل الترقية لا يعطل تسجيل الدخول
      }
    }

    return { matches: true, upgraded };
  },
};

export function needsRehash(hash: string): boolean {
  const match = hash.match(/^\$2[aby]\$(\d+)\$/);
  const currentRounds = match ? parseInt(match[1], 10) : 10;
  return currentRounds < UPGRADED_ROUNDS;
}

export async function hashPassword(plain: string): Promise<string> {
  return passwordService.hash(plain);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
