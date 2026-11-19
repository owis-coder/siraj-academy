import bcrypt from "bcryptjs";

// bcrypt بتكلفة 12 (مناسبة لكلمات المرور). رفعها لا يُبطل التجزئات القديمة
// لأن التكلفة محفوظة داخل التجزئة نفسها ويحسبها bcrypt تلقائيًا عند التحقق.
const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
