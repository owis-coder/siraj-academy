// الإشعارات: صف Notification + بث فوري عبر Socket.IO (+ بريد اختياري عبر stub)
import { prisma } from "./prisma";
import { getIO } from "./socket";
import { sendMail } from "./mail";

export interface NotifyInput {
  userIds: string[];
  title: string;
  body?: string;
  link?: string;
  type?: string;
  /** بريد للمستخدمين الذين يملكون إيميلات (اختياري) */
  email?: { subject: string; text: string };
}

export async function notifyUsers(input: NotifyInput): Promise<void> {
  const { userIds, title, body, link, type, email } = input;
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, title, body, link, type })),
  });

  // بث فوري لكل مستخدم في غرفته user:{id}
  const io = getIO();
  if (io) {
    for (const userId of userIds) {
      io.to(`user:${userId}`).emit("notification:new", { title, body, link, type, createdAt: new Date().toISOString() });
    }
  }

  if (email) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { email: true },
    });
    for (const user of users) {
      await sendMail({ to: user.email, subject: email.subject, text: email.text });
    }
  }
}

// إشعار جميع الإداريين (يُستخدم عند: طلبات جديدة بانتظار المراجعة، سندات دفع جديدة)
export async function adminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

export async function notifyAdmins(input: Omit<NotifyInput, "userIds">): Promise<void> {
  await notifyUsers({ ...input, userIds: await adminIds() });
}
