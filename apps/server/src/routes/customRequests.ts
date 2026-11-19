import { Router } from "express";
import { prisma } from "../lib/prisma";
import { notifyAdmins } from "../lib/notify";
import { sendAdminNotificationEmail } from "../lib/adminNotify";
import { buildCustomRequestNotification } from "../lib/emailTemplates";
import { CUSTOM_REQUEST_TYPE_ARABIC, generateNextCustomRequestNo } from "../lib/customRequestHelpers";
import { badRequest, notFound, forbidden } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { parseBody, parseQuery } from "../middleware/validate";
import { asyncHandler } from "../middleware/errorHandler";
import { createCustomRequestSchema, listCustomRequestsQuerySchema } from "../validation/customRequests";
import { pageMeta, skipTake } from "../validation/common";
import { audit } from "../lib/audit";

const router = Router();

// مسارات الطلبات المخصصة تتطلب تسجيل الدخول
router.use(requireAuth());

// ---------- تقديم طلب خدمة مخصصة / شرح غير متوفر ----------
router.post(
  "/",
  parseBody(createCustomRequestSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const userId = req.user!.id;

    // استخراج بيانات المستخدم الموثوقة من قاعدة البيانات على الخادم
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        university: { select: { name: true } },
        major: { select: { name: true } },
      },
    });
    if (!user) throw notFound("المستخدم غير موجود");

    const requestNo = await generateNextCustomRequestNo();
    const typeArabic = CUSTOM_REQUEST_TYPE_ARABIC[data.requestType] || data.requestType;

    // حفظ الطلب في قاعدة البيانات أولاً
    const customRequest = await prisma.customServiceRequest.create({
      data: {
        requestNo,
        userId: user.id,
        requestType: data.requestType,
        title: data.title,
        description: data.description,
        universityName: data.universityName || user.university?.name || null,
        majorName: data.majorName || user.major?.name || null,
        academicLevel: data.academicLevel || user.level || null,
        deadline: data.deadline || null,
        budget: data.budget ?? null,
        attachments: data.attachments && data.attachments.length > 0 ? data.attachments : undefined,
        status: "NEW",
        emailSent: false,
      },
    });

    await audit({
      req,
      userId: user.id,
      actorRole: user.role,
      action: "CUSTOM_REQUEST_CREATE",
      category: "REQUEST",
      targetType: "CustomServiceRequest",
      targetId: customRequest.id,
      newValues: { requestNo: customRequest.requestNo, requestType: customRequest.requestType, status: customRequest.status },
    });

    // إشعار داخلي لإدارة المنصة
    await notifyAdmins({
      title: "طلب خدمة مخصصة جديد",
      body: `${user.fullName} قدّم طلب: ${data.title} (${typeArabic})`,
      link: `/admin/custom-requests?id=${customRequest.id}`,
      type: "CUSTOM_REQUEST_NEW",
    });

    // تجهيز روابط المرفقات الآمنة (إذا وجدت) لتضمينها في البريد
    const attachmentUrls =
      data.attachments && Array.isArray(data.attachments)
        ? data.attachments.map((att: any) => ({
            name: att.name || "مرفق",
            url: att.url.startsWith("http") ? att.url : `${process.env.CLIENT_URL || "http://localhost:5173"}${att.url}`,
          }))
        : undefined;

    // إرسال إشعار البريد الإلكتروني إلى بريد الإدارة
    try {
      const notif = buildCustomRequestNotification({
        requestNo: customRequest.requestNo,
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
        title: customRequest.title,
        description: customRequest.description,
        universityName: customRequest.universityName,
        majorName: customRequest.majorName,
        academicLevel: customRequest.academicLevel,
        deadline: customRequest.deadline,
        budget: customRequest.budget,
        createdAt: customRequest.createdAt,
        attachmentUrls,
      });

      const mailResult = await sendAdminNotificationEmail({
        subject: notif.subject,
        text: notif.text,
        html: notif.html,
        type: "CUSTOM_REQUEST",
        metadata: {
          requestId: customRequest.id,
          requestNo: customRequest.requestNo,
          userId: user.id,
        },
        idempotencyKey: `custom-request-${customRequest.id}`,
      });

      if (mailResult.delivered) {
        await prisma.customServiceRequest.update({
          where: { id: customRequest.id },
          data: { emailSent: true, emailSentAt: new Date(), emailError: null },
        });
      } else {
        await prisma.customServiceRequest.update({
          where: { id: customRequest.id },
          data: {
            emailSent: false,
            emailError: mailResult.error || (mailResult.simulated ? "وضع اختبار محلي (Stub)" : "تعذر إرسال البريد"),
          },
        });
      }
    } catch (e: any) {
      console.error("[CUSTOM_REQUEST] فشل إرسال بريد الإشعار:", e?.message || e);
      await prisma.customServiceRequest.update({
        where: { id: customRequest.id },
        data: { emailSent: false, emailError: e?.message || "خطأ غير متوقع" },
      });
    }

    res.status(201).json({
      data: customRequest,
      message: "تم إرسال طلبك بنجاح وسيتواصل معك فريق المنصة بعد مراجعته.",
    });
  }),
);

// ---------- قائمة طلبات المستخدم الحالي ----------
router.get(
  "/mine",
  parseQuery(listCustomRequestsQuerySchema),
  asyncHandler(async (req, res) => {
    const { status, requestType, q, page, limit } = req.query as any;
    const where: any = { userId: req.user!.id };

    if (status) where.status = status;
    if (requestType) where.requestType = requestType;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { requestNo: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.customServiceRequest.count({ where }),
      prisma.customServiceRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...skipTake(page, limit),
      }),
    ]);

    res.json({
      data: items,
      meta: pageMeta(total, page, limit),
    });
  }),
);

// ---------- تفاصيل طلب مخصص محدد ----------
router.get(
  "/:id",
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

    if (!item) throw notFound("الطلب غير موجود");

    // المالك والإدارة فقط يستطيعان الاطلاع
    const isOwner = req.user!.id === item.userId;
    const isAdmin = req.user!.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      throw forbidden("لا يمكنك عرض تفاصيل هذا الطلب");
    }

    res.json({ data: item });
  }),
);

export default router;
