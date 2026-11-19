import { z } from "zod";
import { paginationSchema } from "./common";

export const reviewPaymentSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(1000).optional(),
});

export const paymentListSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
