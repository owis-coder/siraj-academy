// قوالب البريد الإلكتروني الرسمية لمنصة أكاديمية سراج (HTML + Text، RTL، متوافقة مع عملاء البريد)

export interface UserRegistrationEmailData {
  role: "STUDENT" | "TEACHER" | "ADMIN" | string;
  fullName: string;
  username: string;
  email: string;
  whatsapp?: string | null;
  universityName?: string | null;
  majorName?: string | null;
  level?: string | null;
  createdAt: Date | string;
  status: string;
  teacherApprovalStatus?: string | null;
}

export interface CustomRequestEmailData {
  requestNo: string;
  applicant: {
    fullName: string;
    username: string;
    email: string;
    whatsapp?: string | null;
    universityName?: string | null;
    majorName?: string | null;
    level?: string | null;
  };
  requestType: string;
  title: string;
  description: string;
  universityName?: string | null;
  majorName?: string | null;
  academicLevel?: string | null;
  deadline?: string | null;
  budget?: number | null;
  createdAt: Date | string;
  attachmentUrls?: Array<{ name: string; url: string }>;
}

export interface StatusUpdateEmailData {
  recipientName: string;
  requestNo: string;
  title: string;
  newStatusArabic: string;
  adminNotes?: string | null;
  updatedAt: Date | string;
}

function formatDate(d: Date | string): string {
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleString("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: true,
    });
  } catch {
    return String(d);
  }
}

export function buildRegistrationNotification(data: UserRegistrationEmailData) {
  const roleArabic = data.role === "STUDENT" ? "طالب" : data.role === "TEACHER" ? "مدرس" : data.role === "ADMIN" ? "مدير" : data.role;
  const statusArabic =
    data.status === "ACTIVE"
      ? "نشط"
      : data.status === "PENDING"
      ? "معلق"
      : data.status === "SUSPENDED"
      ? "موقوف"
      : data.status;

  const teacherStatusArabic = data.teacherApprovalStatus
    ? data.teacherApprovalStatus === "APPROVED"
      ? "معتمد"
      : data.teacherApprovalStatus === "PENDING"
      ? "قيد المراجعة"
      : data.teacherApprovalStatus === "REJECTED"
      ? "مرفوض"
      : data.teacherApprovalStatus
    : "-";

  const formattedDate = formatDate(data.createdAt);

  const subject = "تسجيل مستخدم جديد في المنصة الأكاديمية";

  const text = [
    "تسجيل مستخدم جديد في المنصة الأكاديمية",
    "======================================",
    "",
    `نوع الحساب: ${roleArabic}`,
    `الاسم الكامل: ${data.fullName}`,
    `اسم المستخدم (Username): ${data.username}`,
    `البريد الإلكتروني: ${data.email}`,
    `رقم الهاتف أو WhatsApp: ${data.whatsapp || "-"}`,
    `الجامعة: ${data.universityName || "-"}`,
    `التخصص: ${data.majorName || "-"}`,
    `المستوى الدراسي: ${data.role === "STUDENT" ? data.level || "-" : "-"}`,
    `تاريخ إنشاء الحساب: ${formattedDate}`,
    `حالة الحساب: ${statusArabic}`,
    ...(data.role === "TEACHER" ? [`حالة اعتماد المدرس: ${teacherStatusArabic}`] : []),
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#0d1117;font-family:Tahoma,Arial,sans-serif;color:#e6edf3;direction:rtl;text-align:right;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background-color:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;background:linear-gradient(135deg, #1f242c 0%, #161b22 100%);border-bottom:2px solid #e3a93b;">
        <h1 style="margin:0;font-size:20px;color:#e3a93b;">أكاديمية سراج التعليمية</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#8b949e;">إشعار إداري: تسجيل مستخدم جديد</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h2 style="margin:0 0 16px;font-size:17px;color:#f0f6fc;">تم تسجيل حساب جديد بنجاح في المنصة:</h2>
        
        <table role="presentation" width="100%" cellspacing="0" cellpadding="8" style="border-collapse:collapse;margin-bottom:20px;">
          <tr style="border-bottom:1px solid #21262d;">
            <td style="width:160px;font-weight:bold;color:#d29922;">نوع الحساب:</td>
            <td style="color:#f0f6fc;"><span style="display:inline-block;padding:3px 10px;background:#21262d;border-radius:6px;border:1px solid #30363d;">${roleArabic}</span></td>
          </tr>
          <tr style="border-bottom:1px solid #21262d;">
            <td style="font-weight:bold;color:#8b949e;">الاسم الكامل:</td>
            <td style="color:#f0f6fc;font-weight:bold;">${escapeHtml(data.fullName)}</td>
          </tr>
          <tr style="border-bottom:1px solid #21262d;">
            <td style="font-weight:bold;color:#8b949e;">اسم المستخدم:</td>
            <td style="color:#58a6ff;direction:ltr;text-align:right;">@${escapeHtml(data.username)}</td>
          </tr>
          <tr style="border-bottom:1px solid #21262d;">
            <td style="font-weight:bold;color:#8b949e;">البريد الإلكتروني:</td>
            <td style="color:#f0f6fc;direction:ltr;text-align:right;">${escapeHtml(data.email)}</td>
          </tr>
          <tr style="border-bottom:1px solid #21262d;">
            <td style="font-weight:bold;color:#8b949e;">رقم الهاتف / واتساب:</td>
            <td style="color:#f0f6fc;direction:ltr;text-align:right;">${escapeHtml(data.whatsapp || "-")}</td>
          </tr>
          <tr style="border-bottom:1px solid #21262d;">
            <td style="font-weight:bold;color:#8b949e;">الجامعة:</td>
            <td style="color:#f0f6fc;">${escapeHtml(data.universityName || "-")}</td>
          </tr>
          <tr style="border-bottom:1px solid #21262d;">
            <td style="font-weight:bold;color:#8b949e;">التخصص:</td>
            <td style="color:#f0f6fc;">${escapeHtml(data.majorName || "-")}</td>
          </tr>
          ${
            data.role === "STUDENT"
              ? `<tr style="border-bottom:1px solid #21262d;">
                   <td style="font-weight:bold;color:#8b949e;">المستوى الدراسي:</td>
                   <td style="color:#f0f6fc;">${escapeHtml(data.level || "-")}</td>
                 </tr>`
              : ""
          }
          <tr style="border-bottom:1px solid #21262d;">
            <td style="font-weight:bold;color:#8b949e;">تاريخ إنشاء الحساب:</td>
            <td style="color:#f0f6fc;">${formattedDate}</td>
          </tr>
          <tr style="border-bottom:1px solid #21262d;">
            <td style="font-weight:bold;color:#8b949e;">حالة الحساب:</td>
            <td style="color:#f0f6fc;">${statusArabic}</td>
          </tr>
          ${
            data.role === "TEACHER"
              ? `<tr style="border-bottom:1px solid #21262d;">
                   <td style="font-weight:bold;color:#8b949e;">حالة الاعتماد:</td>
                   <td style="color:#f0f6fc;font-weight:bold;color:#e3a93b;">${teacherStatusArabic}</td>
                 </tr>`
              : ""
          }
        </table>
        
        <p style="margin:20px 0 0;font-size:12px;color:#8b949e;border-top:1px solid #30363d;padding-top:14px;">
          هذا الإشعار أُرسل تلقائيًا من خادم أكاديمية سراج إلى بريد الإدارة المعتمد.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

export function buildCustomRequestNotification(data: CustomRequestEmailData) {
  const applicant = data.applicant;
  const formattedDate = formatDate(data.createdAt);
  const subject = `طلب خدمة جديدة — ${applicant.username} — ${data.requestType}`;

  const text = [
    "طلب جديد من المنصة الأكاديمية",
    "======================================",
    "",
    "بيانات صاحب الطلب:",
    `- الاسم الكامل: ${applicant.fullName}`,
    `- اسم المستخدم: ${applicant.username}`,
    `- البريد الإلكتروني: ${applicant.email}`,
    `- رقم الهاتف: ${applicant.whatsapp || "-"}`,
    `- الجامعة: ${applicant.universityName || "-"}`,
    `- التخصص: ${applicant.majorName || "-"}`,
    `- المستوى الدراسي: ${applicant.level || "-"}`,
    "",
    "تفاصيل الطلب:",
    `- نوع الطلب: ${data.requestType}`,
    `- اسم المقرر أو الخدمة: ${data.title}`,
    `- الوصف التفصيلي: ${data.description}`,
    `- الجامعة والتخصص المرتبط بالطلب: ${[data.universityName, data.majorName, data.academicLevel].filter(Boolean).join(" / ") || "مطابق لبيانات الحساب"}`,
    `- الموعد المطلوب: ${data.deadline || "غير محدد"}`,
    `- الميزانية المقترحة: ${data.budget ? `${data.budget} ريال` : "غير محددة"}`,
    `- تاريخ إرسال الطلب: ${formattedDate}`,
    `- رقم الطلب داخل النظام: ${data.requestNo}`,
    ...(data.attachmentUrls && data.attachmentUrls.length > 0
      ? [
          "",
          "المرفقات (روابط داخلية تتطلب تسجيل دخول الإدارة):",
          ...data.attachmentUrls.map((a) => `- ${a.name}: ${a.url}`),
        ]
      : []),
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#0d1117;font-family:Tahoma,Arial,sans-serif;color:#e6edf3;direction:rtl;text-align:right;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;margin:0 auto;background-color:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;background:linear-gradient(135deg, #1f242c 0%, #161b22 100%);border-bottom:2px solid #e3a93b;">
        <h1 style="margin:0;font-size:20px;color:#e3a93b;">طلب جديد من المنصة الأكاديمية</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#8b949e;">رقم الطلب: <b style="color:#58a6ff;">${escapeHtml(data.requestNo)}</b> | تاريخ الإرسال: ${formattedDate}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#e3a93b;border-bottom:1px solid #30363d;padding-bottom:8px;">بيانات صاحب الطلب:</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="6" style="border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="width:140px;color:#8b949e;font-weight:bold;">الاسم الكامل:</td><td style="color:#f0f6fc;font-weight:bold;">${escapeHtml(applicant.fullName)}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">اسم المستخدم:</td><td style="color:#58a6ff;direction:ltr;text-align:right;">@${escapeHtml(applicant.username)}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">البريد الإلكتروني:</td><td style="color:#f0f6fc;direction:ltr;text-align:right;">${escapeHtml(applicant.email)}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">رقم الهاتف:</td><td style="color:#f0f6fc;direction:ltr;text-align:right;">${escapeHtml(applicant.whatsapp || "-")}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">الجامعة:</td><td style="color:#f0f6fc;">${escapeHtml(applicant.universityName || "-")}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">التخصص:</td><td style="color:#f0f6fc;">${escapeHtml(applicant.majorName || "-")}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">المستوى الدراسي:</td><td style="color:#f0f6fc;">${escapeHtml(applicant.level || "-")}</td></tr>
        </table>

        <h3 style="margin:24px 0 12px;font-size:15px;color:#e3a93b;border-bottom:1px solid #30363d;padding-bottom:8px;">تفاصيل الطلب:</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="6" style="border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="width:140px;color:#8b949e;font-weight:bold;">نوع الطلب:</td><td style="color:#f0f6fc;"><span style="display:inline-block;padding:2px 8px;background:#21262d;border-radius:4px;border:1px solid #30363d;color:#e3a93b;">${escapeHtml(data.requestType)}</span></td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">اسم المقرر أو الخدمة:</td><td style="color:#f0f6fc;font-weight:bold;">${escapeHtml(data.title)}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;vertical-align:top;">الوصف التفصيلي:</td><td style="color:#f0f6fc;line-height:1.7;white-space:pre-wrap;background:#0d1117;padding:10px;border-radius:6px;border:1px solid #30363d;">${escapeHtml(data.description)}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">الموعد المطلوب:</td><td style="color:#f0f6fc;">${escapeHtml(data.deadline || "غير محدد")}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">الميزانية المقترحة:</td><td style="color:#f0f6fc;">${data.budget ? `${data.budget} ريال` : "غير محددة"}</td></tr>
          <tr><td style="color:#8b949e;font-weight:bold;">رقم الطلب داخل النظام:</td><td style="color:#58a6ff;font-family:monospace;">${escapeHtml(data.requestNo)}</td></tr>
        </table>

        ${
          data.attachmentUrls && data.attachmentUrls.length > 0
            ? `
          <h3 style="margin:20px 0 10px;font-size:14px;color:#8b949e;">المرفقات (روابط داخلية تتطلب تسجيل الدخول):</h3>
          <ul style="margin:0 0 20px;padding-right:20px;color:#58a6ff;">
            ${data.attachmentUrls
              .map(
                (a) =>
                  `<li><a href="${escapeHtml(a.url)}" target="_blank" style="color:#58a6ff;text-decoration:underline;">${escapeHtml(a.name)}</a></li>`,
              )
              .join("")}
          </ul>
        `
            : ""
        }

        <p style="margin:20px 0 0;font-size:12px;color:#8b949e;border-top:1px solid #30363d;padding-top:14px;">
          يمكن إدارة الطلب والتواصل مع المستخدم وتحديث الحالة من خلال لوحة إدارة سراج.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

export function buildStatusUpdateNotification(data: StatusUpdateEmailData) {
  const formattedDate = formatDate(data.updatedAt);
  const subject = `تحديث بخصوص طلبك رقم ${data.requestNo} — أكاديمية سراج`;

  const text = [
    `مرحبًا ${data.recipientName}،`,
    "",
    `تم تحديث حالة طلبك رقم ${data.requestNo} (${data.title}):`,
    `الحالة الجديدة: ${data.newStatusArabic}`,
    ...(data.adminNotes ? [`ملاحظات الإدارة: ${data.adminNotes}`] : []),
    `تاريخ التحديث: ${formattedDate}`,
    "",
    "يمكنك متابعة تفاصيل الطلب عبر لوحة تحكم حسابك في أكاديمية سراج.",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:24px;background-color:#0d1117;font-family:Tahoma,Arial,sans-serif;color:#e6edf3;direction:rtl;text-align:right;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background-color:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:22px 26px;background:linear-gradient(135deg, #1f242c 0%, #161b22 100%);border-bottom:2px solid #e3a93b;">
        <h1 style="margin:0;font-size:19px;color:#e3a93b;">أكاديمية سراج التعليمية</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#8b949e;">تحديث حالة الطلب</p>
      </td>
    </tr>
    <tr>
      <td style="padding:26px;">
        <p style="font-size:15px;color:#f0f6fc;margin:0 0 16px;">مرحبًا <b>${escapeHtml(data.recipientName)}</b>،</p>
        <p style="color:#c9d1d9;line-height:1.7;">نود إبلاغك بأنه تم تحديث حالة طلبك <b>${escapeHtml(data.title)}</b> (رقم: <span style="color:#58a6ff;font-family:monospace;">${escapeHtml(data.requestNo)}</span>):</p>
        
        <div style="margin:18px 0;padding:14px;background:#0d1117;border-right:4px solid #e3a93b;border-radius:6px;">
          <p style="margin:0;color:#8b949e;font-size:13px;">الحالة الحالية:</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#e3a93b;">${escapeHtml(data.newStatusArabic)}</p>
        </div>

        ${
          data.adminNotes
            ? `
          <div style="margin:16px 0;padding:14px;background:#21262d;border-radius:6px;border:1px solid #30363d;">
            <p style="margin:0 0 6px;color:#8b949e;font-size:13px;font-weight:bold;">ملاحظات الإدارة:</p>
            <p style="margin:0;color:#f0f6fc;line-height:1.6;">${escapeHtml(data.adminNotes)}</p>
          </div>
        `
            : ""
        }

        <p style="margin:24px 0 0;color:#8b949e;font-size:13px;">تاريخ التحديث: ${formattedDate}</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
