import { Router } from "express";
import { prisma } from "../lib/prisma";
import { nextOrderNo } from "../lib/orderNo";
import { notifyUsers, notifyAdmins, adminIds } from "../lib/notify";
import { sendAdminNotificationEmail } from "../lib/adminNotify";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { requireAuth, requireApprovedTeacher, optionalAuth } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { audit } from "../lib/audit";
import { pageMeta, skipTake } from "../validation/common";
import { createRequestSchema, requestListSchema, createOfferSchema } from "../validation/requests";
import { z } from "zod";

const rejectReasonSchema = z.object({ reason: z.string().trim().max(500).optional() });

const router = Router();

async function getRequestOrThrow(id: string) {
  const request = await prisma.explainRequest.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, fullName: true, username: true } },
      university: { select: { name: true, slug: true } },
      _count: { select: { offers: true } },
    },
  });
  if (!request) throw notFound("طلب الشرح غير موجود");
  return request;
}

// إنشاء طلب شرح (طالب) — يبدأ PENDING_REVIEW حتى نشره من الإدارة
router.post(
  "/",
  requireAuth("STUDENT"),
  parseBody(createRequestSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;

    const request = await prisma.explainRequest.create({
      data: {
        studentId: req.user!.id,
        universityId: data.universityId,
        collegeId: data.collegeId,
        majorId: data.majorId,
        courseTitle: data.courseTitle,
        details: data.details,
        type: data.type,
        urgency: data.urgency,
        budget: data.budget,
        deadline: data.deadline,
        attachments: data.attachments ?? undefined,
        linkUrl: data.linkUrl,
        status: "PENDING_REVIEW",
      },
    });

    // إشعار الإداريين بطلب جديد بانتظار المراجعة
    await notifyAdmins({
      title: "طلب شرح جديد بانتظار المراجعة",
      body: `${req.user!.fullName} طلب شرح: ${data.courseTitle}`,
      link: `/admin/requests?status=PENDING_REVIEW`,
      type: "REQUEST_NEW",
    });

    await notifyUsers({
      userIds: [req.user!.id],
      title: "تم استلام طلب شرحك",
      body: "سيُنشر طلبك بعد مراجعة الإدارة، وسيتقدّم المدرسون بعروضهم.",
      type: "REQUEST_NEW",
    });

    await audit({
      req,
      userId: req.user!.id,
      actorRole: req.user!.role,
      action: "EXPLAIN_REQUEST_CREATE",
      category: "REQUEST",
      targetType: "ExplainRequest",
      targetId: request.id,
      newValues: { courseTitle: request.courseTitle, status: request.status },
    });

    res.status(201).json({ data: request, message: "تم استلام طلب الشرح وسيُراجَع من الإدارة قبل نشره." });
  }),
);

// قائمة الطلبات (عرض قابل للتفاوض حسب الصفة):
// - الزائر: OPEN فقط (أما TEACHER_Selected/ closED فتصبح مرئية بمعلومات أقل)
// - الطالب: طلباته الشخصية بأي حالة + الطلبات المفتوحة للعموم
// - المدرس: الطلبات المفتوحة + الطلبات التي قدم عليها عرضًا (يتبع حالتها)
// - الإدارة: الكل (استخدم /admin/requests)
router.get(
  "/",
  optionalAuth(),
  parseQuery(requestListSchema),
  asyncHandler(async (req, res) => {
    const { university, status, q, page, limit, mine } = req.query as unknown as {
      university?: string; status?: string; q: string; page: number; limit: number; mine?: boolean;
    };
    const user = req.user;

    if (mine && !user) {
      throw unauthorized("الوصول يتطلب تسجيل الدخول");
    }

    // مرشح الرؤية السريع لكل صفة
    let visibility: Array<Record<string, unknown>> = [{ status: "OPEN" }];

    if (mine) {
      if (user?.role === "STUDENT") {
        // طلبات الطالب الشخصية فقط دون دمجها مع OPEN
        visibility = [{ studentId: user.id }];
      } else if (user?.role === "TEACHER") {
        const myOffers = await prisma.offer.findMany({
          where: { teacher: { userId: user.id } },
          select: { requestId: true },
        });
        visibility = [{ id: { in: myOffers.map((o) => o.requestId) } }];
      } else if (user?.role === "ADMIN") {
        visibility = [{ status: "PENDING_REVIEW" }, { status: "OPEN" }, { status: "TEACHER_SELECTED" }, { status: "CLOSED" }, { status: "REJECTED" }];
      }
    } else {
      if (user?.role === "ADMIN") {
        // الإدارة يمكنها رؤية جميع الطلبات
        visibility = [{ status: "PENDING_REVIEW" }, { status: "OPEN" }, { status: "TEACHER_SELECTED" }, { status: "CLOSED" }, { status: "REJECTED" }];
      } else if (user?.role === "STUDENT") {
        visibility = [{ studentId: user.id }, { status: "OPEN" }];
      } else if (user?.role === "TEACHER") {
        const myOffers = await prisma.offer.findMany({
          where: { teacher: { userId: user.id } },
          select: { requestId: true },
        });
        visibility = [{ status: "OPEN" }, { id: { in: myOffers.map((o) => o.requestId) } }];
      } else {
        // زائر غير مسجل: إن طلب حالة غير OPEN لا يُعاد توجيهه بصمت لـ OPEN
        if (status && status !== "OPEN") {
          return res.json({ data: [], meta: pageMeta(0, page, limit) });
        }
      }
    }

    const where: Record<string, unknown> = {
      AND: [
        { OR: visibility },
        status ? { status } : {},
      ],
    };

    if (university) {
      const uni = await prisma.university.findFirst({
        where: { OR: [{ slug: university }, { name: { contains: university } }] },
        select: { id: true },
      });
      if (!uni) return res.json({ data: [], meta: pageMeta(0, page, limit) });
      where.AND = [...(where.AND as Array<Record<string, unknown>>), { universityId: uni.id }];
    }
    if (q) {
      where.AND = [...(where.AND as Array<Record<string, unknown>>), { courseTitle: { contains: q } }];
    }

    const withDetails = !!user; // الزائر لا يرى التفاصيل والطالب الكاملة

    const [total, items] = await Promise.all([
      prisma.explainRequest.count({ where: where as never }),
      prisma.explainRequest.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          courseTitle: true,
          details: withDetails,
          type: true,
          urgency: true,
          budget: true,
          deadline: true,
          status: true,
          createdAt: true,
          university: { select: { name: true, slug: true } },
          student: withDetails ? { select: { fullName: true, username: true } } : false,
          _count: { select: { offers: true } },
        },
        ...skipTake(page, limit),
      }),
    ]);

    res.json({ data: items, meta: pageMeta(total, page, limit) });
  }),
);

// ------------------------------------------------------------------
// تفاصيل طلب شرح.
// عقد الاستجابة: { data: { ...الطلب, offersCount, offers?, restricted } } — كائن مسطّح
// (كان سابقًا { data: { request, offers } }، وهو ما كان يُسقط صفحة الطلب في الواجهة).
//
// مستويات الرؤية:
//   - المالك والإدارة: كل شيء + العروض.
//   - مدرّس معتمد (أو قدّم عرضًا): بيانات الطلب كاملة بلا عروض المدرسين الآخرين.
//   - غيرهم (زائر/طالب آخر): الطلب المفتوح فقط وببيانات محدودة (بلا وصف ولا مرفقات ولا ميزانية ولا هوية الطالب).
//   - الطلبات غير المنشورة (مراجعة/مرفوضة/مغلقة): المالك والإدارة ومن قدّم عرضًا فقط.
// ------------------------------------------------------------------
router.get(
  "/:id",
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const request = await prisma.explainRequest.findUnique({
      where: { id: req.params.id },
      include: {
        student: { select: { id: true, fullName: true, username: true } },
        university: { select: { name: true, slug: true } },
        college: { select: { name: true } },
        major: { select: { name: true } },
        _count: { select: { offers: true } },
      },
    });
    if (!request) throw notFound("طلب الشرح غير موجود");

    const user = req.user;
    const isOwner = !!user && user.id === request.student.id;
    const isAdmin = user?.role === "ADMIN";
    const isApprovedTeacher = user?.role === "TEACHER" && user.teacherProfile?.status === "APPROVED";

    // هل قدّم هذا المدرّس عرضًا على الطلب؟ (يمنحه متابعة الطلب بعد إغلاقه)
    const myOffer =
      user?.role === "TEACHER"
        ? await prisma.offer.findFirst({
            where: { requestId: request.id, teacher: { userId: user.id } },
            select: { id: true },
          })
        : null;

    const offersCount = request._count.offers;
    const canReadFull = isOwner || isAdmin || isApprovedTeacher || !!myOffer;

    // غير المنشور لا يُكشف لأحد غير المالك/الإدارة/صاحب العرض — برسالة 404 عامة (بلا تسريب وجود)
    if ((request.status === "PENDING_REVIEW" || request.status === "REJECTED") && !isOwner && !isAdmin && !myOffer) {
      throw notFound("طلب الشرح غير موجود");
    }

    // طلب غير مفتوح: المالك والإدارة ومن قدّم عرضًا فقط
    if (request.status !== "OPEN" && !isOwner && !isAdmin && !myOffer) {
      await audit({
        req,
        userId: user?.id ?? null,
        actorRole: user?.role ?? null,
        action: "EXPLAIN_REQUEST_VIEW_DENIED",
        category: "SECURITY",
        result: "FAILURE",
        reason: "طلب غير متاح للمستخدم الحالي",
        targetType: "ExplainRequest",
        targetId: request.id,
      });
      throw forbidden("هذا الطلب لم يعد متاحًا للعرض — يمكن لصاحب الطلب والإدارة والمدرّس صاحب العرض فقط فتحه");
    }

    // البيانات المحدودة للزائر/الطالب الآخر على طلب مفتوح
    if (!canReadFull) {
      return res.json({
        data: {
          id: request.id,
          courseTitle: request.courseTitle,
          type: request.type,
          urgency: request.urgency,
          status: request.status,
          createdAt: request.createdAt,
          university: request.university,
          college: request.college,
          major: request.major,
          offersCount,
          restricted: true,
        },
      });
    }

    // العروض: لصاحب الطلب والإدارة فقط (أسعار المدرسين الآخرين ليست عامة)
    let offers: unknown = undefined;
    if (isOwner || isAdmin) {
      offers = await prisma.offer.findMany({
        where: { requestId: request.id },
        include: {
          teacher: { include: { user: { select: { fullName: true, username: true } } } },
        },
        orderBy: { price: "asc" },
      });
    }

    const { _count: _c, ...flat } = request;
    res.json({
      data: {
        ...flat,
        offersCount,
        offers,
        restricted: false,
        myOfferId: myOffer?.id ?? null,
      },
    });
  }),
);

// تقديم عرض (مدرس مفعّل فقط، الطلب مفتوح)
router.post(
  "/:id/offers",
  requireApprovedTeacher(),
  parseBody(createOfferSchema),
  asyncHandler(async (req, res) => {
    const request = await prisma.explainRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw notFound("طلب الشرح غير موجود");
    if (request.status !== "OPEN") throw badRequest("لا يمكن تقديم عرض إلا على طلب منشور مفتوح");

    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("ملف المدرس غير موجود");

    const existing = await prisma.offer.findUnique({
      where: { requestId_teacherId: { requestId: request.id, teacherId: profile.id } },
    });
    if (existing) throw badRequest("لديك عرض مسبق على هذا الطلب؛ عدّله لموقع فقط");

    const offer = await prisma.offer.create({
      data: {
        requestId: request.id,
        teacherId: profile.id,
        price: req.body.price,
        message: req.body.message,
        timelineDays: req.body.timelineDays,
        status: "PENDING",
      },
    });

    await notifyUsers({
      userIds: [request.studentId],
      title: "عرض جديد على طلب شرحك",
      body: `${req.user!.fullName} قدّم عرضًا على طلبك "${request.courseTitle}" بسعر ${req.body.price} ريال.`,
      link: `/requests/${request.id}`,
      type: "OFFER_NEW",
      email: {
        subject: "عرض جديد على طلب شرحك في أكاديمية سراج",
        text: `${req.user!.fullName} قدّم عرضًا على طلبك "${request.courseTitle}". سجّل الدخول لعرض التفاصيل.`,
      },
    });

    res.status(201).json({ data: offer, message: "تم تقديم العرض، وبانتظار موافقة الطالب." });
  }),
);

// عروض الطلب (المالك/الإدارة)
router.get(
  "/:id/offers",
  requireAuth("STUDENT", "ADMIN"),
  asyncHandler(async (req, res) => {
    const request = await prisma.explainRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw notFound("طلب الشرح غير موجود");
    if (req.user!.role !== "ADMIN" && request.studentId !== req.user!.id) {
      throw forbidden("عرض العروض متاح لصاحب الطلب والإدارة فقط");
    }
    const offers = await prisma.offer.findMany({
      where: { requestId: request.id },
      include: { teacher: { include: { user: { select: { fullName: true, username: true } } } } },
      orderBy: { price: "asc" },
    });
    res.json({ data: offers, meta: { total: offers.length } });
  }),
);

// نشر الطلب (إدارة: PENDING_REVIEW -> OPEN)
router.post(
  "/:id/publish",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const request = await prisma.explainRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw notFound("طلب الشرح غير موجود");
    if (request.status !== "PENDING_REVIEW") throw badRequest("الطلب ليس في مرحلة المراجعة");

    const updated = await prisma.explainRequest.update({ where: { id: request.id }, data: { status: "OPEN" } });
    await notifyUsers({
      userIds: [request.studentId],
      title: "تم نشر طلبك",
      body: `نُشر طلب الشرح "${request.courseTitle}"، وسيتقدّم المدرس المفعّلون بعروضهم.`,
      link: `/requests/${request.id}`,
      type: "REQUEST_PUBLISHED",
    });
    res.json({ data: updated });
  }),
);

// رفض الطلب (إدارة)
router.post(
  "/:id/reject",
  requireAuth("ADMIN"),
  parseBody(rejectReasonSchema),
  asyncHandler(async (req, res) => {
    const request = await prisma.explainRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw notFound("طلب الشرح غير موجود");
    if (request.status === "REJECTED") throw badRequest("الطلب مرفوض مسبقًا");

    const updated = await prisma.explainRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED" },
    });
    await notifyUsers({
      userIds: [request.studentId],
      title: "لم يُنشر طلب الشرح",
      body: req.body.reason ? `سبب الإدارة: ${req.body.reason}` : "لم يجتزل طلبك مراجعة الإدارة، راجع قواعد الطلب.",
      type: "REQUEST_REJECTED",
    });
    res.json({ data: updated });
  }),
);

// إغلاق الطلب (المالك أو الإدارة) — يُغلق قبل أو بعد اختيار مدرس
router.post(
  "/:id/close",
  requireAuth("STUDENT", "ADMIN"),
  asyncHandler(async (req, res) => {
    const request = await prisma.explainRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw notFound("طلب الشرح غير موجود");
    const isOwner = request.studentId === req.user!.id;
    const isAdmin = req.user!.role === "ADMIN";
    if (!isOwner && !isAdmin) throw forbidden("إغلاق الطلب متاح لصاحبه والإدارة فقط");
    if (request.status === "CLOSED") throw badRequest("الطلب مغلق مسبقًا");
    if (request.status === "REJECTED") throw badRequest("لا يمكن إغلاق طلب مرفوض");

    const updated = await prisma.explainRequest.update({ where: { id: request.id }, data: { status: "CLOSED" } });
    await notifyAdmins({
      title: "أُغلق طلب شرح",
      body: `أغلق الطالب ${req.user!.fullName} زملاءه الطلب "${request.courseTitle}".`,
      type: "REQUEST_CLOSED",
    });
    res.json({ data: updated });
  }),
);

export default router;
