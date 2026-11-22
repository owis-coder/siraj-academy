import { prisma } from "./prisma";
import { getDriveService } from "./googleDriveStorage";
import { sanitizeOriginalFileName } from "./fileSecurity";

/**
 * إدارة مجلدات Drive لكل مستخدم:
 * SIRAJ_ACADEMY/{STUDENTS|TEACHERS|ADMIN_DOCUMENTS}/{UserFolder}/{CATEGORY}
 *
 * - المجلد يُنشأ مرة واحدة ويُخزَّن معرّفه في UserDriveFolder (Unique على userId+folderType).
 * - اسم المجلد يحمل معرّف قاعدة البيانات الثابت لمنع تعارض الأسماء المتشابهة.
 * - لا يستطيع المستخدم تحديد Parent Folder ID إطلاقًا.
 */

const MAIN_ROOT_NAME = "SIRAJ_ACADEMY";

function slugPart(value: string, max = 40): string {
  const cleaned = sanitizeOriginalFileName(value)
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\u0600-\u06FF-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned.slice(0, max) || "User";
}

export function buildUserFolderName(user: { id: string; fullName: string; username: string; role: string }): string {
  const prefix = user.role === "TEACHER" ? "TCH" : user.role === "ADMIN" ? "ADM" : "STU";
  return `${slugPart(user.fullName)}_${slugPart(user.username, 24)}_${prefix}${user.id.slice(-8)}`;
}

function roleRoot(folderType: "STUDENTS" | "TEACHERS" | "ADMIN_DOCUMENTS"): "STUDENTS" | "TEACHERS" | "ADMIN_DOCUMENTS" {
  return folderType;
}

/** الجذر الرئيسي: إما معرّف مضبوط في البيئة أو إنشاء/العثور على SIRAJ_ACADEMY في My Drive */
async function ensureMainRoot(drive: ReturnType<typeof getDriveService>): Promise<{ id: string }> {
  const configured = (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim();
  if (configured) return { id: configured };

  // بلا معرّف جذر: نبحث في My Drive ثم ننشئ. (مفضّل ضبط المعرّف لتفادي إنشاء جذر مكرر.)
  const found = await drive.findFolder(MAIN_ROOT_NAME, null);
  if (found) return { id: found.id };
  const created = await drive.createFolder(MAIN_ROOT_NAME, "root", { sirajRole: "ROOT" });
  return { id: created.id };
}

const roleRootCache = new Map<string, string>();

async function ensureRoleRoot(
  drive: ReturnType<typeof getDriveService>,
  role: "STUDENT" | "TEACHER" | "ADMIN",
  mainRootId: string,
): Promise<string> {
  const key = roleRoot(role === "STUDENT" ? "STUDENTS" : role === "TEACHER" ? "TEACHERS" : "ADMIN_DOCUMENTS");
  const cached = roleRootCache.get(key);
  if (cached) return cached;
  const folder = await drive.ensureFolder(key, mainRootId, { sirajRole: key });
  roleRootCache.set(key, folder.id);
  return folder.id;
}

/** المجلد الشخصي للمستخدم (مرة واحدة) */
export async function getOrCreateUserFolder(userId: string): Promise<{
  driveFolderId: string;
  folderName: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, username: true, role: true },
  });
  if (!user) throw new Error("المستخدم غير موجود");
  const role = user.role as "STUDENT" | "TEACHER" | "ADMIN";

  const existing = await prisma.userDriveFolder.findFirst({
    where: { userId, folderType: role === "STUDENT" ? "STUDENTS" : role === "TEACHER" ? "TEACHERS" : "ADMIN_DOCUMENTS" },
  });
  if (existing) {
    return { driveFolderId: existing.driveFolderId, folderName: buildUserFolderName(user), role };
  }

  const drive = getDriveService();
  const mainRoot = await ensureMainRoot(drive);
  const parentId = await ensureRoleRoot(drive, role, mainRoot.id);
  const folderName = buildUserFolderName(user);
  const folder = await drive.ensureFolder(folderName, parentId, {
    sirajUserId: user.id,
    sirajRole: role,
  });

  const row = await prisma.userDriveFolder
    .create({
      data: {
        userId,
        userRole: role,
        folderType: role === "STUDENT" ? "STUDENTS" : role === "TEACHER" ? "TEACHERS" : "ADMIN_DOCUMENTS",
        driveFolderId: folder.id,
        parentFolderId: parentId,
      },
    })
    .catch(async (err: unknown) => {
      // تسابق على نفس المستخدم — نقرأ السجل الذي أنشأه طلب آخر
      if ((err as { code?: string })?.code === "P2002") {
        const again = await prisma.userDriveFolder.findFirst({ where: { userId } });
        if (again) return again;
      }
      throw err;
    });

  return { driveFolderId: row.driveFolderId, folderName, role };
}

/** المجلد الفرعي للتصنيف داخل مجلد المستخدم */
export async function getOrCreateCategoryFolder(
  userId: string,
  category: "PAYMENTS" | "MAIN_FILES" | "CUSTOM_REQUESTS" | "PRIVATE_EXPLANATIONS" | "COURSE_ATTACHMENTS" | "OTHER_ATTACHMENTS" | "COURSE_MATERIALS" | "LESSON_FILES" | "VIDEO_REFERENCES" | "SERVICE_ATTACHMENTS" | "ASSIGNMENT_MATERIALS",
): Promise<string> {
  const existing = await prisma.userDriveFolder.findFirst({
    where: { userId, folderType: category },
  });
  if (existing) return existing.driveFolderId;

  const parent = await getOrCreateUserFolder(userId);
  const drive = getDriveService();
  const folder = await drive.ensureFolder(category, parent.driveFolderId, {
    sirajUserId: userId,
    sirajCategory: category,
  });

  const row = await prisma.userDriveFolder
    .create({
      data: {
        userId,
        userRole: parent.role,
        folderType: category,
        driveFolderId: folder.id,
        parentFolderId: parent.driveFolderId,
      },
    })
    .catch(async (err: unknown) => {
      if ((err as { code?: string })?.code === "P2002") {
        const again = await prisma.userDriveFolder.findFirst({ where: { userId, folderType: category } });
        if (again) return again;
      }
      throw err;
    });

  return row.driveFolderId;
}

/** حذف كاش الجذور — للاختبارات أو بعد تغيير الحساب */
export function resetFolderCache(): void {
  roleRootCache.clear();
}
