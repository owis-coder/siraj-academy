import { ensureFinancialAccountsExist } from "../src/lib/ledgerService";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== بدء بذر الحسابات المالية الافتراضية ===");
  await ensureFinancialAccountsExist();
  const accounts = await prisma.financialAccount.findMany({ orderBy: { code: "asc" } });
  console.log(`تم التحقق من الحسابات المالية (العدد: ${accounts.length}):`);
  for (const a of accounts) {
    console.log(`  [${a.code}] ${a.nameAr} (${a.type})`);
  }
}

main()
  .catch((e) => {
    console.error("خطأ أثناء بذر الحسابات:", e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
