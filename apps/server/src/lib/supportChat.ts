import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./prisma";

export const SUPPORT_EMAIL = "support@siraj.sa";
export const SUPPORT_USERNAME = "siraj_support";
export const SUPPORT_FULL_NAME = "الدعم الفني — أكاديمية سراج";

/**
 * إيجاد أو إنشاء حساب الدعم الفني الرسمي للمنصة.
 */
export async function getOrCreateSupportUser() {
  let support = await prisma.user.findFirst({
    where: {
      OR: [
        { email: SUPPORT_EMAIL },
        { username: SUPPORT_USERNAME },
      ],
    },
  });

  if (!support) {
    // تحقق مما إذا كان هناك حساب إداري مخصص أو أنشئ حساب الدعم الفني
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN", email: "admin@siraj.sa" },
    });

    if (existingAdmin) {
      support = await prisma.user.create({
        data: {
          fullName: SUPPORT_FULL_NAME,
          username: SUPPORT_USERNAME,
          email: SUPPORT_EMAIL,
          passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
          role: "ADMIN",
          status: "ACTIVE",
          emailVerified: true,
        },
      });
    } else {
      const anyAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
      if (anyAdmin) {
        support = anyAdmin;
      } else {
        support = await prisma.user.create({
          data: {
            fullName: SUPPORT_FULL_NAME,
            username: SUPPORT_USERNAME,
            email: SUPPORT_EMAIL,
            passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
            role: "ADMIN",
            status: "ACTIVE",
            emailVerified: true,
          },
        });
      }
    }
  }

  return support;
}

/**
 * التأكد من وجود محادثة دعم مخصصة للطالب أو المدرس ووضع رسالة ترحيبية تلقائية باسمه.
 */
export async function ensureUserSupportRoom(user: { id: string; role: string; fullName: string }) {
  const support = await getOrCreateSupportUser();
  if (!support || user.id === support.id) return null;

  // البحث عن محادثة سابقة مباشرة مع الدعم
  const existing = await prisma.chatParticipant.findFirst({
    where: {
      userId: user.id,
      room: {
        type: "DIRECT",
        participants: {
          some: { userId: support.id },
        },
      },
    },
    include: {
      room: true,
    },
  });

  if (existing) {
    // التأكد من وجود رسالة ترحيب على الأقل في المحادثة
    const count = await prisma.message.count({ where: { roomId: existing.roomId } });
    if (count === 0) {
      await sendWelcomeMessage(existing.roomId, support.id, user);
    }
    return existing.room;
  }

  // إنشاء غرفة محادثة مباشرة جديدة
  const room = await prisma.chatRoom.create({
    data: {
      type: "DIRECT",
      title: SUPPORT_FULL_NAME,
      ownerId: support.id,
      participants: {
        create: [
          { userId: user.id },
          { userId: support.id, role: "ADMIN" },
        ],
      },
    },
  });

  // إرسال رسالة الترحيب التلقائية باسمه
  await sendWelcomeMessage(room.id, support.id, user);
  return room;
}

/**
 * صياغة وإرسال رسالة الترحيب الرسمية المخصصة للطالب أو المدرس.
 */
async function sendWelcomeMessage(roomId: string, supportId: string, user: { role: string; fullName: string }) {
  const isTeacher = user.role === "TEACHER";
  const name = user.fullName?.trim() || (isTeacher ? "الأستاذ" : "الطالب");

  const messageText = isTeacher
    ? `مرحبًا بك يا أستاذ ${name} في أكاديمية سراج! 🎓\n\nنحن فخورون بوجودك معنا كشريك تعليمي متميز في تقديم العلم لطلابنا.\nفريق الدعم الفني متواجد لمساعدتك في كل ما يتعلق بإدارة دوراتك، وحصصك المباشرة، واستقبال الطلبات، وإعدادات حسابك في أي وقت.\n\nلا تتردد في مراسلتنا هنا متى ما احتجت لأي استفسار أو مساعدة، نحن هنا دائمًا لخدمتك ومساندتك! ✨`
    : `مرحبًا بك يا ${name} في أكاديمية سراج! 🌟\n\nيسعدنا انضمامك إلينا ونتمنى لك رحلة تعليمية متميزة وموفقة.\nفريق الدعم الفني متواجد لمساعدتك في أي استفسار حول المنصة، أو الدورات، أو طريقة التواصل مع المدرسين وطلب المساعدة الأكاديمية.\n\nلا تتردد في مراسلتنا هنا في أي وقت، نحن هنا دائمًا لخدمتك والإجابة على تساؤلاتك! ✨`;

  await prisma.message.create({
    data: {
      roomId,
      senderId: supportId,
      body: messageText,
    },
  });
}
