// توليد slugs صديقة للروابط مع دعم الأحرف العربية
export function slugify(input: string): string {
  const base = input
    .trim()
    .replace(/[\s/\\]+/g, "-") // مسافات ومائل إلى شرطة
    .replace(/[^\p{L}\p{N}\-_]/gu, "") // إبقاء الحروف (بالعربية واللاتينية) والأرقام
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base.slice(0, 80) : "item";
}

// slug فريد ضمن جدول معين: إن كان مستخدمًا يُلحق برقم تسلسلي
export async function uniqueSlug(
  from: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(from);
  if (!(await exists(base))) return base;
  let i = 2;
  while (await exists(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
