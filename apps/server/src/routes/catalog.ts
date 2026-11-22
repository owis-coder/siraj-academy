import { Router } from "express";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { pageMeta, skipTake } from "../validation/common";
import {
  universityListSchema,
  collegeListSchema,
  majorListSchema,
  courseListSchema,
  teacherListSchema,
  serviceListSchema,
  searchSchema,
  serviceOrderSchema,
  favoriteToggleSchema,
} from "../validation/catalog";

const router = Router();

// قاعدة الوصول للدروس المدفوعة: تُحسب لكل دورة على حدة.
// الاشتراك في دورة مدرّس لا يفتح الدورات المدفوعة لمدرّسي المقرر الآخرين.
async function paidAccessByOffering(
  userId: string | undefined,
  offerings: Array<{ id: string; teacherId: string }>,
): Promise<Map<string, boolean>> {
  const access = new Map<string, boolean>(offerings.map((o) => [o.id, false]));
  if (!userId || offerings.length === 0) return access;

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { teacherProfile: { select: { id: true } } } });
  if (!user) return access;

  if (user.role === "ADMIN") {
    for (const o of offerings) access.set(o.id, true);
    return access;
  }

  // المدرس يرى دروس دوراته هو فقط
  if (user.teacherProfile) {
    for (const o of offerings) if (o.teacherId === user.teacherProfile.id) access.set(o.id, true);
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { userId, offeringId: { in: offerings.map((o) => o.id) } },
    select: { offeringId: true },
  });
  for (const e of enrollments) access.set(e.offeringId, true);
  return access;
}

// ---------- الجامعات ----------
router.get(
  "/universities",
  parseQuery(universityListSchema),
  asyncHandler(async (req, res) => {
    const { page, limit, q } = req.query as unknown as { page: number; limit: number; q: string };
    const where = {
      isVisible: true,
      ...(q ? { name: { contains: q } } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.university.count({ where }),
      prisma.university.findMany({
        where,
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          logoUrl: true,
          _count: { select: { colleges: true, majors: true, courses: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);
    // الواجهة تقرأ coursesCount مباشرةً، فلا نُرسل _count فقط
    const data = items.map(({ _count, ...u }) => ({ ...u, coursesCount: _count.courses }));
    res.json({ data, meta: pageMeta(total, page, limit) });
  }),
);

router.get(
  "/universities/:slug",
  asyncHandler(async (req, res) => {
    const uni = await prisma.university.findUnique({ where: { slug: req.params.slug } });
    if (!uni || !uni.isVisible) throw notFound("الجامعة غير موجودة");

    const [colleges, teachers, offeringsAgg, services] = await Promise.all([
      prisma.college.findMany({
        where: { universityId: uni.id },
        orderBy: { name: "asc" },
        include: { _count: { select: { courses: true, majors: true } } },
      }),
      prisma.teacherProfile.findMany({
        where: {
          status: "APPROVED",
          offerings: { some: { course: { universityId: uni.id } } },
        },
        include: { user: { select: { fullName: true, username: true, isVerified: true } }, _count: { select: { offerings: true } } },
      }),
      prisma.courseOffering.aggregate({
        where: { course: { universityId: uni.id }, status: "PUBLISHED" },
        _count: true,
        _min: { price: true },
        _avg: { price: true },
        _max: { price: true },
      }),
      prisma.service.findMany({
        where: {
          isActive: true,
          provider: { offerings: { some: { course: { universityId: uni.id } } } },
        },
        select: { id: true, slug: true, title: true, category: true, basePrice: true, durationDays: true },
        take: 8,
      }),
    ]);

    res.json({
      data: {
        university: { id: uni.id, name: uni.name, slug: uni.slug, city: uni.city, logoUrl: uni.logoUrl },
        colleges,
        majorsCount: colleges.reduce((a: number, c: { _count: { majors: number } }) => a + c._count.majors, 0),
        coursesCount: colleges.reduce((a: number, c: { _count: { courses: number } }) => a + c._count.courses, 0),
        teachers: teachers.map((t) => ({
          id: t.id,
          username: t.user.username,
          fullName: t.user.fullName,
          specialties: t.specialties,
          offeringsCount: t._count.offerings,
        })),
        priceSummary: {
          offeringsCount: offeringsAgg._count,
          minPrice: offeringsAgg._min.price ?? null,
          avgPrice: offeringsAgg._avg.price ?? null,
          maxPrice: offeringsAgg._max.price ?? null,
        },
        servicesForUniversity: services,
      },
    });
  }),
);

// ---------- الكليات ----------
router.get(
  "/colleges",
  parseQuery(collegeListSchema),
  asyncHandler(async (req, res) => {
    const { universityId } = req.query as unknown as { universityId?: string };
    const items = await prisma.college.findMany({
      where: universityId ? { universityId } : {},
      orderBy: { name: "asc" },
      include: { _count: { select: { courses: true, majors: true } }, university: { select: { name: true, slug: true } } },
    });
    res.json({ data: items, meta: { total: items.length } });
  }),
);

// ---------- التخصصات ----------
router.get(
  "/majors",
  parseQuery(majorListSchema),
  asyncHandler(async (req, res) => {
    const { universityId, collegeId } = req.query as unknown as { universityId?: string; collegeId?: string };
    const items = await prisma.major.findMany({
      where: {
        ...(universityId ? { universityId } : {}),
        ...(collegeId ? { collegeId } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { courses: true } },
        university: { select: { name: true, slug: true } },
        college: { select: { name: true } },
      },
    });
    res.json({ data: items, meta: { total: items.length } });
  }),
);

// ---------- المقررات ----------
router.get(
  "/courses",
  optionalAuth(),
  parseQuery(courseListSchema),
  asyncHandler(async (req, res) => {
    const { universityId, collegeId, majorId, level, q, page, limit } =
      req.query as unknown as { universityId?: string; collegeId?: string; majorId?: string; level?: string; q: string; page: number; limit: number };

    // mine=true (طالب مسجل): مقرراته التي اشترك في دوراتها
    let mineCourseIds: string[] | undefined;
    if (req.query.mine === "true" && req.user) {
      const myEnroll = await prisma.enrollment.findMany({
        where: { userId: req.user.id },
        select: { offering: { select: { courseId: true } } },
      });
      mineCourseIds = [...new Set(myEnroll.map((e) => e.offering.courseId))];
    }

    const where: Record<string, unknown> = {
      isVisible: true,
      ...(universityId ? { universityId } : {}),
      ...(collegeId ? { collegeId } : {}),
      ...(majorId ? { majorId } : {}),
      ...(level ? { level } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { code: { contains: q } }] } : {}),
      ...(mineCourseIds ? { id: { in: mineCourseIds } } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          code: true,
          level: true,
          coverUrl: true,
          university: { select: { name: true, slug: true } },
          _count: { select: { offerings: { where: { status: "PUBLISHED" } } } },
        },
        ...skipTake(page, limit),
      }),
    ]);
    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);

// تفاصيل مقرر: دروس TRIAL للعامة، وPAID للمشترك/المالك/الإدارة
router.get(
  "/courses/:id",
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        university: { select: { name: true, slug: true } },
        college: { select: { name: true } },
        major: { select: { name: true } },
      },
    });
    if (!course || !course.isVisible) throw notFound("المقرر غير موجود");

    const offeringsRaw = await prisma.courseOffering.findMany({
      where: { courseId: course.id, status: "PUBLISHED" },
      include: {
        teacher: {
          include: { user: { select: { fullName: true, username: true, isVerified: true } } },
        },
        lessons: { orderBy: { order: "asc" } },
        _count: { select: { enrollments: true, reviews: true } },
      },
      orderBy: { price: "asc" },
    });

    const userId = req.user?.id;
    const accessByOffering = await paidAccessByOffering(
      userId,
      offeringsRaw.map((o) => ({ id: o.id, teacherId: o.teacher.id })),
    );

    const offerings = offeringsRaw.map((o) => {
      // يرى الزائر والطالب غير المشترك عناوين وترتيب وقفل كافة الدروس،
      // ولا يُعرض أي رابط فيديو قبل اعتماد الإدارة.
      const seeAll = accessByOffering.get(o.id) === true;
      const lessons = o.lessons.map((l) => {
        if (seeAll) return l;
        if (l.access === "TRIAL" && l.reviewStatus === "APPROVED") return l;
        return {
          ...l,
          videoUrl: "",
        };
      });
      return {
        id: o.id,
        title: o.title,
        summary: o.summary,
        price: o.price,
        accessType: o.accessType,
        trialVideoUrl: seeAll || o.trialVideoStatus === "APPROVED" ? o.trialVideoUrl : null,
        youtubeUrls: seeAll ? o.youtubeUrls : o.approvedYoutubeUrls,
        createdAt: o.createdAt,
        teacherName: o.teacher.user.fullName,
        teacherUsername: o.teacher.user.username,
        teacherDegree: o.teacher.degree,
        enrollments: o._count.enrollments,
        reviews: o._count.reviews,
        canSeeAllLessons: seeAll,
        lessons,
      };
    });

    res.json({ data: { course, offerings } });
  }),
);

// ---------- المدرسون ----------
router.get(
  "/teachers",
  parseQuery(teacherListSchema),
  asyncHandler(async (req, res) => {
    const { university, q, page, limit } = req.query as unknown as { university?: string; q: string; page: number; limit: number };

    const where: {
      status: "APPROVED";
      offerings?: { some: { course: { universityId: string } } };
      OR?: Array<Record<string, unknown>>;
    } = { status: "APPROVED" as const };

    if (university) {
      // القبول بمعرّف الجامعة أو اسمها
      const byId = await prisma.university.findUnique({ where: { id: university }, select: { id: true } });
      const byName = byId ? null : await prisma.university.findFirst({ where: { name: { contains: university } }, select: { id: true } });
      const uniId = byId?.id ?? byName?.id;
      if (uniId) where.offerings = { some: { course: { universityId: uniId } } };
    }
    if (q) {
      where.OR = [
        { user: { fullName: { contains: q } } },
        { user: { username: { contains: q } } },
        { bio: { contains: q } },
        { specialties: { has: q } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.teacherProfile.count({ where }),
      prisma.teacherProfile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          degree: true,
          bio: true,
          specialties: true,
          universitiesText: true,
          user: { select: { fullName: true, username: true, isVerified: true } },
          _count: { select: { offerings: { where: { status: "PUBLISHED" } } } },
        },
        ...skipTake(page, limit),
      }),
    ]);

    res.json({
      data: items.map((t) => ({
        id: t.id,
        degree: t.degree,
        bio: t.bio,
        specialties: t.specialties,
        universitiesText: t.universitiesText,
        fullName: t.user.fullName,
        username: t.user.username,
        publishedOfferings: t._count.offerings,
      })),
      meta: pageMeta(total, page, limit),
    });
  }),
);

router.get(
  "/teachers/:username",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      include: { teacherProfile: true },
    });
    if (!user || user.role !== "TEACHER" || !user.teacherProfile || user.teacherProfile.status !== "APPROVED") {
      throw notFound("المدرس غير موجود أو لم يُفعّل بعد");
    }

    const profile = user.teacherProfile;
    const [offerings, services, enrollmentsCount] = await Promise.all([
      prisma.courseOffering.findMany({
        where: { teacherId: profile.id, status: "PUBLISHED" },
        select: {
          id: true,
          title: true,
          summary: true,
          price: true,
          accessType: true,
          courseId: true,
          course: { select: { title: true, university: { select: { name: true, slug: true } } } },
          _count: { select: { enrollments: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.service.findMany({
        where: { providerId: profile.id, isActive: true },
        select: { id: true, slug: true, title: true, category: true, basePrice: true, durationDays: true, description: true },
      }),
      prisma.enrollment.count({ where: { offering: { teacherId: profile.id } } }),
    ]);

    res.json({
      data: {
        fullName: user.fullName,
        username: user.username,
        degree: profile.degree,
        bio: profile.bio,
        specialties: profile.specialties,
        universitiesText: profile.universitiesText,
        stats: { students: enrollmentsCount, offerings: offerings.length, services: services.length },
        offerings,
        services,
      },
    });
  }),
);

// ---------- الخدمات ----------
router.get(
  "/services",
  parseQuery(serviceListSchema),
  asyncHandler(async (req, res) => {
    const { category, q } = req.query as unknown as { category?: string; q: string };
    const items = await prisma.service.findMany({
      where: {
        isActive: true,
        ...(category ? { category: category as never } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] } : {}),
      },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        description: true,
        basePrice: true,
        durationDays: true,
        isFeatured: true,
        provider: { select: { user: { select: { fullName: true, username: true, isVerified: true } }, degree: true } },
      },
    });
    res.json({ data: items, meta: { total: items.length } });
  }),
);

router.get(
  "/services/:slug",
  asyncHandler(async (req, res) => {
    const service = await prisma.service.findUnique({
      where: { slug: req.params.slug },
      include: { provider: { include: { user: { select: { fullName: true, username: true, isVerified: true } } } } },
    });
    if (!service || !service.isActive) throw notFound("الخدمة غير موجودة");
    res.json({ data: service });
  }),
);

// ---------- طلب خدمة -> طلب دفع ----------
router.post(
  "/service-orders",
  requireAuth("STUDENT"),
  parseBody(serviceOrderSchema),
  asyncHandler(async (req, res) => {
    const { slug, providerId, notes } = req.body as { slug: string; providerId?: string; notes?: string };

    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service || !service.isActive) throw notFound("الخدمة غير موجودة أو غير مفعّلة");

    // الخدمات بلا سعر ثابت تمر عبر طلب الشرح/عرض من المدرس
    if (service.basePrice == null) {
      throw notFound("هذه الخدمة بلا سعر ثابت؛ أنشئ طلب شرح حتى يقترح المدرسون عروضهم");
    }

    const { nextOrderNo } = await import("../lib/orderNo");
    const orderNo = await nextOrderNo();

    // لا يختار الطالب المدرس مباشرة: الإدارة هي من تعيّن مزوّد الخدمة.
    // يُتجاهل providerId القادم من العميل، ويُعتمد ما حددته الإدارة على الخدمة فقط.
    void providerId;
    const providerIdToUse = service.providerId ?? null;

    const order = await prisma.order.create({
      data: {
        orderNo,
        studentId: req.user!.id,
        targetType: "SERVICE",
        targetId: service.id,
        amount: service.basePrice,
        title: service.title,
        status: "AWAITING_PAYMENT",
        notes,
        providerId: providerIdToUse,
      },
    });

    res.status(201).json({
      data: { order, message: "تم إنشاء طلب الخدمة. ارفع سند الحوالة لبدء مراجعة الإدارة." },
    });
  }),
);

// ---------- البحث العام ----------
router.get(
  "/catalog/search",
  parseQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const q = (req.query as unknown as { q: string }).q;

    const [universities, courses, teachers, services] = await Promise.all([
      prisma.university.findMany({
        where: { isVisible: true, OR: [{ name: { contains: q } }, { city: { contains: q } }] },
        select: { id: true, name: true, slug: true, city: true },
        take: 5,
      }),
      prisma.course.findMany({
        where: { isVisible: true, OR: [{ title: { contains: q } }, { code: { contains: q } }] },
        select: { id: true, title: true, code: true, university: { select: { name: true, slug: true } } },
        take: 5,
      }),
      prisma.teacherProfile.findMany({
        where: {
          status: "APPROVED",
          OR: [
            { user: { fullName: { contains: q } } },
            { user: { username: { contains: q } } },
            { specialties: { has: q } },
          ],
        },
        select: { id: true, degree: true, user: { select: { fullName: true, username: true, isVerified: true } } },
        take: 5,
      }),
      prisma.service.findMany({
        where: { isActive: true, OR: [{ title: { contains: q } }, { description: { contains: q } }] },
        select: { id: true, slug: true, title: true, category: true, basePrice: true },
        take: 5,
      }),
    ]);

    res.json({ data: { universities, courses, teachers, services } });
  }),
);

// مسارات المفضلة لكل مستخدم (طالب)
router.get(
  "/favorites",
  requireAuth("STUDENT", "TEACHER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const items = await prisma.favorite.findMany({ where: { userId: req.user!.id } });
    res.json({ data: items });
  }),
);

router.post(
  "/favorites/:targetId/toggle",
  requireAuth("STUDENT", "TEACHER", "ADMIN"),
  parseBody(favoriteToggleSchema),
  asyncHandler(async (req, res) => {
    const { targetType } = req.body as { targetType: "SERVICE" | "OFFERING" | "TEACHER" };
    const targetId = req.params.targetId;
    const existing = await prisma.favorite.findUnique({
      where: { userId_targetId_targetType: { userId: req.user!.id, targetId, targetType } },
    });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return res.json({ data: { favorited: false } });
    }
    await prisma.favorite.create({ data: { userId: req.user!.id, targetId, targetType } });
    res.status(201).json({ data: { favorited: true } });
  }),
);

// ---------- اشتراكاتي (طالب): الدورات المفتوحة لي مع معلومات المقرر ----------
router.get(
  "/enrollments",
  requireAuth("STUDENT", "TEACHER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        offering: {
          select: {
            id: true,
            title: true,
            summary: true,
            price: true,
            accessType: true,
            status: true,
            course: { select: { id: true, title: true, code: true } },
            teacher: { select: { user: { select: { username: true, fullName: true, isVerified: true } } } },
            _count: { select: { lessons: true } },
          },
        },
      },
    });
    const items = enrollments.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      offering: e.offering,
    }));
    res.json({ data: items, meta: { total: items.length } });
  }),
);

export default router;
