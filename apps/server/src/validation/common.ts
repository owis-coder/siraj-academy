// مخططات Zod مشتركة (ترقيم صفحات، بحث…)
import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(120).optional().default(""),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const idParamSchema = z.object({ id: z.string().min(1) });

export function pageMeta(total: number, page: number, limit: number) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function skipTake(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}
