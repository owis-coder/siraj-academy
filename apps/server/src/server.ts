import http from "http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { setIO } from "./lib/socket";
import { verifyToken, COOKIE_NAME } from "./lib/jwt";

// ---------- HTTP ----------
const app = createApp();
const server = http.createServer(app);

// ---------- Socket.IO (محادثات + إشعارات فورية) ----------
const io = new Server(server, {
  cors: {
    origin: (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((s) => s.trim()),
    credentials: true,
  },
});
setIO(io);

// مصادقة الـhandshake عبر كوكي JWT (sid)
io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) return next(new Error("unauthorized"));
  const sidPair = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE_NAME + "="));
  if (!sidPair) return next(new Error("unauthorized"));
  const token = decodeURIComponent(sidPair.slice(COOKIE_NAME.length + 1));
  const payload = verifyToken(token);
  if (!payload) return next(new Error("unauthorized"));
  socket.data.userId = payload.sub;
  socket.data.role = payload.role;
  next();
});

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;

  // غرفة الإشعارات الشخصية
  void socket.join(`user:${userId}`);

  socket.on("chat:join", async (data: { roomId: string }) => {
    try {
      const membership = await prisma.chatParticipant.findUnique({
        where: { roomId_userId: { roomId: data.roomId, userId } },
      });
      if (membership) await socket.join(`room:${data.roomId}`);
    } catch {
      // تجاهل: عضوية غير صالحة
    }
  });

  socket.on("chat:leave", (data: { roomId: string }) => {
    void socket.leave(`room:${data.roomId}`);
  });

  // إرسال رسالة عبر sokt: نفس منطق REST (منع محظورين + بث)
  socket.on("chat:message", async (data: { roomId: string; body?: string; attachmentUrl?: string }) => {
    try {
      const membership = await prisma.chatParticipant.findUnique({
        where: { roomId_userId: { roomId: data.roomId, userId } },
      });
      if (!membership) return;
      if (!data.body && !data.attachmentUrl) return;

      const room = await prisma.chatRoom.findUnique({
        where: { id: data.roomId },
        include: { participants: { select: { userId: true } } },
      });
      if (!room) return;
      if (room.type === "DIRECT") {
        const peerIds = room.participants.map((p) => p.userId).filter((id) => id !== userId);
        const blockRow = await prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: userId, blockedId: { in: peerIds } },
              { blockedId: userId, blockerId: { in: peerIds } },
            ],
          },
        });
        if (blockRow) {
          socket.emit("chat:error", { error: "محادثة محظورة بينكما حاليًا" });
          return;
        }
      }

      const message = await prisma.message.create({
        data: {
          roomId: data.roomId,
          senderId: userId,
          body: data.body,
          attachmentUrl: data.attachmentUrl,
        },
        include: { sender: { select: { id: true, fullName: true, username: true, role: true } } },
      });
      io.to(`room:${data.roomId}`).emit("chat:message", { roomId: data.roomId, message });
    } catch (err) {
      socket.emit("chat:error", { error: "فشل إرسال الرسالة" });
      console.error("[socket] chat:message:", err);
    }
  });

  socket.on("chat:read", async (data: { roomId: string }) => {
    try {
      const at = new Date();
      await prisma.chatParticipant.update({
        where: { roomId_userId: { roomId: data.roomId, userId } },
        data: { lastReadAt: at },
      });
      io.to(`room:${data.roomId}`).emit("message:read", { roomId: data.roomId, userId, at: at.toISOString() });
    } catch {
      // تجاهل
    }
  });

  socket.on("disconnect", () => {
    // لا شيء إلزامي
  });
});

// ---------- إقلاع ----------
const PORT = Number(process.env.PORT || 4000);

server.listen(PORT, () => {
  console.log(`[server] أكاديمية سراج — API on http://localhost:${PORT}`);
  console.log("[server] Socket.IO جاهز للمحادثات والإشعارات");
});

// فشل الاتصال بقاعدة البيانات لا يهدم العملية فورًا؛ Prisma lazy-connect
server.on("error", (err) => {
  console.error("[server] فشل استماع المنفذ:", err);
  process.exit(1);
});

// إنهاء نظيف
async function shutdown(signal: string) {
  console.log(`[server] ${signal} — جارٍ الإغلاق...`);
  server.close(() => {
    void prisma.$disconnect().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
