import { PrismaClient } from "@prisma/client";

// مثيل واحد مشترك لكل التطبيق
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

process.on("beforeExit", () => {
  // eslint-disable-next-line no-console
  void prisma.$disconnect();
});
