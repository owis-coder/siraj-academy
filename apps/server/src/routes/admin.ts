import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const visibilitySchema = z.object({ isVisible: z.boolean() });
const reasonOptionalSchema = z.object({ reason: z.string().trim().max(500).optional() });
import { uniqueSlug } from "../lib/slug";
import { SETTING_KEYS, setSettings, getCommissionRate, getSettings } from "../lib/settings";
import { notifyUsers } from "../lib/notify";
import { badRequest, notFound, forbidden } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { pageMeta, skipTake } from "../validation/common";
import { generateUsersExcel, getUsersExcelPath } from "../lib/excelUsers";
import { listCustomRequestsQuerySchema, updateCustomRequestStatusSchema } from "../validation/customRequests";
import { CUSTOM_REQUEST_TYPE_ARABIC, CUSTOM_REQUEST_STATUS_ARABIC } from "../lib/customRequestHelpers";
import { sendAdminNotificationEmail } from "../lib/adminNotify";
import { audit } from "../lib/audit";
import { buildCustomRequestNotification, buildStatusUpdateNotification } from "../lib/emailTemplates";
import { sendMail } from "../lib/mail";
import fs from "fs";
import {
  adminUniversityCreate,
  adminUniversityUpdate,
  adminCollegeCreate,
  adminCollegeUpdate,
  adminMajorCreate,
  adminMajorUpdate,
  adminCourseCreate,
  adminCourseUpdate,
  adminCourseListSchema,
  adminServiceCreate,
  adminServiceUpdate,
  adminOfferingListSchema,
  adminOfferingUpdate,
  adminTeacherListSchema,
  adminUserListSchema,
  adminUserUpdate,
  adminPaymentsListSchema,
  adminOrdersListSchema,
  adminAdsListSchema,
  adminRequestsListSchema,
  adminReportsListSchema,
  adminReportResolve,
  adminSettingsUpdate,
  adminBroadcastSchema,
} from "../validation/admin";

const router = Router();
// كل مسارات هذه الشجرة للإدارة
router.use(requireAuth("ADMIN"));

// ============================================================
// الجامعات
// ============================================================
router.get(
  "/universities",
  asyncHandler(async (_req, res) => {
    const [items, total] = await Promise.all([
      prisma.university.findMany({
        orderBy: [{ order: "asc" }, { name: "asc" }],
        include: { _count: { select: { colleges: true, majors: true, courses: true, students: true } } },
      }),
      prisma.university.count(),
    ]);
    res.json({ data: items, meta: { total } });
  }),
);

router.post(
  "/universities",
  parseBody(adminUniversityCreate),
  asyncHandler(async (req, res) => {
    const data = req.body as { name: string; slug?: string; city?: string; logoUrl?: string; isVisible: boolean; order: number };
    const rawSlug = data.slug && data.slug.trim() ? data.slug.trim() : data.name;
    const slug = await uniqueSlug(rawSlug, (s) => prisma.university.findUnique({ where: { slug: s }, select: { id: true } }).then((x) => !!x));
    const uni = await prisma.university.create({
      data: {
        name: data.name.trim(),
        slug,
        city: data.city?.trim() || null,
        logoUrl: data.logoUrl?.trim() || null,
        isVisible: data.isVisible ?? true,
        order: data.order ?? 0,
      },
    });
    res.status(201).json({ data: uni });
  }),
);

router.patch(
  "/universities/:id",
  parseBody(adminUniversityUpdate),
  asyncHandler(async (req, res) => {
    const uni = await prisma.university.findUnique({ where: { id: req.params.id } });
    if (!uni) throw notFound("الجامعة غير موجودة");
    const data = req.body as Partial<{ name: string; slug: string; city: string; logoUrl: string; isVisible: boolean; order: number }>;
    let slug = uni.slug;
    if (data.slug && data.slug.trim() && data.slug !== uni.slug) {
      slug = await uniqueSlug(data.slug.trim(), (s) => prisma.university.findUnique({ where: { slug: s }, select: { id: true } }).then((x) => !!x && x.id !== uni.id));
    } else if (data.name && data.name.trim() !== uni.name && !data.slug) {
      slug = await uniqueSlug(data.name.trim(), (s) => prisma.university.findUnique({ where: { slug: s }, select: { id: true } }).then((x) => !!x && x.id !== uni.id));
    }
    const updated = await prisma.university.update({
      where: { id: uni.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        slug,
        ...(data.city !== undefined ? { city: data.city ? data.city.trim() : null } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl ? data.logoUrl.trim() : null } : {}),
        ...(data.isVisible !== undefined ? { isVisible: data.isVisible } : {}),
        ...(data.order !== undefined ? { order: data.order } : {}),
      },
    });
    res.json({ data: updated });
  }),
);

router.delete(
  "/universities/:id",
  asyncHandler(async (req, res) => {
    const uni = await prisma.university.findUnique({ where: { id: req.params.id } });
    if (!uni) throw notFound("الجامعة غير موجودة");
    await prisma.university.delete({ where: { id: uni.id } });
    res.json({ data: { message: "تم حذف الجامعة بكل التبعيات (كليات/تخصصات/مقررات)" } });
  }),
);

// ============================================================
// الكليات
// ============================================================
router.get(
  "/colleges",
  asyncHandler(async (req, res) => {
    const universityId = typeof req.query.universityId === "string" ? req.query.universityId : undefined;
    const items = await prisma.college.findMany({
      where: universityId ? { universityId } : {},
      orderBy: { name: "asc" },
      include: { _count: { select: { courses: true, majors: true } }, university: { select: { name: true } } },
    });
    res.json({ data: items, meta: { total: items.length } });
  }),
);

router.post(
  "/colleges",
  parseBody(adminCollegeCreate),
  asyncHandler(async (req, res) => {
    const data = req.body as { universityId: string; name: string };
    let uni = await prisma.university.findUnique({ where: { id: data.universityId } });
    if (!uni) uni = await prisma.university.findFirst({ where: { name: data.universityId } });
    if (!uni) throw badRequest("الجامعة المحددة غير موجودة");
    const college = await prisma.college.create({
      data: { universityId: uni.id, name: data.name.trim() },
      include: { university: { select: { name: true } } },
    });
    res.status(201).json({ data: college });
  }),
);

router.patch(
  "/colleges/:id",
  parseBody(adminCollegeUpdate),
  asyncHandler(async (req, res) => {
    const college = await prisma.college.findUnique({ where: { id: req.params.id } });
    if (!college) throw notFound("الكلية غير موجودة");
    const data = req.body as Partial<{ universityId: string; name: string }>;
    let actualUniId = college.universityId;
    if (data.universityId) {
      let uni = await prisma.university.findUnique({ where: { id: data.universityId } });
      if (!uni) uni = await prisma.university.findFirst({ where: { name: data.universityId } });
      if (!uni) throw badRequest("الجامعة المحددة غير موجودة");
      actualUniId = uni.id;
    }
    const updated = await prisma.college.update({
      where: { id: college.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        universityId: actualUniId,
      },
      include: { university: { select: { name: true } } },
    });
    res.json({ data: updated });
  }),
);

router.delete(
  "/colleges/:id",
  asyncHandler(async (req, res) => {
    const college = await prisma.college.findUnique({ where: { id: req.params.id } });
    if (!college) throw notFound("الكلية غير موجودة");
    await prisma.college.delete({ where: { id: college.id } });
    res.json({ data: { message: "تم حذف الكلية" } });
  }),
);

// ============================================================
// التخصصات
// ============================================================
router.get(
  "/majors",
  asyncHandler(async (req, res) => {
    const universityId = typeof req.query.universityId === "string" ? req.query.universityId : undefined;
    const collegeId = typeof req.query.collegeId === "string" ? req.query.collegeId : undefined;
    const items = await prisma.major.findMany({
      where: { ...(universityId ? { universityId } : {}), ...(collegeId ? { collegeId } : {}) },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { courses: true, users: true } },
        university: { select: { name: true } },
        college: { select: { name: true } },
      },
    });
    res.json({ data: items, meta: { total: items.length } });
  }),
);

router.post(
  "/majors",
  parseBody(adminMajorCreate),
  asyncHandler(async (req, res) => {
    const data = req.body as { universityId: string; collegeId?: string | null; name: string };
    let uni = await prisma.university.findUnique({ where: { id: data.universityId } });
    if (!uni) uni = await prisma.university.findFirst({ where: { name: data.universityId } });
    if (!uni) throw badRequest("الجامعة المحددة غير موجودة");

    let resolvedCollegeId: string | null = null;
    if (data.collegeId && data.collegeId.trim()) {
      const colVal = data.collegeId.trim();
      const colById = await prisma.college.findUnique({ where: { id: colVal } });
      if (colById) {
        resolvedCollegeId = colById.id;
      } else {
        const colByName = await prisma.college.findFirst({
          where: { universityId: uni.id, name: colVal },
        });
        if (colByName) {
          resolvedCollegeId = colByName.id;
        } else {
          const newCol = await prisma.college.create({
            data: { universityId: uni.id, name: colVal },
          });
          resolvedCollegeId = newCol.id;
        }
      }
    }

    const major = await prisma.major.create({
      data: {
        universityId: uni.id,
        collegeId: resolvedCollegeId,
        name: data.name.trim(),
      },
      include: {
        university: { select: { name: true } },
        college: { select: { name: true } },
      },
    });
    res.status(201).json({ data: major });
  }),
);

router.patch(
  "/majors/:id",
  parseBody(adminMajorUpdate),
  asyncHandler(async (req, res) => {
    const major = await prisma.major.findUnique({ where: { id: req.params.id } });
    if (!major) throw notFound("التخصص غير موجود");
    const data = req.body as Partial<{ universityId: string; collegeId: string | null; name: string }>;
    let actualUniId = major.universityId;
    if (data.universityId) {
      let uni = await prisma.university.findUnique({ where: { id: data.universityId } });
      if (!uni) uni = await prisma.university.findFirst({ where: { name: data.universityId } });
      if (!uni) throw badRequest("الجامعة المحددة غير موجودة");
      actualUniId = uni.id;
    }

    let resolvedCollegeId: string | null | undefined = undefined;
    if (data.collegeId !== undefined) {
      if (!data.collegeId || !data.collegeId.trim()) {
        resolvedCollegeId = null;
      } else {
        const colVal = data.collegeId.trim();
        const colById = await prisma.college.findUnique({ where: { id: colVal } });
        if (colById) {
          resolvedCollegeId = colById.id;
        } else {
          const colByName = await prisma.college.findFirst({
            where: { universityId: actualUniId, name: colVal },
          });
          if (colByName) {
            resolvedCollegeId = colByName.id;
          } else {
            const newCol = await prisma.college.create({
              data: { universityId: actualUniId, name: colVal },
            });
            resolvedCollegeId = newCol.id;
          }
        }
      }
    }

    const updated = await prisma.major.update({
      where: { id: major.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        universityId: actualUniId,
        ...(resolvedCollegeId !== undefined ? { collegeId: resolvedCollegeId } : {}),
      },
      include: {
        university: { select: { name: true } },
        college: { select: { name: true } },
      },
    });
    res.json({ data: updated });
  }),
);

router.delete(
  "/majors/:id",
  asyncHandler(async (req, res) => {
    const major = await prisma.major.findUnique({ where: { id: req.params.id } });
    if (!major) throw notFound("التخصص غير موجود");
    await prisma.major.delete({ where: { id: major.id } });
    res.json({ data: { message: "تم حذف التخصص" } });
  }),
);

// ============================================================
// المقررات
// ============================================================
router.get(
  "/courses",
  parseQuery(adminCourseListSchema),
  asyncHandler(async (req, res) => {
    const { universityId, collegeId, majorId, q, page, limit } = req.query as unknown as {
      universityId?: string; collegeId?: string; majorId?: string; q: string; page: number; limit: number;
    };
    const where: Record<string, unknown> = {
      ...(universityId ? { universityId } : {}),
      ...(collegeId ? { collegeId } : {}),
      ...(majorId ? { majorId } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { code: { contains: q } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.course.count({ where: where as never }),
      prisma.course.findMany({
        where: where as never,
        orderBy: { title: "asc" },
        select: {
          id: true, title: true, code: true, level: true, isVisible: true, coverUrl: true, description: true,
          universityId: true, collegeId: true, majorId: true,
          university: { select: { id: true, name: true, slug: true } },
          college: { select: { id: true, name: true } },
          major: { select: { id: true, name: true } },
          _count: { select: { offerings: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);

router.post(
  "/courses",
  parseBody(adminCourseCreate),
  asyncHandler(async (req, res) => {
    const data = req.body as {
      universityId: string; collegeId?: string | null; majorId?: string | null; title: string;
      code?: string | null; level?: string | null; description?: string | null; isVisible: boolean; coverUrl?: string | null;
    };

    let uni = await prisma.university.findUnique({ where: { id: data.universityId } });
    if (!uni) uni = await prisma.university.findFirst({ where: { name: data.universityId } });
    if (!uni) throw badRequest("الجامعة المحددة غير موجودة");
    const actualUniId = uni.id;

    let resolvedCollegeId: string | null = null;
    if (data.collegeId && data.collegeId.trim()) {
      const colVal = data.collegeId.trim();
      const colById = await prisma.college.findUnique({ where: { id: colVal } });
      if (colById) {
        resolvedCollegeId = colById.id;
      } else {
        const colByName = await prisma.college.findFirst({
          where: { universityId: actualUniId, name: colVal },
        });
        if (colByName) {
          resolvedCollegeId = colByName.id;
        } else {
          const newCol = await prisma.college.create({
            data: { universityId: actualUniId, name: colVal },
          });
          resolvedCollegeId = newCol.id;
        }
      }
    }

    let resolvedMajorId: string | null = null;
    if (data.majorId && data.majorId.trim()) {
      const majVal = data.majorId.trim();
      const majById = await prisma.major.findUnique({ where: { id: majVal } });
      if (majById) {
        resolvedMajorId = majById.id;
      } else {
        const majByName = await prisma.major.findFirst({
          where: { universityId: actualUniId, name: majVal },
        });
        if (majByName) {
          resolvedMajorId = majByName.id;
        } else {
          const newMaj = await prisma.major.create({
            data: {
              universityId: actualUniId,
              collegeId: resolvedCollegeId,
              name: majVal,
            },
          });
          resolvedMajorId = newMaj.id;
        }
      }
    }

    const course = await prisma.course.create({
      data: {
        universityId: actualUniId,
        collegeId: resolvedCollegeId,
        majorId: resolvedMajorId,
        title: data.title.trim(),
        code: data.code?.trim() || null,
        level: data.level?.trim() || null,
        description: data.description?.trim() || null,
        isVisible: data.isVisible ?? true,
        coverUrl: data.coverUrl?.trim() || null,
      },
      include: {
        university: { select: { id: true, name: true, slug: true } },
        college: { select: { id: true, name: true } },
        major: { select: { id: true, name: true } },
      },
    });
    res.status(201).json({ data: course });
  }),
);

router.patch(
  "/courses/:id",
  parseBody(adminCourseUpdate),
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) throw notFound("المقرر غير موجود");
    const data = req.body as Partial<{
      universityId: string; collegeId: string | null; majorId: string | null; title: string;
      code: string | null; level: string | null; description: string | null; isVisible: boolean; coverUrl: string | null;
    }>;

    let actualUniId = course.universityId;
    if (data.universityId) {
      let uni = await prisma.university.findUnique({ where: { id: data.universityId } });
      if (!uni) uni = await prisma.university.findFirst({ where: { name: data.universityId } });
      if (!uni) throw badRequest("الجامعة المحددة غير موجودة");
      actualUniId = uni.id;
    }

    let resolvedCollegeId: string | null | undefined = undefined;
    if (data.collegeId !== undefined) {
      if (!data.collegeId || !data.collegeId.trim()) {
        resolvedCollegeId = null;
      } else {
        const colVal = data.collegeId.trim();
        const colById = await prisma.college.findUnique({ where: { id: colVal } });
        if (colById) {
          resolvedCollegeId = colById.id;
        } else {
          const colByName = await prisma.college.findFirst({
            where: { universityId: actualUniId, name: colVal },
          });
          if (colByName) {
            resolvedCollegeId = colByName.id;
          } else {
            const newCol = await prisma.college.create({
              data: { universityId: actualUniId, name: colVal },
            });
            resolvedCollegeId = newCol.id;
          }
        }
      }
    }

    let resolvedMajorId: string | null | undefined = undefined;
    if (data.majorId !== undefined) {
      if (!data.majorId || !data.majorId.trim()) {
        resolvedMajorId = null;
      } else {
        const majVal = data.majorId.trim();
        const majById = await prisma.major.findUnique({ where: { id: majVal } });
        if (majById) {
          resolvedMajorId = majById.id;
        } else {
          const majByName = await prisma.major.findFirst({
            where: { universityId: actualUniId, name: majVal },
          });
          if (majByName) {
            resolvedMajorId = majByName.id;
          } else {
            const targetColId = resolvedCollegeId !== undefined ? resolvedCollegeId : course.collegeId;
            const newMaj = await prisma.major.create({
              data: {
                universityId: actualUniId,
                collegeId: targetColId,
                name: majVal,
              },
            });
            resolvedMajorId = newMaj.id;
          }
        }
      }
    }

    const updated = await prisma.course.update({
      where: { id: course.id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        universityId: actualUniId,
        ...(resolvedCollegeId !== undefined ? { collegeId: resolvedCollegeId } : {}),
        ...(resolvedMajorId !== undefined ? { majorId: resolvedMajorId } : {}),
        ...(data.code !== undefined ? { code: data.code ? data.code.trim() : null } : {}),
        ...(data.level !== undefined ? { level: data.level ? data.level.trim() : null } : {}),
        ...(data.description !== undefined ? { description: data.description ? data.description.trim() : null } : {}),
        ...(data.isVisible !== undefined ? { isVisible: data.isVisible } : {}),
        ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl ? data.coverUrl.trim() : null } : {}),
      },
      include: {
        university: { select: { id: true, name: true, slug: true } },
        college: { select: { id: true, name: true } },
        major: { select: { id: true, name: true } },
      },
    });
    res.json({ data: updated });
  }),
);

// رؤية/إخفاء سريع
router.post(
  "/courses/:id/visibility",
  parseBody(visibilitySchema),
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) throw notFound("المقرر غير موجود");
    const updated = await prisma.course.update({
      where: { id: course.id },
      data: { isVisible: (req.body as { isVisible: boolean }).isVisible },
    });
    res.json({ data: updated });
  }),
);

router.delete(
  "/courses/:id",
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) throw notFound("المقرر غير موجود");
    await prisma.course.delete({ where: { id: course.id } });
    res.json({ data: { message: "تم حذف المقرر وتبعياته" } });
  }),
);

// ============================================================
// الخدمات
// ============================================================
router.get(
  "/services",
  asyncHandler(async (_req, res) => {
    const items = await prisma.service.findMany({
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      include: { provider: { include: { user: { select: { fullName: true, username: true } } } } },
    });
    res.json({ data: items, meta: { total: items.length } });
  }),
);

router.post(
  "/services",
  parseBody(adminServiceCreate),
  asyncHandler(async (req, res) => {
    const data = req.body as {
      title: string; slug?: string | null; category: string; description: string;
      basePrice?: number | null; durationDays?: number | null; providerId?: string | null; isActive: boolean; isFeatured: boolean;
    };
    const slugSource = data.slug && data.slug.trim() ? data.slug.trim() : data.title;
    const slug = await uniqueSlug(slugSource, (s) => prisma.service.findUnique({ where: { slug: s }, select: { id: true } }).then((x) => !!x));
    const service = await prisma.service.create({
      data: {
        slug,
        title: data.title.trim(),
        category: data.category as never,
        description: data.description.trim(),
        basePrice: data.basePrice ?? null,
        durationDays: data.durationDays ?? null,
        providerId: data.providerId || null,
        isActive: data.isActive ?? true,
        isFeatured: data.isFeatured ?? false,
      },
    });
    res.status(201).json({ data: service });
  }),
);

router.patch(
  "/services/:id",
  parseBody(adminServiceUpdate),
  asyncHandler(async (req, res) => {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) throw notFound("الخدمة غير موجودة");
    const data = req.body as Record<string, unknown>;
    let slug = service.slug;
    if (typeof data.slug === "string" && data.slug.trim() && data.slug !== service.slug) {
      slug = await uniqueSlug(data.slug.trim(), (s) => prisma.service.findUnique({ where: { slug: s }, select: { id: true } }).then((x) => !!x && x.id !== service.id));
    } else if (typeof data.title === "string" && data.title.trim() && data.title !== service.title && !data.slug) {
      slug = await uniqueSlug(data.title.trim(), (s) => prisma.service.findUnique({ where: { slug: s }, select: { id: true } }).then((x) => !!x && x.id !== service.id));
    }
    const updated = await prisma.service.update({
      where: { id: service.id },
      data: {
        ...(data.title !== undefined ? { title: (data.title as string).trim() } : {}),
        slug,
        ...(data.category !== undefined ? { category: data.category as never } : {}),
        ...(data.description !== undefined ? { description: (data.description as string).trim() } : {}),
        ...(data.basePrice !== undefined ? { basePrice: (data.basePrice as number | null) } : {}),
        ...(data.durationDays !== undefined ? { durationDays: (data.durationDays as number | null) } : {}),
        ...(data.providerId !== undefined ? { providerId: (data.providerId as string | null) } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive as boolean } : {}),
        ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured as boolean } : {}),
      },
    });
    res.json({ data: updated });
  }),
);

router.delete(
  "/services/:id",
  asyncHandler(async (req, res) => {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) throw notFound("الخدمة غير موجودة");
    await prisma.service.delete({ where: { id: service.id } });
    res.json({ data: { message: "تم حذف الخدمة" } });
  }),
);

// ============================================================
// دورات المدرسين (اكتمال الرؤية والإخفاء)
// ============================================================
router.get(
  "/offerings",
  parseQuery(adminOfferingListSchema),
  asyncHandler(async (req, res) => {
    const { status, q, page, limit } = req.query as unknown as { status?: string; q: string; page: number; limit: number };
    const where: Record<string, unknown> = {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }, { course: { title: { contains: q } } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.courseOffering.count({ where: where as never }),
      prisma.courseOffering.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: {
          course: { select: { title: true, university: { select: { name: true } } } },
          teacher: { include: { user: { select: { fullName: true, username: true } } } },
          _count: { select: { enrollments: true, lessons: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);


router.patch(
  "/offerings/:id",
  parseBody(adminOfferingUpdate),
  asyncHandler(async (req, res) => {
    const offering = await prisma.courseOffering.findUnique({
      where: { id: req.params.id },
      include: { teacher: { select: { userId: true } }, course: { select: { title: true } } },
    });
    if (!offering) throw notFound("الدورة غير موجودة");
    const { status, adminNote } = req.body as { status: "DRAFT" | "PUBLISHED" | "HIDDEN" | "REJECTED"; adminNote?: string };

    if (status === "PUBLISHED" && !["PENDING_REVIEW", "HIDDEN", "REJECTED"].includes(offering.status)) {
      throw badRequest("لا يمكن اعتماد دورة لم تُقدَّم للمراجعة");
    }
    if (status === "REJECTED") {
      if (offering.status === "REJECTED") {
        throw badRequest("الدورة مرفوضة مسبقًا");
      }
      if (!adminNote || adminNote.trim().length < 3) {
        throw badRequest("سبب الرفض مطلوب ويجب ألا يقل عن 3 أحرف");
      }
    }

    const updated = await prisma.courseOffering.update({
      where: { id: offering.id },
      data: { status, ...(adminNote !== undefined ? { adminNote } : {}) },
    });

    const messages: Record<string, string> = {
      PUBLISHED: `اعتمدت الإدارة دورتك «${offering.title ?? offering.course.title}» ونُشرت للطلاب.`,
      REJECTED: `رُفضت دورتك «${offering.title ?? offering.course.title}»${adminNote ? `: ${adminNote}` : ""}`,
      HIDDEN: `أُخفيت دورتك «${offering.title ?? offering.course.title}» مؤقتًا من الإدارة.`,
    };
    if (messages[status]) {
      await notifyUsers({
        userIds: [offering.teacher.userId],
        title: "قرار الإدارة على دورتك",
        body: messages[status],
        link: "/dashboard/teacher/offerings",
        type: status === "PUBLISHED" ? "OFFERING_PUBLISHED" : "OFFERING_REJECTED",
      });
    }

    res.json({ data: updated, message: `تم تحديث حالة الدورة إلى ${status}` });
  }),
);

// ============================================================
// المدرسون: الاعتماد/الرفض/التعليق
// ============================================================
router.get(
  "/teachers",
  parseQuery(adminTeacherListSchema),
  asyncHandler(async (req, res) => {
    const { status, q, page, limit } = req.query as unknown as { status?: string; q: string; page: number; limit: number };
    const where: Record<string, unknown> = {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ user: { fullName: { contains: q } } }, { user: { username: { contains: q } } }, { user: { email: { contains: q } } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.teacherProfile.count({ where: where as never }),
      prisma.teacherProfile.findMany({
        where: where as never,
        orderBy: { createdAt: "asc" }, // الأقدم أولًا للمراجعة
        include: {
          user: { select: { id: true, fullName: true, username: true, email: true, whatsapp: true, emailVerified: true, createdAt: true, university: { select: { name: true } } } },
          _count: { select: { offerings: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);


router.post(
  "/teachers/:id/approve",
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!profile) throw notFound("ملف المدرس غير موجود");
    if (profile.status === "APPROVED") throw badRequest("المدرس مفعّل مسبقًا");

    await prisma.$transaction([
      prisma.teacherProfile.update({ where: { id: profile.id }, data: { status: "APPROVED" } }),
      prisma.user.update({ where: { id: profile.userId }, data: { status: "ACTIVE" } }),
    ]);
    await notifyUsers({
      userIds: [profile.userId],
      title: "تم تفعيل حسابك كمدرس",
      body: "مبروك! يمكنك الآن النشر في الدورات والعروض والإعلانات والجلسات المباشرة.",
      type: "TEACHER_APPROVED",
    });
    res.json({ data: { message: "تم اعتماد المدرس" } });
  }),
);

router.post(
  "/teachers/:id/reject",
  parseBody(reasonOptionalSchema),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { id: req.params.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");
    if (profile.status === "APPROVED") throw badRequest("لا يمكن رفض مدرس مرّفع؛ علّق حسابه بدلاً من ذلك");
    await prisma.teacherProfile.update({ where: { id: profile.id }, data: { status: "REJECTED" } });
    await notifyUsers({
      userIds: [profile.userId],
      title: "لم يُعتمد حساب المدرس",
      body: (req.body as { reason?: string }).reason ? `سبب الإدارة: ${(req.body as { reason?: string }).reason}` : "راجع متطلبات ملف المدرس وأعد التقديم.",
      type: "TEACHER_REJECTED",
    });
    res.json({ data: { message: "تم رفض ملف المدرس" } });
  }),
);

router.post(
  "/teachers/:id/disable",
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { id: req.params.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");
    await prisma.$transaction([
      prisma.teacherProfile.update({ where: { id: profile.id }, data: { status: "SUSPENDED" } }),
      prisma.user.update({ where: { id: profile.userId }, data: { status: "SUSPENDED" } }),
    ]);
    await notifyUsers({
      userIds: [profile.userId],
      title: "تم تعليق حسابك كمدرس",
      body: "راجع وضعك مع الإدارة.",
      type: "TEACHER_SUSPENDED",
    });
    res.json({ data: { message: "تم تعليق المدرس" } });
  }),
);

router.post(
  "/teachers/:id/enable",
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { id: req.params.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");
    await prisma.$transaction([
      prisma.teacherProfile.update({ where: { id: profile.id }, data: { status: "APPROVED" } }),
      prisma.user.update({ where: { id: profile.userId }, data: { status: "ACTIVE" } }),
    ]);
    res.json({ data: { message: "تم إعادة تفعيل المدرس" } });
  }),
);

router.patch(
  "/teachers/:id",
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { id: req.params.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");
    const disabled = req.body?.disabled;
    const newStatus = disabled ? "SUSPENDED" : "APPROVED";
    const newUserStatus = disabled ? "SUSPENDED" : "ACTIVE";
    await prisma.$transaction([
      prisma.teacherProfile.update({ where: { id: profile.id }, data: { status: newStatus } }),
      prisma.user.update({ where: { id: profile.userId }, data: { status: newUserStatus } }),
    ]);
    res.json({ data: { message: disabled ? "تم تعليق المدرس" : "تم إعادة تفعيل المدرس" } });
  }),
);

// ============================================================
// المستخدمون
// ============================================================
router.get(
  "/users/stats",
  asyncHandler(async (_req, res) => {
    const [
      totalUsers,
      studentsCount,
      teachersCount,
      adminsCount,
      activeCount,
      suspendedCount,
      unverifiedCount,
      pendingRecoveriesCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.user.count({ where: { role: "TEACHER" } }),
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "SUSPENDED" } }),
      prisma.user.count({ where: { emailVerified: false } }),
      prisma.accountRecoveryRequest.count({ where: { status: "PENDING_APPROVAL" } }).catch(() => 0),
    ]);

    res.json({
      data: {
        totalUsers,
        studentsCount,
        teachersCount,
        adminsCount,
        activeCount,
        suspendedCount,
        unverifiedCount,
        pendingRecoveriesCount,
      },
    });
  }),
);

router.get(
  "/users",
  parseQuery(adminUserListSchema),
  asyncHandler(async (req, res) => {
    const { role, q, page, limit } = req.query as unknown as { role?: string; q: string; page: number; limit: number };
    const where: Record<string, unknown> = {
      ...(role ? { role } : {}),
      ...(q ? { OR: [{ fullName: { contains: q } }, { username: { contains: q } }, { email: { contains: q } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.user.count({ where: where as never }),
      prisma.user.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, fullName: true, username: true, email: true, whatsapp: true, role: true, status: true,
          emailVerified: true, createdAt: true,
          university: { select: { name: true } },
          major: { select: { name: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      meta: pageMeta(total, page, limit),
    });
  }),
);


router.patch(
  "/users/:id",
  parseBody(adminUserUpdate),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound("المستخدم غير موجود");
    if (user.role === "ADMIN") throw badRequest("لا يمكن تعديل حالة حساب إداري");
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { status: (req.body as { status: "ACTIVE" | "SUSPENDED" }).status },
    });
    res.json({ data: { id: updated.id, status: updated.status } });
  }),
);

// ============================================================
// تصدير المستخدمين إلى Excel
// ============================================================
router.post(
  "/users/export/excel",
  asyncHandler(async (_req, res) => {
    const filePath = await generateUsersExcel();
    res.json({ data: { message: "تم إنشاء ملف Excel بنجاح", path: filePath } });
  }),
);

router.get(
  "/users/export/excel/download",
  asyncHandler(async (_req, res) => {
    const filePath = getUsersExcelPath();
    if (!fs.existsSync(filePath)) {
      await generateUsersExcel();
    }
    res.download(filePath, "users.xlsx");
  }),
);

// ============================================================
// الطلبات/المدفوعات/الإعلانات/البلاغات
// ============================================================
router.get(
  "/requests",
  parseQuery(adminRequestsListSchema),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };
    const where = status ? { status: status as never } : {};
    const [total, items] = await Promise.all([
      prisma.explainRequest.count({ where: where as never }),
      prisma.explainRequest.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, courseTitle: true, details: true, budget: true, urgency: true, status: true, createdAt: true,
          student: { select: { id: true, fullName: true, username: true, whatsapp: true } },
          university: { select: { name: true } },
          _count: { select: { offers: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);


router.get(
  "/payments",
  parseQuery(adminPaymentsListSchema),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };
    const where = status ? { status: status as never } : {};
    const [total, items] = await Promise.all([
      prisma.payment.count({ where: where as never }),
      prisma.payment.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: {
          order: {
            select: {
              id: true, orderNo: true, amount: true, title: true, status: true,
              student: { select: { fullName: true, username: true } },
            },
          },
        },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);


router.get(
  "/orders",
  parseQuery(adminOrdersListSchema),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };
    const where = status ? { status: status as never } : {};
    const [total, items] = await Promise.all([
      prisma.order.count({ where: where as never }),
      prisma.order.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { fullName: true, username: true } },
          provider: { include: { user: { select: { fullName: true, username: true } } } },
          payments: { select: { status: true, receiptUrl: true, createdAt: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);


router.get(
  "/ads",
  parseQuery(adminAdsListSchema),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };
    const where = status ? { status: status as never } : {};
    const [total, items] = await Promise.all([
      prisma.ad.count({ where: where as never }),
      prisma.ad.findMany({
        where: where as never,
        orderBy: { updatedAt: "desc" },
        include: { teacher: { include: { user: { select: { fullName: true, username: true } } } } },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);


// بلاغات المحادثات
router.get(
  "/chat/reports",
  parseQuery(adminReportsListSchema),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };
    const where = status ? { status: status as never } : {};
    const [total, items] = await Promise.all([
      prisma.chatReport.count({ where: where as never }),
      prisma.chatReport.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: {
          reporter: { select: { fullName: true, username: true } },
          message: { select: { body: true, attachmentUrl: true, sender: { select: { fullName: true } } } },
          room: { select: { id: true, type: true, title: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);


router.patch(
  "/chat/reports/:id",
  parseBody(adminReportResolve),
  asyncHandler(async (req, res) => {
    const report = await prisma.chatReport.findUnique({ where: { id: req.params.id } });
    if (!report) throw notFound("البلاغ غير موجود");
    const updated = await prisma.chatReport.update({
      where: { id: report.id },
      data: { status: (req.body as { status: "NEW" | "RESOLVED" }).status },
    });
    res.json({ data: updated });
  }),
);

// ============================================================
// الإحصائيات الحقيقية (count/sum/groupBy فقط — لا أرقام مؤلفة)
// ============================================================
router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [students, teachers, teachersPending, requestsNew, requestsCompleted, approvedPayments, commissionRate, requestByUni, enrollByUni, enrollByOffering, serviceOrders] =
      await Promise.all([
        prisma.user.count({ where: { role: "STUDENT" } }),
        prisma.teacherProfile.count(),
        prisma.teacherProfile.count({ where: { status: "PENDING" } }),
        prisma.explainRequest.count({ where: { status: "PENDING_REVIEW" } }),
        prisma.explainRequest.count({ where: { status: { in: ["TEACHER_SELECTED", "CLOSED"] } } }),
        prisma.payment.findMany({
          where: { status: "APPROVED" },
          select: { orderId: true },
        }),
        getCommissionRate(),
        // طلبات الشرح حسب الجامعة
        prisma.explainRequest.groupBy({ by: ["universityId"], _count: { _all: true }, where: { universityId: { not: null } } }),
        // الاشتراكات الحقيقية حسب جامعة المقرر؟ (عبر enrollment -> offering -> course)
        prisma.enrollment.findMany({
          select: { offering: { select: { course: { select: { universityId: true } } } } },
        }),
        // ملخص الاشتراكات حسب الدورات
        prisma.enrollment.groupBy({ by: ["offeringId"], _count: { _all: true } }),
        // طلبات الخدمات الإجمالية حسب الخدمة
        prisma.order.groupBy({
          by: ["targetId"],
          _count: { _all: true },
          where: { targetType: "SERVICE", targetId: { not: null } },
        }),
      ]);

    // مجموع المدفوعات المعتمدة (فقط عبر الطلبات المرتبطة بسندات مقبولة)
    const approvedOrderIds = [...new Set(approvedPayments.map((p) => p.orderId))];
    const revenueAgg = await prisma.order.aggregate({
      where: { id: { in: approvedOrderIds } },
      _sum: { amount: true },
    });
    const revenueConfirmed = revenueAgg._sum.amount ?? 0;
    const teachersDues = Math.round(revenueConfirmed * (1 - commissionRate) * 100) / 100;

    // أعلى الجامعات: طلبات الشرح + الاشتراكات في دورات مقررات كل جامعة
    const uniScores = new Map<string, { requests: number; enrollments: number }>();
    for (const row of requestByUni) {
      if (!row.universityId) continue;
      const cur = uniScores.get(row.universityId) ?? { requests: 0, enrollments: 0 };
      cur.requests += row._count._all;
      uniScores.set(row.universityId, cur);
    }
    for (const enroll of enrollByUni) {
      const uniId = enroll.offering?.course?.universityId;
      if (!uniId) continue;
      const cur = uniScores.get(uniId) ?? { requests: 0, enrollments: 0 };
      cur.enrollments += 1;
      uniScores.set(uniId, cur);
    }
    const topUniIds = [...uniScores.entries()]
      .sort((a, b) => b[1].requests + b[1].enrollments - (a[1].requests + a[1].enrollments))
      .slice(0, 5);
    const topUnis = await prisma.university.findMany({
      where: { id: { in: topUniIds.map(([id]) => id) } },
      select: { id: true, name: true, slug: true },
    });
    const topUniversities = topUniIds.map(([id, score]) => {
      const uni = topUnis.find((u) => u.id === id);
      return {
        id,
        name: uni?.name ?? "غير معروف",
        slug: uni?.slug ?? "",
        requests: score.requests,
        enrollments: score.enrollments,
        total: score.requests + score.enrollments,
      };
    });

    // أعلى المقررات: من الاشتراكات الحقيقية فقط
    const offeringIds = enrollByOffering
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 5);
    const topOfferings = await prisma.courseOffering.findMany({
      where: { id: { in: offeringIds.map((o) => o.offeringId) } },
      select: {
        id: true, title: true,
        course: { select: { title: true, university: { select: { name: true, slug: true } } } },
      },
    });
    const topCourses = offeringIds.map((row) => {
      const off = topOfferings.find((o) => o.id === row.offeringId);
      return {
        offeringId: row.offeringId,
        title: off?.title ?? off?.course.title ?? null,
        courseTitle: off?.course?.title ?? null,
        university: off?.course?.university?.name ?? null,
        enrollments: row._count._all,
      };
    });

    // أعلى الخدمات (عدد طلبات الخدمة الفعلية)
    const topServiceRows = serviceOrders
      .filter((s) => s.targetId)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 5);
    const topServicesRaw = await prisma.service.findMany({
      where: { id: { in: topServiceRows.map((s) => s.targetId ?? "") } },
      select: { id: true, slug: true, title: true, basePrice: true },
    });
    const topServices = topServiceRows.map((row) => {
      const svc = topServicesRaw.find((s) => s.id === row.targetId);
      return {
        id: svc?.id ?? "",
        slug: svc?.slug ?? "",
        title: svc?.title ?? "غير معروف",
        basePrice: svc?.basePrice ?? null,
        orders: row._count._all,
      };
    });

    res.json({
      data: {
        students,
        teachers,
        teachersPending,
        requestsNew,
        requestsCompleted,
        revenueConfirmed,
        teachersDues,
        topUniversities,
        topCourses,
        topServices,
      },
    });
  }),
);

// ============================================================
// الإعدادات
// ============================================================
router.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    // نعيد فقط المفاتيح المعروفة (الإعدادات المفتوحة للإدارة)
    const filtered: Record<string, string> = {};
    for (const key of SETTING_KEYS) filtered[key] = settings[key] ?? "";
    res.json({ data: filtered });
  }),
);

router.put(
  "/settings",
  parseBody(adminSettingsUpdate),
  asyncHandler(async (req, res) => {
    const data = req.body as Record<string, string | undefined>;
    // تحقق نسبة العمولة رقميًا 0..1
    if (data.commission_rate !== undefined) {
      const rate = Number(data.commission_rate);
      if (!Number.isFinite(rate) || rate < 0 || rate >= 1) {
        throw badRequest("نسبة العمولة يجب أن تكون رقمًا بين 0 و 0.99");
      }
    }
    const updates: Record<string, string> = {};
    for (const key of SETTING_KEYS) {
      if (data[key] !== undefined) updates[key] = data[key] as string;
    }
    await setSettings(updates);
    const settings = await getSettings();
    res.json({ data: settings, message: "تم تحديث الإعدادات" });
  }),
);

// ============================================================
// بث إشعار عام
// ============================================================
router.post(
  "/notifications/broadcast",
  parseBody(adminBroadcastSchema),
  asyncHandler(async (req, res) => {
    const { role, title, body, link } = req.body as { role?: "STUDENT" | "TEACHER" | "ADMIN"; title: string; body?: string; link?: string };
    const users = await prisma.user.findMany({
      where: role ? { role } : {},
      select: { id: true },
    });
    await notifyUsers({ userIds: users.map((u) => u.id), title, body, link, type: "BROADCAST" });
    res.json({ data: { notified: users.length }, message: `أُرسل الإشعار إلى ${users.length} مستخدم` });
  }),
);

// ============================================================
// سجل التدقيق — قراءة فقط للإدارة المخولة (لا تعديل ولا حذف لأي مستخدم)
// ============================================================
router.get(
  "/audit-logs",
  parseQuery(
    z.object({
      action: z.string().trim().max(80).optional(),
      category: z.string().trim().max(40).optional(),
      result: z.enum(["SUCCESS", "FAILURE"]).optional(),
      userId: z.string().trim().max(60).optional(),
      q: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { action, category, result, userId, q, page, limit } = req.query as unknown as {
      action?: string;
      category?: string;
      result?: "SUCCESS" | "FAILURE";
      userId?: string;
      q?: string;
      page: number;
      limit: number;
    };

    const where: Record<string, unknown> = {
      ...(action ? { action } : {}),
      ...(category ? { category } : {}),
      ...(result ? { result } : {}),
      ...(userId ? { userId } : {}),
      ...(q
        ? {
            OR: [
              { requestId: { contains: q, mode: "insensitive" } },
              { targetId: { contains: q, mode: "insensitive" } },
              { user: { username: { contains: q, mode: "insensitive" } } },
              { user: { fullName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where: where as never }),
      prisma.auditLog.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, fullName: true, username: true, role: true } } },
        ...skipTake(page, limit),
      }),
    ]);

    // الزمن يُعرض بتوقيت UTC (ISO) — الترجمة للتوقيت المحلي تتم في الواجهة
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);

// ============================================================
// طلبات الخدمات المخصصة والشروحات غير المتوفرة (إدارة كاملة)
// ============================================================

router.get(
  "/custom-requests",
  parseQuery(listCustomRequestsQuerySchema),
  asyncHandler(async (req, res) => {
    const { status, requestType, q, page, limit } = req.query as any;
    const where: any = {};

    if (status) where.status = status;
    if (requestType) where.requestType = requestType;
    if (q) {
      where.OR = [
        { requestNo: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { user: { fullName: { contains: q, mode: "insensitive" } } },
        { user: { username: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.customServiceRequest.count({ where }),
      prisma.customServiceRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              email: true,
              whatsapp: true,
              role: true,
              level: true,
              university: { select: { name: true } },
              major: { select: { name: true } },
            },
          },
        },
        ...skipTake(page, limit),
      }),
    ]);

    res.json({
      data: items,
      meta: pageMeta(total, page, limit),
    });
  }),
);

router.get(
  "/custom-requests/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.customServiceRequest.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            email: true,
            whatsapp: true,
            role: true,
            level: true,
            university: { select: { name: true } },
            major: { select: { name: true } },
          },
        },
      },
    });
    if (!item) throw notFound("طلب الخدمة المخصصة غير موجود");
    res.json({ data: item });
  }),
);

router.patch(
  "/custom-requests/:id",
  parseBody(updateCustomRequestStatusSchema),
  asyncHandler(async (req, res) => {
    const { status, adminNotes, notifyUser } = req.body as {
      status: any;
      adminNotes?: string;
      notifyUser?: boolean;
    };

    const existing = await prisma.customServiceRequest.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!existing) throw notFound("طلب الخدمة المخصصة غير موجود");

    await audit({
      req,
      userId: req.user!.id,
      actorRole: req.user!.role,
      action: "CUSTOM_REQUEST_STATUS_UPDATE",
      category: "REQUEST",
      targetType: "CustomServiceRequest",
      targetId: existing.id,
      oldValues: { status: existing.status },
      newValues: { status },
    });

    const updated = await prisma.customServiceRequest.update({
      where: { id: existing.id },
      data: {
        status,
        ...(adminNotes !== undefined ? { adminNotes } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            email: true,
            whatsapp: true,
            level: true,
          },
        },
      },
    });

    const statusArabic = CUSTOM_REQUEST_STATUS_ARABIC[status] || status;

    // إشعار المستخدم بالتحديث إذا كان الخيار مفعلاً
    if (notifyUser) {
      try {
        await notifyUsers({
          userIds: [existing.userId],
          title: `تحديث طلبك: ${existing.title}`,
          body: `أصبحت حالة طلبك «${statusArabic}»${adminNotes ? ` — ${adminNotes}` : ""}`,
          link: `/dashboard/requests`,
          type: "CUSTOM_REQUEST_STATUS",
        });

        // إرسال إشعار بريدي للمستخدم بتحديث الحالة
        if (existing.user?.email) {
          const updateEmail = buildStatusUpdateNotification({
            recipientName: existing.user.fullName,
            requestNo: existing.requestNo,
            title: existing.title,
            newStatusArabic: statusArabic,
            adminNotes,
            updatedAt: updated.updatedAt,
          });

          void sendMail({
            to: existing.user.email,
            subject: updateEmail.subject,
            text: updateEmail.text,
            html: updateEmail.html,
            type: "STATUS_UPDATE",
            metadata: {
              requestId: existing.id,
              requestNo: existing.requestNo,
              newStatus: status,
            },
          });
        }
      } catch (err) {
        console.error("[ADMIN:custom-requests] تعذر إرسال إشعار للمستخدم:", err);
      }
    }

    res.json({
      data: updated,
      message: `تم تحديث حالة الطلب إلى «${statusArabic}» بنجاح`,
    });
  }),
);

router.post(
  "/custom-requests/:id/resend-email",
  asyncHandler(async (req, res) => {
    const item = await prisma.customServiceRequest.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          include: {
            university: { select: { name: true } },
            major: { select: { name: true } },
          },
        },
      },
    });
    if (!item) throw notFound("الطلب غير موجود");

    const user = item.user;
    const typeArabic = CUSTOM_REQUEST_TYPE_ARABIC[item.requestType] || item.requestType;

    const attachmentUrls =
      item.attachments && Array.isArray(item.attachments)
        ? (item.attachments as any[]).map((att: any) => ({
            name: att.name || "مرفق",
            url: att.url.startsWith("http") ? att.url : `${process.env.CLIENT_URL || "http://localhost:5173"}${att.url}`,
          }))
        : undefined;

    const notif = buildCustomRequestNotification({
      requestNo: item.requestNo,
      applicant: {
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        whatsapp: user.whatsapp,
        universityName: user.university?.name || null,
        majorName: user.major?.name || null,
        level: user.level || null,
      },
      requestType: typeArabic,
      title: item.title,
      description: item.description,
      universityName: item.universityName,
      majorName: item.majorName,
      academicLevel: item.academicLevel,
      deadline: item.deadline,
      budget: item.budget,
      createdAt: item.createdAt,
      attachmentUrls,
    });

    const mailResult = await sendAdminNotificationEmail({
      subject: notif.subject,
      text: notif.text,
      html: notif.html,
      type: "CUSTOM_REQUEST",
      metadata: {
        requestId: item.id,
        requestNo: item.requestNo,
        userId: user.id,
        resend: true,
      },
      forceResend: true,
    });

    const updated = await prisma.customServiceRequest.update({
      where: { id: item.id },
      data: {
        emailSent: mailResult.delivered,
        emailSentAt: mailResult.delivered ? new Date() : item.emailSentAt,
        emailError: mailResult.delivered
          ? null
          : mailResult.error || (mailResult.simulated ? "وضع اختبار محلي (Stub)" : "تعذر إرسال البريد"),
      },
    });

    res.json({
      data: updated,
      message: mailResult.delivered
        ? "تمت إعادة إرسال الإشعار البريدي بنجاح"
        : mailResult.simulated
        ? "تم تسجيل محاكاة الإرسال في وضع الاختبار بنجاح"
        : "تعذر إرسال البريد، يرجى التحقق من إعدادات مزود الخدمة",
    });
  }),
);

export default router;
