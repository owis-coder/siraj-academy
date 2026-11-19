import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { nextOrderNo } from "../lib/orderNo";
import { notifyUsers, notifyAdmins } from "../lib/notify";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../lib/errors";
import { requireAuth, requireApprovedTeacher, optionalAuth } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { pageMeta, skipTake } from "../validation/common";
import {
  createOfferingSchema,
  updateOfferingSchema,
  lessonCreateSchema,
  lessonUpdateSchema,
  liveSessionCreateSchema,
  offeringListQuerySchema,
} from "../validation/offerings";

const router = Router();

// حقل ت‘ربط الحقوق: جلب offering مع تحقق الملكية
async function getOwnedOffering(offeringId: string, userId: string, isAdmin = false) {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: { course: { select: { title: true, universityId: true, isVisible: true } } },
  });
  if (!offering) throw notFound("الدورة غير موجودة");
  if (!isAdmin) {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!profile || profile.id !== offering.teacherId) throw forbidden("لا تملك هذه الدورة");
  }
  return offering;
}

// ---------- إنشاء دورة (مدرس مفعّل؛ المقرر مرئي) — تُنشأ DRAFT ----------
router.post(
  "/",
  requireApprovedTeacher(),
  parseBody(createOfferingSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const course = await prisma.course.findUnique({ where: { id: data.courseId } });
    if (!course || !course.isVisible) throw badRequest("المقرر غير موجود أو معطل — اختر مقررًا مرئيًا");

    const offering = await prisma.courseOffering.create({
      data: {
        courseId: data.courseId,
        teacherId: profile.id,
        title: data.title,
        summary: data.summary,
        price: data.price,
        trialVideoUrl: data.trialVideoUrl,
        youtubeUrls: data.youtubeUrls ?? undefined,
        accessType: data.price === 0 ? "TRIAL" : "PAID",
        status: "DRAFT",
      },
      include: { course: { select: { title: true } } },
    });

    res.status(201).json({
      data: offering,
      message: "أُنشئت الدورة كمسودة؛ أضف الدروس ثم اجعله منشورًا عند اكتمال المحتوى.",
    });
  }),
);

// ---------- دورات المدرس (لوحة المدرس) ----------
router.get(
  "/mine",
  requireAuth("TEACHER"),
  parseQuery(offeringListQuerySchema),
  asyncHandler(async (req, res) => {
    const { status, q, page, limit } = req.query as unknown as { status?: string; q: string; page: number; limit: number };
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const where: Record<string, unknown> = {
      teacherId: profile.id,
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }, { course: { title: { contains: q } } }] } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.courseOffering.count({ where: where as never }),
      prisma.courseOffering.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        include: {
          course: { select: { title: true, university: { select: { name: true, slug: true } } } },
          _count: { select: { enrollments: true, lessons: true, reviews: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);

    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);

// ---------- تقديم الدورة لمراجعة الإدارة ----------
// النشر قرار إداري: التقديم ينقل الحالة إلى PENDING_REVIEW فقط،
// ولا يمكن للمدرس الوصول إلى PUBLISHED بأي مسار آخر.
router.post(
  "/:id/submit",
  requireApprovedTeacher(),
  asyncHandler(async (req, res) => {
    const offering = await getOwnedOffering(req.params.id, req.user!.id);
    if (offering.status === "PENDING_REVIEW") throw badRequest("الدورة قيد المراجعة مسبقًا");
    if (offering.status === "PUBLISHED") throw badRequest("الدورة منشورة مسبقًا");
    if (offering.status === "REJECTED") throw badRequest("الدورة مرفوضة من الإدارة؛ عدّلها ثم أعد تقديمها");

    const lessonsCount = await prisma.lesson.count({ where: { offeringId: offering.id } });
    if (lessonsCount === 0) throw badRequest("لا يمكن تقديم دورة بلا دروس؛ أضف درسًا واحدًا على الأقل");

    const updated = await prisma.courseOffering.update({
      where: { id: offering.id },
      data: { status: "PENDING_REVIEW" },
    });

    await notifyAdmins({
      title: "دورة بانتظار المراجعة",
      body: `${req.user!.fullName} قدّم دورة على مقرر: ${offering.course.title}`,
      link: `/admin/offerings?status=PENDING_REVIEW`,
      type: "OFFERING_PUBLISHED",
    });

    res.json({ data: updated, message: "أُرسلت الدورة لمراجعة الإدارة؛ ستظهر للزوار بعد الاعتماد." });
  }),
);

// ---------- تعديل دورة (المالك؛ الإدارة أيضًا) ----------
// النشر يمرّ حصريًا عبر /submit: لا يُقبل status=PUBLISHED من المدرس هنا،
// ولا يعدّل مدرّس غير معتمد دورته (نفس ضمان requireApprovedTeacher).
router.patch(
  "/:id",
  requireAuth("TEACHER", "ADMIN"),
  parseBody(updateOfferingSchema),
  asyncHandler(async (req, res) => {
    const isAdmin = req.user!.role === "ADMIN";
    if (!isAdmin && (!req.user!.teacherProfile || req.user!.teacherProfile.status !== "APPROVED")) {
      throw forbidden("حساب المدرس بانتظار مراجعة الإدارة ولم يُفعّل بعد");
    }

    const offering = await getOwnedOffering(req.params.id, req.user!.id, isAdmin);

    const data = req.body as {
      title?: string; summary?: string; price?: number;
      trialVideoUrl?: string | null; youtubeUrls?: string[] | null; status?: "DRAFT" | "PUBLISHED" | "HIDDEN";
    };

    if (data.status === "PUBLISHED" && !isAdmin) {
      throw badRequest("نشر الدورة قرار إداري؛ قدّم الدورة للمراجعة عبر /offerings/:id/submit");
    }

    const updated = await prisma.courseOffering.update({
      where: { id: offering.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.summary !== undefined ? { summary: data.summary } : {}),
        ...(data.price !== undefined
          ? { price: data.price, accessType: (data.price === 0 ? "TRIAL" : "PAID") as never }
          : {}),
        ...(data.trialVideoUrl !== undefined ? { trialVideoUrl: data.trialVideoUrl } : {}),
        ...(data.youtubeUrls !== undefined
          ? { youtubeUrls: (data.youtubeUrls === null ? Prisma.JsonNull : data.youtubeUrls) as Prisma.InputJsonValue }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: { course: { select: { title: true } } },
    });

    res.json({ data: updated });
  }),
);

// ---------- الدروس ----------
router.post(
  "/:id/lessons",
  requireApprovedTeacher(),
  parseBody(lessonCreateSchema),
  asyncHandler(async (req, res) => {
    const offering = await getOwnedOffering(req.params.id, req.user!.id);
    const { title, videoUrl, access, order } = req.body as {
      title: string; videoUrl: string; access: "TRIAL" | "PAID"; order: number;
    };
    const lesson = await prisma.lesson.create({
      data: { offeringId: offering.id, title, videoUrl, access, order },
    });
    res.status(201).json({ data: lesson });
  }),
);

router.patch(
  "/lessons/:lessonId",
  requireApprovedTeacher(),
  parseBody(lessonUpdateSchema),
  asyncHandler(async (req, res) => {
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.lessonId }, include: { offering: true } });
    if (!lesson) throw notFound("الدرس غير موجود");
    await getOwnedOffering(lesson.offeringId, req.user!.id);

    const { title, videoUrl, access, order } = req.body as {
      title?: string; videoUrl?: string; access?: string; order?: number;
    };
    const updated = await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(videoUrl !== undefined ? { videoUrl } : {}),
        ...(access !== undefined ? { access: access as "TRIAL" | "PAID" } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });
    res.json({ data: updated });
  }),
);

router.delete(
  "/lessons/:lessonId",
  requireApprovedTeacher(),
  asyncHandler(async (req, res) => {
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.lessonId } });
    if (!lesson) throw notFound("الدرس غير موجود");
    await getOwnedOffering(lesson.offeringId, req.user!.id);
    await prisma.lesson.delete({ where: { id: lesson.id } });
    res.json({ data: { message: "تم حذف الدرس" } });
  }),
);

// حذف الدورة كاملة (المالك)
router.delete(
  "/:id",
  requireAuth("TEACHER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const offering = await getOwnedOffering(req.params.id, req.user!.id, req.user!.role === "ADMIN");
    const enrollments = await prisma.enrollment.count({ where: { offeringId: offering.id } });
    if (enrollments > 0) throw conflict("لا يمكن حذف دورة بها مشتركون؛ أقفلها (HIDDEN) بدلاً من ذلك");
    await prisma.courseOffering.delete({ where: { id: offering.id } });
    res.json({ data: { message: "تم حذف الدورة" } });
  }),
);

// ---------- تفاصيل دورة (ظاهرة للجميع مع قاعدة وصول الدروس) ----------
router.get(
  "/:id",
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const offering = await prisma.courseOffering.findUnique({
      where: { id: req.params.id },
      include: {
        course: { select: { id: true, title: true, university: { select: { name: true, slug: true } } } },
        teacher: { include: { user: { select: { fullName: true, username: true } } } },
        lessons: { orderBy: { order: "asc" } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!offering || (offering.status !== "PUBLISHED" && req.user?.role !== "ADMIN")) {
      throw notFound("الدورة غير متاحة");
    }

    // من يرى الدروس المدفوعة: مشترك / المدرس المالك / الإدارة
    let seeAll = req.user?.role === "ADMIN";
    if (!seeAll && req.user) {
      if (req.user.teacherProfile && req.user.teacherProfile.id === offering.teacherId) {
        seeAll = true;
      } else {
        const enrolled = await prisma.enrollment.findFirst({
          where: { userId: req.user.id, offeringId: offering.id },
          select: { id: true },
        });
        seeAll = !!enrolled;
      }
    }

    const reviews = seeAll
      ? await prisma.review.findMany({
          where: { offeringId: offering.id },
          include: { user: { select: { fullName: true, username: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : [];

    res.json({
      data: {
        ...offering,
        teacherUsername: offering.teacher.user.username,
        teacherName: offering.teacher.user.fullName,
        canSeeAllLessons: seeAll,
        lessons: seeAll ? offering.lessons : offering.lessons.filter((l) => l.access === "TRIAL"),
        reviews,
      },
    });
  }),
);

// ---------- مسجلّو الدورة (المالك) ----------
router.get(
  "/:id/attendees",
  requireAuth("TEACHER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const offering = await getOwnedOffering(req.params.id, req.user!.id, req.user!.role === "ADMIN");
    const enrollments = await prisma.enrollment.findMany({
      where: { offeringId: offering.id },
      include: { user: { select: { id: true, fullName: true, username: true, whatsapp: true, university: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: enrollments, meta: { total: enrollments.length } });
  }),
);

// ---------- التسجيل في دورة (طالب) -> Order(AWAITING_PAYMENT) ----------
router.post(
  "/:id/enroll",
  requireAuth("STUDENT"),
  asyncHandler(async (req, res) => {
    const offering = await prisma.courseOffering.findUnique({
      where: { id: req.params.id },
      include: { course: { select: { title: true, isVisible: true } } },
    });
    if (!offering || offering.status !== "PUBLISHED") throw notFound("الدورة غير متاحة للتسجيل");

    const enrolled = await prisma.enrollment.findFirst({
      where: { userId: req.user!.id, offeringId: offering.id },
      select: { id: true },
    });
    if (enrolled) throw conflict("أنت مشترك في هذه الدورة مسبقًا");

    // إعادة استخدام طلب دفع معلّق لنفس الدورة إن وجد
    const existingOrder = await prisma.order.findFirst({
      where: { studentId: req.user!.id, targetType: "OFFERING", targetId: offering.id, status: "AWAITING_PAYMENT" },
    });
    if (existingOrder) {
      return res.json({
        data: { order: existingOrder, message: "لديك طلب دفع معلّق لنفس الدورة؛ أكمل الخطوات وارفع السند." },
      });
    }

    const orderNo = await nextOrderNo();
    const order = await prisma.order.create({
      data: {
        orderNo,
        studentId: req.user!.id,
        targetType: "OFFERING",
        targetId: offering.id,
        amount: offering.price,
        title: offering.title ?? offering.course.title,
        status: "AWAITING_PAYMENT",
        providerId: offering.teacherId,
      },
    });

    res.status(201).json({
      data: { order, message: "أُنشئ طلب الدفع. حوّل المبلغ وارفع السند لبدء المراجعة." },
    });
  }),
);

// ---------- الجلسات المباشرة (مضمنة هنا للربط بالدورات) — راوتر مستقل يُركَّب على /live-sessions
const liveRouter = Router();

// إنشاء جلسة مباشرة (مدرس مفعّل)
liveRouter.post(
  "/",
  requireApprovedTeacher(),
  parseBody(liveSessionCreateSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    if (data.offeringId) {
      const offering = await prisma.courseOffering.findUnique({ where: { id: data.offeringId } });
      if (!offering || offering.teacherId !== profile.id) throw forbidden("الدورة ليست لك");
    }

    const session = await prisma.liveSession.create({
      data: {
        offeringId: data.offeringId,
        teacherId: profile.id,
        title: data.title,
        startsAt: data.startsAt,
        durationMin: data.durationMin,
        price: data.price,
        capacity: data.capacity,
      },
      include: { offering: { select: { title: true, course: { select: { title: true } } } } },
    });

    res.status(201).json({ data: session });
  }),
);

// قائمة الجلسات (عام)
liveRouter.get(
  "/",
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const offeringId = typeof req.query.offeringId === "string" ? req.query.offeringId : undefined;
    const mine = req.query.mine === "true";

    let teacherFilter: string | undefined = undefined;
    if (mine) {
      if (!req.user) throw unauthorized("الوصول يتطلب تسجيل الدخول");
      if (req.user.role !== "TEACHER") throw forbidden("جلسات التدريس خاصة بالمدرسين فقط");
      const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) throw notFound("ملف المدرس غير موجود");
      teacherFilter = profile.id;
    }

    const sessions = await prisma.liveSession.findMany({
      where: {
        ...(offeringId ? { offeringId } : {}),
        ...(teacherFilter ? { teacherId: teacherFilter } : {}),
      },
      include: {
        teacher: { include: { user: { select: { fullName: true, username: true } } } },
        offering: { select: { title: true, course: { select: { title: true, university: { select: { name: true } } } } } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: { startsAt: "asc" },
      take: 50,
    });
    res.json({
      data: sessions.map((s) => ({
        ...s,
        teacherName: s.teacher.user.fullName,
        teacherUsername: s.teacher.user.username,
        bookingsCount: s._count.bookings,
      })),
      meta: { total: sessions.length },
    });
  }),
);

// حجز جلسة (طالب): مجانية => حجز فوري، مدفوعة => Order ثم حجز معلّق على الطلب
liveRouter.post(
  "/:id/book",
  requireAuth("STUDENT"),
  asyncHandler(async (req, res) => {
    const session = await prisma.liveSession.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    });
    if (!session) throw notFound("الجلسة غير موجودة");
    if (session.startsAt.getTime() < Date.now()) throw badRequest("انتهى موعد الجلسة ولا يمكن حجزها");

    const existingBooking = await prisma.liveBooking.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: req.user!.id } },
    });
    if (existingBooking && existingBooking.status === "CONFIRMED") throw conflict("لديك حجز على هذه الجلسة مسبقًا");

    const confirmedCount = session._count.bookings;
    // عدّ الحجوزات المؤكدة + الحجوزات المعلقة بطلبان دفع قيد الدفع
    if (session.capacity && confirmedCount >= session.capacity) {
      throw conflict("اكتملت المقاعد في هذه الجلسة");
    }

    const isFree = session.price == null || session.price === 0;

    if (isFree) {
      const booking = await prisma.liveBooking.upsert({
        where: { sessionId_userId: { sessionId: session.id, userId: req.user!.id } },
        update: { status: "CONFIRMED", orderId: null },
        create: { sessionId: session.id, userId: req.user!.id, status: "CONFIRMED" },
      });
      await notifyUsers({
        userIds: [session.teacherId],
        title: "حجز جديد على جلسة مباشرة",
        body: `${req.user!.fullName} حجز مقعدًا في جلسة "${session.title}".`,
        type: "LIVE_BOOKING",
      });
      return res.status(201).json({ data: { booking, message: "تم تأكيد حجزك المجاني للجلسة." } });
    }

    // جلسة مدفوعة: ننشئ طلب دفع أولاً ويُثبّت المقعد عند اعتماد السند
    const pendingOrder = await prisma.order.findFirst({
      where: {
        studentId: req.user!.id,
        targetType: "CUSTOM",
        targetId: session.id,
        status: "AWAITING_PAYMENT",
      },
    });
    if (pendingOrder) {
      return res.json({ data: { order: pendingOrder, message: "لديك طلب دفع معلّق لهذه الجلسة؛ ارفع السند." } });
    }

    const orderNo = await nextOrderNo();
    const order = await prisma.order.create({
      data: {
        orderNo,
        studentId: req.user!.id,
        targetType: "CUSTOM",
        targetId: session.id,
        amount: session.price as number,
        title: `جلسة مباشرة: ${session.title}`,
        status: "AWAITING_PAYMENT",
        providerId: session.teacherId,
        notes: "حجز جلسة مباشرة",
      },
    });
    // حجز مرتبط بالطلب (يُلغى تلقائيًا عند رفض السند)
    await prisma.liveBooking.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: req.user!.id } },
      update: { status: "CONFIRMED", orderId: order.id },
      create: { sessionId: session.id, userId: req.user!.id, status: "CONFIRMED", orderId: order.id },
    });

    res.status(201).json({ data: { order, message: "أُنشئ طلب دفع للجلسة؛ ارفع سند الحوالة لبدء المراجعة." } });
  }),
);

// جلساتي (مدرس)
liveRouter.get(
  "/mine",
  requireAuth("TEACHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");
    const sessions = await prisma.liveSession.findMany({
      where: { teacherId: profile.id },
      include: {
        teacher: { include: { user: { select: { fullName: true, username: true } } } },
        offering: { select: { title: true, course: { select: { title: true, university: { select: { name: true } } } } } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: { startsAt: "asc" },
    });
    res.json({
      data: sessions.map((s) => ({
        ...s,
        teacherName: s.teacher.user.fullName,
        teacherUsername: s.teacher.user.username,
        bookingsCount: s._count.bookings,
      })),
      meta: { total: sessions.length },
    });
  }),
);

export default router;
export { liveRouter };
