import { prisma } from "./prisma";

// توليد رقم طلب فريد بصيغة SRJ-2026-000123
// يعتمد على عدد طلبات السنة الحالية ثم يتحقق من عدم التعارض (رقم orderNo فريد)
export async function nextOrderNo(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await prisma.order.count({
      where: { orderNo: { startsWith: `SRJ-${year}-` } },
    });
    const candidate = `SRJ-${year}-${String(count + 1).padStart(6, "0")}`;
    const exists = await prisma.order.findUnique({ where: { orderNo: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  // مخرج أمان نادر (تعارض بسبب طلبات متزامنة): طابع زمني
  return `SRJ-${year}-${Date.now().toString().slice(-6)}`;
}
