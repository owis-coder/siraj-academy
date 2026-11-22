/**
 * أداة إعداد Google Drive — تعمل من سطر الأوامر فقط.
 *
 * الاستخدام:
 *   npx tsx scripts/google-drive-setup.ts encrypt "<refresh-token>"
 *       يشفّر التوكن بـ AES-256-GCM ويطبعه لإضافته إلى .env
 *   npx tsx scripts/google-drive-setup.ts check
 *       يفحص الاتصال والحساب والمساحة والوصول للمجلد الجذري
 *   npx tsx scripts/google-drive-setup.ts folders
 *       ينشئ/يتأكد من SIRAJ_ACADEMY ومجلدات STUDENTS/TEACHERS/ADMIN_DOCUMENTS
 *
 * لا يطبع أي توكن أو سر. لا يرفع أي ملف في وضع الفحص.
 */
import "dotenv/config";
import { encryptSecret, driveConfigStatus } from "../src/lib/googleDriveConfig";
import { getDriveService } from "../src/lib/googleDriveStorage";

async function main() {
  const [command, value] = process.argv.slice(2);

  if (command === "encrypt") {
    if (!value) {
            console.error('مرّر التوكن: npx tsx scripts/google-drive-setup.ts encrypt "<refresh-token>"');
      process.exit(1);
    }
    if (!process.env.FILE_TOKEN_ENCRYPTION_KEY) {
      console.error("FILE_TOKEN_ENCRYPTION_KEY غير مضبوط — أنشئه بالأمر: openssl rand -hex 32");
      process.exit(1);
    }
    const encrypted = encryptSecret(value);
    console.log("أضف هذا السطر إلى .env (ولا تشاركه):");
    console.log(`GOOGLE_DRIVE_REFRESH_TOKEN="${encrypted}"`);
    return;
  }

  const status = driveConfigStatus();
  if (!status.configured) {
    console.error("Google Drive غير مهيأ. المتغيرات الناقصة:", status.missing.join(", "));
    console.error("راجع docs/GOOGLE_OAUTH_SETUP.md");
    process.exit(1);
  }

  if (command === "check") {
    const health = await getDriveService().healthCheck();
    console.log(
      JSON.stringify(
        {
          ...health,
          quotaNote: health.quota
            ? {
                limitBytes: health.quota.limit ?? null,
                usageBytes: health.quota.usage ?? null,
              }
            : null,
        },
        null,
        2,
      ),
    );
    if (!health.ok) process.exit(2);
    return;
  }

  if (command === "folders") {
    const drive = getDriveService();
    const rootId = (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim();
    if (!rootId) {
      console.error("اضبط GOOGLE_DRIVE_ROOT_FOLDER_ID أولًا (مجلد SIRAJ_ACADEMY).");
      process.exit(1);
    }
    const root = await drive.getFile(rootId);
    console.log(`الجذر: ${root.name} (${root.id})`);
    for (const name of ["STUDENTS", "TEACHERS", "ADMIN_DOCUMENTS"]) {
      const folder = await drive.ensureFolder(name, rootId, { sirajRole: name });
      console.log(`- ${name}: ${folder.id}`);
    }
    console.log("تم. لم تُشارك أي مجلدات مع الجمهور.");
    return;
  }

  console.log("الأوامر: encrypt <token> | check | folders");
}

main().catch((err) => {
  console.error("فشل:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
