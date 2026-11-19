// جسر Socket.IO: يُهيأ في server.ts ويُستهلك من المسارات (الإشعارات، رسائل المحادثة)
import type { Server } from "socket.io";

let io: Server | null = null;

export function setIO(instance: Server): void {
  io = instance;
}

export function getIO(): Server | null {
  return io;
}
