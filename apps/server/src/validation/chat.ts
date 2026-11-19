import { z } from "zod";
import { paginationSchema } from "./common";

export const createRoomSchema = z
  .object({
    peerId: z.string().min(1).optional(),
    type: z.enum(["DIRECT", "GROUP"]).optional(),
    title: z.string().trim().max(120).optional(),
  })
  .refine(
    (data) => data.peerId || (data.type === "GROUP" && !!data.title),
    { message: "للمحادثة المباشرة حدد peerId، وللمجموعة حدد type=GROUP مع title" },
  );

export const messageListSchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(4000).optional(),
    attachmentUrl: z.string().trim().max(400).optional(),
  })
  .refine((d) => !!d.body || !!d.attachmentUrl, { message: "أرسل نص الرسالة أو مرفقًا" });

export const reportRoomSchema = z.object({
  reason: z.string().trim().min(5, "اشترِ سبب البلاغ").max(1000),
  messageId: z.string().min(1).optional(),
});

export const roomMessagesQuerySchema = paginationSchema;
