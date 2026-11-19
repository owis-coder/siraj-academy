import { Router } from "express";
import { prisma } from "../lib/prisma";
import { getIO } from "../lib/socket";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { createRoomSchema, messageListSchema, sendMessageSchema, reportRoomSchema } from "../validation/chat";

const router = Router();

async function getMembership(roomId: string, userId: string) {
  const participant = await prisma.chatParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!participant) throw forbidden("لست مشاركًا في هذه المحادثة");
  return participant;
}

// ---------- غرفّي ----------
router.get(
  "/rooms",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const mine = await prisma.chatParticipant.findMany({
      where: { userId: req.user!.id },
      include: {
        room: {
          include: {
            participants: { include: { user: { select: { id: true, fullName: true, username: true, role: true } } } },
            messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { fullName: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rooms = await Promise.all(
      mine.map(async (p) => {
        const unread = await prisma.message.count({
          where: {
            roomId: p.roomId,
            createdAt: { gt: p.lastReadAt ?? (new Date(0)) },
            senderId: { not: req.user!.id },
          },
        });
        return {
          id: p.roomId,
          type: p.room.type,
          title: p.room.title,
          orderId: p.room.orderId,
          myLastReadAt: p.lastReadAt,
          participants: p.room.participants.map((x) => ({
            userId: x.user.id,
            fullName: x.user.fullName,
            username: x.user.username,
            role: x.user.role,
          })),
          lastMessage: p.room.messages[0]
            ? { body: p.room.messages[0].body, sender: p.room.messages[0].sender.fullName, at: p.room.messages[0].createdAt }
            : null,
          unread,
        };
      }),
    );

    res.json({ data: rooms, meta: { total: rooms.length } });
  }),
);

// ---------- إنشاء غرفة ----------
router.post(
  "/rooms",
  requireAuth("STUDENT", "TEACHER", "ADMIN"),
  parseBody(createRoomSchema),
  asyncHandler(async (req, res) => {
    const { peerId, type, title } = req.body as { peerId?: string; type?: "DIRECT" | "GROUP"; title?: string };

    if (peerId) {
      if (peerId === req.user!.id) throw badRequest("لا يمكنك محادثة نفسك");
      const peer = await prisma.user.findUnique({ where: { id: peerId }, select: { id: true, status: true } });
      if (!peer || peer.status === "SUSPENDED") throw notFound("المستخدم غير موجود");

      // منع الازدواج: بحث غرفة مباشرة بين الطرفين
      const myDirects = await prisma.chatParticipant.findMany({
        where: { userId: req.user!.id, room: { type: "DIRECT" } },
        include: { room: { include: { participants: { select: { userId: true } } } } },
      });
      const found = myDirects.find(
        (p) =>
          p.room.participants.length === 2 &&
          p.room.participants.some((x) => x.userId === peerId),
      );
      if (found) return res.json({ data: { roomId: found.roomId, reused: true } });

      const room = await prisma.chatRoom.create({
        data: {
          type: "DIRECT",
          ownerId: req.user!.id,
          participants: { create: [{ userId: req.user!.id }, { userId: peerId }] },
        },
      });
      res.status(201).json({ data: { roomId: room.id, reused: false } });
      return;
    }

    // مجموعة: للإدارة أو المدرس
    if (req.user!.role === "STUDENT") throw forbidden("إنشاء المجموعات للإدارة والمدرسين");
    const room = await prisma.chatRoom.create({
      data: {
        type: "GROUP",
        ownerId: req.user!.id,
        title: title as string,
        participants: { create: [{ userId: req.user!.id, role: "ADMIN" }] },
      },
    });
    res.status(201).json({ data: { roomId: room.id, reused: false } });
  }),
);

// ---------- رسائل الغرفة ----------
router.get(
  "/rooms/:id/messages",
  requireAuth(),
  parseQuery(messageListSchema),
  asyncHandler(async (req, res) => {
    const roomId = req.params.id;
    await getMembership(roomId, req.user!.id);

    const { before, limit } = req.query as unknown as { before?: string; limit: number };
    const beforeDate = before ? new Date(before) : undefined;
    if (before && Number.isNaN(beforeDate!.getTime())) throw badRequest("معامل before غير صحيح");

    const messages = await prisma.message.findMany({
      where: { roomId, ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { sender: { select: { id: true, fullName: true, username: true, role: true } } },
    });
    // ترتيب زمني تصاعدي للعرض
    messages.reverse();
    res.json({ data: messages, meta: { count: messages.length, hasMore: messages.length === limit } });
  }),
);

// إرسال رسالة عبر REST (أو عبر Socket — انظر server.ts)
router.post(
  "/rooms/:id/messages",
  requireAuth(),
  parseBody(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const roomId = req.params.id;
    await getMembership(roomId, req.user!.id);
    const { body, attachmentUrl } = req.body as { body?: string; attachmentUrl?: string };

    // منع الرسائل إن حُظر أحد الطرفين الآخر في محادثة مباشرة
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { participants: { select: { userId: true } } },
    });
    if (room && room.type === "DIRECT") {
      const peerIds = room.participants.map((p) => p.userId).filter((id) => id !== req.user!.id);
      const blockRow = await prisma.block.findFirst({
        where: { OR: [{ blockerId: req.user!.id, blockedId: { in: peerIds } }, { blockedId: req.user!.id, blockerId: { in: peerIds } }] },
      });
      if (blockRow) throw badRequest("محادثة محظورة بينكما حاليًا");
    }

    const message = await prisma.message.create({
      data: { roomId, senderId: req.user!.id, body, attachmentUrl },
      include: { sender: { select: { id: true, fullName: true, username: true, role: true } } },
    });

    const io = getIO();
    if (io) io.to(`room:${roomId}`).emit("chat:message", { roomId, message });

    res.status(201).json({ data: message });
  }),
);

// ---------- قراءة ----------
router.post(
  "/rooms/:id/read",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const at = new Date();
    await getMembership(req.params.id, req.user!.id);
    await prisma.chatParticipant.update({
      where: { roomId_userId: { roomId: req.params.id, userId: req.user!.id } },
      data: { lastReadAt: at },
    });
    const io = getIO();
    if (io) io.to(`room:${req.params.id}`).emit("message:read", { roomId: req.params.id, userId: req.user!.id, at: at.toISOString() });
    res.json({ data: { readAt: at } });
  }),
);

// ----------
// بلاغ محادثة (يراقبه /admin/chat/reports)
router.post(
  "/rooms/:id/report",
  requireAuth(),
  parseBody(reportRoomSchema),
  asyncHandler(async (req, res) => {
    const roomId = req.params.id;
    await getMembership(roomId, req.user!.id);
    const report = await prisma.chatReport.create({
      data: { roomId, reporterId: req.user!.id, reason: (req.body as { reason: string }).reason, messageId: (req.body as { messageId?: string }).messageId },
    });
    res.status(201).json({ data: report, message: "تم إرسال البلاغ للإدارة" });
  }),
);

// ---------- حظر/رفع الحظر بين المستخدمين ----------
router.post(
  "/users/:id/block",
  requireAuth(),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw badRequest("لا يمكنك حظر نفسك");
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!target) throw notFound("المستخدم غير موجود");
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId: target.id } },
      update: {},
      create: { blockerId: req.user!.id, blockedId: target.id },
    });
    res.json({ data: { message: "تم حظر المستخدم" } });
  }),
);

router.post(
  "/users/:id/unblock",
  requireAuth(),
  asyncHandler(async (req, res) => {
    await prisma.block.deleteMany({ where: { blockerId: req.user!.id, blockedId: req.params.id } });
    res.json({ data: { message: "تم رفع الحظر" } });
  }),
);

export default router;
