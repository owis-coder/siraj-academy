# تقرير التدقيق الشامل للأدوار والصلاحيات وفصل تدفقات الطالب والمعلم
## Siraj Academy — Comprehensive Role Separation, Capability Mapping, and Permission Enforcement Audit

- **تاريخ التدقيق:** 21 نوفمبر 2026
- **النظام:** منصة أكاديمية سراج التعليمية (Siraj Academy)
- **النطاق:** الواجهة الأمامية (Vite + React + React Router)، الواجهة الخلفية (Node.js + Express + Prisma)، وقاعدة البيانات (PostgreSQL)

---

## 1. التعريف الفعلي للأدوار في النظام (Actual Current Role Definitions)

تم فحص مخطط قاعدة البيانات في [schema.prisma](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/prisma/schema.prisma#L19-L23) ونظام المصادقة. يحتوي النظام على ثلاثة أدوار أساسية محددة بتعداد `enum Role`:

```prisma
enum Role {
  STUDENT
  TEACHER
  ADMIN
}
```

حالات المدرس المحددة بتعداد `enum TeacherStatus`:
```prisma
enum TeacherStatus {
  PENDING
  APPROVED
  REJECTED
  SUSPENDED
}
```

### توصيف الأدوار المعتمد:
1. **الطالب (STUDENT):**
   - هو المستهلك الأكاديمي للخدمات التعليمية.
   - يطلب شروحات المقررات والموضوعات، يشترك في الدورات المنشورة، يسجل في الجلسات المباشرة، يرفع سندات التحويل البنكي، ويتواصل مع المدرسين والإدارة حول طلباته المعتمدة.
   - لا يمتلك أي صلاحية لتقديم عروض أسعار، أو اعتماد مدفوعات، أو نشر دورات، أو إدارة مستخدمين.
2. **المدرس (TEACHER):**
   - هو مقدم الخدمة الأكاديمية والتعليمية.
   - يمتلك ملفاً مهنياً مرتبطاً (`TeacherProfile`).
   - ينشئ مسودات الدورات التدريبية (`CourseOffering`)، يقدم عروض أسعار على طلبات الشرح المنشورة (`Offer`)، ينشئ جلسات مباشرة (`LiveSession`)، يرفع وثائق التحقق الأكاديمية (`docsUrl`)، ويستعرض أرباحه الصافية بعد خصم عمولة المنصة (`/teacher/earnings`).
   - يتطلب نشر دوراته وتقديم عروضه اعتماد حسابه من الإدارة (`TeacherStatus.APPROVED`).
   - **لا يملك صلاحية شراء خدمات لنفسه أو طلب شروحات كطالب أو اعتماد مدفوعات.**
3. **المدير / المشرف (ADMIN):**
   - هو المسؤول عن حوكمة المنصة وإدارة المحتوى المالي والأكاديمي.
   - يراجع ويعتمد تسجيل المدرسين، يراجع طلبات الشروحات والخدمات المخصصة، يراجع سندات الدفع ويمنح الوصول، يدير الكليات والتخصصات والجامعات والخدمات، ويشرف على سجل التدقيق الشامل وإعدادات المنصة وسياسات الأمان.

---

## 2. حصر القدرات الفعلية للطالب (Student Capability Inventory)

| القدرة (Capability) | مسار الواجهة (Frontend) | مسار الخادم (Backend API) | التخويل الفعلي (Auth & Role) | قيود الملكية (Ownership) | الحالة (Status) | الدليل البرمجي (Evidence) |
|---|---|---|---|---|---|---|
| تسجيل حساب طالب | `/register/form` | `POST /api/v1/auth/register/student` | عام (Public + reCAPTCHA) | - | `VERIFIED_ALLOWED` | [auth.ts:221](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/auth.ts#L221) `role: Role.STUDENT` |
| تسجيل الدخول والخروج | `/login` | `POST /api/v1/auth/login`, `POST /auth/logout` | عام / جلسة مسجلة | - | `VERIFIED_ALLOWED` | يعين كوكي `sid` ويسجل في `AuditLog` |
| استعادة وتغيير كلمة المرور | `/forgot-password`, `/reset-password` | `POST /auth/forgot-password`, `/reset-password` | عام مع رمز آمن SHA-256 | - | `VERIFIED_ALLOWED` | مدعوم بـ reCAPTCHA ومحدد طلبات |
| استعراض وتحديث الملف الشخصي | `/account/profile` | `GET /api/v1/users/me`, `PATCH /users/profile` | `requireAuth()` | المالك فقط عبر `req.user.id` | `VERIFIED_ALLOWED` | محمي بـ Zod `.strict()` يمنع تعديل `role` |
| إنشاء طلب شرح مقرر | `/requests/new` | `POST /api/v1/requests` | `requireAuth("STUDENT")` | يرتبط بـ `studentId = req.user.id` | `VERIFIED_ALLOWED` | يبدأ بحالة `PENDING_REVIEW` |
| إنشاء طلب خدمة مخصصة | `/requests/custom` | `POST /api/v1/custom-requests` | `requireAuth("STUDENT")` | يرتبط بـ `userId = req.user.id` | `VERIFIED_ALLOWED` | [customRequests.ts:18](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/customRequests.ts#L18) تم حصره للطلاب |
| استعراض طلباتي الشخصية | `/dashboard/requests` | `GET /api/v1/requests?mine=true` | `optionalAuth()` | يعزل تلقائياً: `where: { studentId: user.id }` | `VERIFIED_ALLOWED` | [requests.ts:113](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/requests.ts#L113) |
| قبول عرض سعر مقدم من مدرس | `/requests/:id` | `POST /api/v1/offers/:id/accept` | `requireAuth("STUDENT")` | صاحب الطلب فقط `offer.request.studentId === req.user.id` | `VERIFIED_ALLOWED` | ينشئ طلب دفع `Order` ويفتح محادثة |
| التسجيل والاشتراك في دورة | `/courses/:id` | `POST /api/v1/offerings/:id/enroll` | `requireAuth("STUDENT")` | ينشئ `Order` بحالة `AWAITING_PAYMENT` | `VERIFIED_ALLOWED` | [offerings.ts:382](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/offerings.ts#L382) |
| حجز مقعد في جلسة مباشرة | `/teachers/:username` | `POST /api/v1/live-sessions/:id/book` | `requireAuth("STUDENT")` | `sessionId_userId` | `VERIFIED_ALLOWED` | [offerings.ts:506](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/offerings.ts#L506) |
| رفع سند تحويل بنكي | `/dashboard/orders/:id` | `POST /api/v1/orders/:id/receipt` | `requireAuth("STUDENT")` | صاحب الطلب فقط `order.studentId === req.user.id` | `VERIFIED_ALLOWED` | [orders.ts:122](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/orders.ts#L122) لا اعتماد تلقائي |
| استعراض طلبات الدفع الخاصة به | `/dashboard/orders` | `GET /api/v1/orders` | `requireAuth("STUDENT", ...)` | مفلتر على الخادم `where: { studentId: user.id }` | `VERIFIED_ALLOWED` | [orders.ts:46](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/orders.ts#L46) |
| محادثة المدرس والدعم الفني | `/dashboard/chat` | `GET /api/v1/chat/rooms`, `POST /chat/rooms/:id/messages` | `requireAuth()` | مشارك في الغرفة حصراً | `VERIFIED_ALLOWED` | [chat.ts:17](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/chat.ts#L17) |
| استعراض ملفات وسندات طلباته | `/dashboard/orders/:id` | `GET /uploads/:filename` | `optionalAuth()` | المالك أو المدرس المستفيد | `VERIFIED_ALLOWED` | [files.ts:68](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/files.ts#L68) مفوض بالكامل |
| تقديم عروض على طلبات الشرح | - | `POST /api/v1/requests/:id/offers` | `requireApprovedTeacher()` | - | `VERIFIED_DENIED` | يُرفض فوراً بكود 403 Forbidden |
| إنشاء دورات أو إعلانات | - | `POST /api/v1/offerings`, `/ads` | `requireApprovedTeacher()` | - | `VERIFIED_DENIED` | يُرفض فوراً بكود 403 Forbidden |
| اعتماد وتأكيد المدفوعات | - | `POST /api/v1/payments/:id/review` | `requireAuth("ADMIN")` | - | `VERIFIED_DENIED` | يُرفض فوراً بكود 403 Forbidden |
| استرداد المبالغ إلكترونياً | - | - | غير منشأ كواجهة برمجية | - | `NOT_IMPLEMENTED` | سياسة الاسترداد نصية فقط `/refund` |

---

## 3. حصر القدرات الفعلية للمعلم (Teacher Capability Inventory)

| القدرة (Capability) | مسار الواجهة (Frontend) | مسار الخادم (Backend API) | التخويل الفعلي (Auth & Role) | قيود الملكية (Ownership) | الحالة (Status) | الدليل البرمجي (Evidence) |
|---|---|---|---|---|---|---|
| تسجيل حساب مدرس جديد | `/register/form` | `POST /api/v1/auth/register/teacher` | عام (Public + reCAPTCHA) | ينشئ `TeacherProfile` بحالة `PENDING` | `VERIFIED_ALLOWED` | [auth.ts:338](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/auth.ts#L338) |
| استعراض وتحديث الملف المهني | `/teacher/profile` | `GET /api/v1/teacher/profile`, `PATCH /teacher/profile` | `requireAuth("TEACHER")` | ملف المدرس المسجل حصراً | `VERIFIED_ALLOWED` | [teacher.ts:175](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/teacher.ts#L175) |
| رفع وثائق ومستندات التحقق | `/teacher/profile` | `PATCH /api/v1/teacher/verification-docs` | `requireAuth("TEACHER")` | ملف المدرس نفسه `userId` | `VERIFIED_ALLOWED` | [teacher.ts:143](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/teacher.ts#L143) |
| إنشاء مسودة دورة جديدة | `/teacher/offerings` | `POST /api/v1/offerings` | `requireApprovedTeacher()` | يشترط اعتماد المدرس | `VERIFIED_ALLOWED` | [offerings.ts:38](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/offerings.ts#L38) |
| تقديم الدورة للمراجعة | `/teacher/offerings` | `POST /api/v1/offerings/:id/submit` | `requireApprovedTeacher()` | مالك الدورة حصراً `teacher.userId` | `VERIFIED_ALLOWED` | [offerings.ts:138](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/offerings.ts#L138) |
| تعديل دورة يملكها | `/teacher/offerings` | `PATCH /api/v1/offerings/:id` | `requireAuth("TEACHER", ...)` | مالك الدورة `teacher.userId === req.user.id` | `VERIFIED_ALLOWED` | [offerings.ts:168](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/offerings.ts#L168) |
| تعديل دورة لمعلم آخر | - | `PATCH /api/v1/offerings/:id` | `requireAuth("TEACHER", ...)` | التحقق عبر `getOwnedOffering` | `VERIFIED_DENIED` | يُرفض فوراً بكود 403 Forbidden |
| استعراض الطلاب المسجلين بالدورة | `/teacher/offerings` | `GET /api/v1/offerings/:id/attendees` | `requireAuth("TEACHER", ...)` | مالك الدورة حصراً | `VERIFIED_ALLOWED` | [offerings.ts:367](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/offerings.ts#L367) |
| تقديم عرض على طلب شرح مفتوح | `/teacher/requests` | `POST /api/v1/requests/:id/offers` | `requireApprovedTeacher()` | طلب بحالة `OPEN` ومدرس مفعّل | `VERIFIED_ALLOWED` | [requests.ts:303](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/requests.ts#L303) |
| استعراض إيراداته الصافية | `/teacher/earnings` | `GET /api/v1/teacher/earnings` | `requireAuth("TEACHER")` | الطلبات ذات `providerId === profile.id` والمدفوعة فعلياً | `VERIFIED_ALLOWED` | [teacher.ts:21](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/teacher.ts#L21) قراءة فقط |
| تعديل نسبة العمولة أو الأرباح | - | - | لا يوجد مسار تعديل للمعلم | - | `VERIFIED_DENIED` | الإدارة تعدلها فقط في الإعدادات |
| طلب شرح كطالب | `/requests/new` | `POST /api/v1/requests` | `requireAuth("STUDENT")` | - | `VERIFIED_DENIED` | يُرفض بكود 403 في الواجهة والخادم |
| طلب خدمة مخصصة كطالب | `/requests/custom` | `POST /api/v1/custom-requests` | `requireAuth("STUDENT")` | - | `VERIFIED_DENIED` | يُرفض بكود 403 في الواجهة والخادم |
| التسجيل في دورات كطالب | `/courses/:id` | `POST /api/v1/offerings/:id/enroll` | `requireAuth("STUDENT")` | - | `VERIFIED_DENIED` | يُرفض بكود 403 في الواجهة والخادم |
| اعتماد حسابه بنفسه | - | `POST /api/v1/admin/teachers/:id/approve` | `requireAuth("ADMIN")` | - | `VERIFIED_DENIED` | الإدارة فقط |
| سحب الأرباح آلياً (Withdrawal) | - | - | غير منشأ كواجهة برمجية | - | `NOT_IMPLEMENTED` | تتم التسويات المالية يدوياً |

---

## 4. حصر قدرات الإدارة (Admin Capabilities)

| القدرة (Capability) | مسار الواجهة (Frontend) | مسار الخادم (Backend API) | التخويل الفعلي | الصلاحية والتنفيذ |
|---|---|---|---|---|
| إدارة ومراجعة المستخدمين | `/admin/teachers` | `GET /api/v1/admin/users`, `/teachers` | `requireAuth("ADMIN")` | `VERIFIED_ALLOWED` |
| اعتماد / رفض / تعليق المدرسين | `/admin/teachers` | `POST /admin/teachers/:id/approve`, `/reject` | `requireAuth("ADMIN")` | `VERIFIED_ALLOWED` |
| مراجعة ونشر طلبات الشرح | `/admin/requests` | `POST /api/v1/requests/:id/publish`, `/reject` | `requireAuth("ADMIN")` | `VERIFIED_ALLOWED` |
| مراجعة الطلبات المخصصة | `/admin/custom-requests` | `GET /api/v1/admin/custom-requests`, `PATCH` | `requireAuth("ADMIN")` | `VERIFIED_ALLOWED` |
| مراجعة واعتماد سندات التحويل | `/admin/payments` | `POST /api/v1/payments/:id/review` | `requireAuth("ADMIN")` | `VERIFIED_ALLOWED` (منح الوصول آلياً) |
| مراجعة واعتماد إعلانات المدرسين | `/admin/ads` | `POST /api/v1/ads/:id/admin` | `requireAuth("ADMIN")` | `VERIFIED_ALLOWED` |
| استعراض وتصفية سجل التدقيق | `/admin/audit` | `GET /api/v1/admin/audit-logs` | `requireAuth("ADMIN")` | `VERIFIED_ALLOWED` (قراءة فقط بدون تعديل) |
| تعديل إعدادات المنصة والعمولة | `/admin/settings` | `PATCH /api/v1/admin/settings` | `requireAuth("ADMIN")` | `VERIFIED_ALLOWED` |
| بث إشعار لجميع المستخدمين | `/admin/notifications` | `POST /admin/notifications/broadcast` | `requireAuth("ADMIN")` | `VERIFIED_ALLOWED` |

---

## 5. مصفوفة المقارنة المباشرة: طالب مقابل معلم مقابل إدارة (Comparison Matrix)

| القدرة الأكاديمية أو المالية | الطالب (Student) | المعلم (Teacher) | المدير (Admin) | التنفيذ في الكود | السلوك المفروض أمنياً |
|---|---|---|---|---|---|
| إنشاء طلب شرح عادي | `VERIFIED_ALLOWED` | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `requireAuth("STUDENT")` | مقتصر على طالبي الخدمة |
| إنشاء طلب خدمة مخصصة | `VERIFIED_ALLOWED` | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `requireAuth("STUDENT")` | مقتصر على طالبي الخدمة |
| تقديم عروض أسعار على الطلبات | `VERIFIED_DENIED` | `VERIFIED_ALLOWED` | `VERIFIED_DENIED` | `requireApprovedTeacher()` | المعلم المعتمد حصراً |
| قبول عرض السعر وإنشاء الطلب | `VERIFIED_ALLOWED` | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `offer.request.studentId === user.id` | صاحب الطلب حصراً |
| الاشتراك في الدورات التدريبية | `VERIFIED_ALLOWED` | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `requireAuth("STUDENT")` | مقتصر على الطلاب |
| حجز مقعد في جلسة مباشرة | `VERIFIED_ALLOWED` | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `requireAuth("STUDENT")` | مقتصر على الطلاب |
| إنشاء وإدارة الدورات والدروس | `VERIFIED_DENIED` | `VERIFIED_ALLOWED` | `VERIFIED_ALLOWED` | `requireApprovedTeacher()` + ملكية | المعلم المعتمد والإدارة |
| إنشاء الجلسات المباشرة | `VERIFIED_DENIED` | `VERIFIED_ALLOWED` | `VERIFIED_DENIED` | `requireApprovedTeacher()` | المعلم المعتمد حصراً |
| رفع سند تحويل مالي | `VERIFIED_ALLOWED` | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `order.studentId === user.id` | صاحب الطلب المالي حصراً |
| مراجعة واعتماد سندات التحويل | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `VERIFIED_ALLOWED` | `requireAuth("ADMIN")` | الإدارة المالية حصراً |
| استعراض طلبات الدفع | `CONDITIONAL` (طلباته) | `CONDITIONAL` (كمزود) | `VERIFIED_ALLOWED` (الكل) | مفلتر بـ `studentId` أو `providerId` | عزل تام لكل مستخدم |
| استعراض إيرادات التدريس | `VERIFIED_DENIED` | `VERIFIED_ALLOWED` (أرباحه) | `VERIFIED_ALLOWED` | `providerId === profile.id` | قراءة فقط للمعلم |
| تعديل نسبة العمولة | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `VERIFIED_ALLOWED` | `PATCH /admin/settings` | إدارة المنصة حصراً |
| الوصول للوحة الإدارة وسجل التدقيق | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `VERIFIED_ALLOWED` | `requireAuth("ADMIN")` | الإدارة فقط بكود 403 |
| تعديل الدور في قاعدة البيانات | `VERIFIED_DENIED` | `VERIFIED_DENIED` | `CONDITIONAL` (ترقية معلمين) | Zod `.strict()` يمنع حقن الدور | لا يمكن الترقية عبر API |

---

## 6. الثغرات المكتشفة وأسبابها الجذرية وكيف تم حلها (Discovered Role Leakage & Fixes)

### الثغرة الأولى: إمكانية إنشاء طلبات خدمات مخصصة وشروحات من حساب المعلم
- **الموقع:** [customRequests.ts:18](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/src/routes/customRequests.ts#L18) و [CustomRequestNew.tsx:100](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/web/src/pages/public/CustomRequestNew.tsx#L100).
- **السبب الجذري (Root Cause):**
  كان المسار في الخادم يستدعي `router.use(requireAuth())` دون تحديد أدوار، مما أتاح لأي مستخدم موثق (بما في ذلك المعلم والمدير) إرسال `POST /api/v1/custom-requests` لطلب شروحات مقررات أو مشاريع برمجية كأنه طالب! وفي الواجهة الأمامية لم يكن هناك فحص يمنع المعلم من إرسال النموذج، وكان يتم توجيهه بعد الإرسال إلى مسار لوحة الطالب `/dashboard/custom-requests`.
- **الحل المنفذ (Fix):**
  1. على الخادم: تقييد المسارات:
     - `POST /api/v1/custom-requests` أصبحت تتطلب صراحة `requireAuth("STUDENT")`.
     - `GET /api/v1/custom-requests/mine` تتطلب صراحة `requireAuth("STUDENT")`.
     - `GET /api/v1/custom-requests/:id` تتطلب `requireAuth("STUDENT", "ADMIN")`.
  2. في الواجهة الأمامية: تم تحديث `CustomRequestNew.tsx` ليتحقق من الدور؛ فإذا كان المستخدم مسجلاً بدور معلم أو مدير، يتم حجب نموذج الشراء وعرض بطاقة إرشادية توضح أن هذا النموذج مخصص للطلاب، مع زر يوجه المعلم مباشرة إلى لوحة عروض المدرسين `/teacher/requests`.

### الثغرة الثانية: واجهة طلب الشرح الخاص `/requests/new` كانت متاحة للإدخال من المعلم
- **الموقع:** [RequestNew.tsx:98](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/web/src/pages/public/RequestNew.tsx#L98).
- **السبب الجذري (Root Cause):**
  الواجهة كانت تفحص فقط `if (!user)`؛ فإذا كان المستخدم معلماً، تسمح له بالمرور عبر الخطوات الثلاث (بياناتك، تفاصيل الشرح، المرفقات)، وعند الإرسال كان الخادم يرفض الطلب بكود 403، أو تظهر رسائل خطأ مربكة للمستخدم.
- **الحل المنفذ (Fix):**
  تم تحديث `RequestNew.tsx` ليتحقق من `user.role === 'STUDENT'`. في حال دخول معلم، يتم عرض بطاقة توجيهية بدلاً من خطوات النموذج توضح:
  *"طلب الشرح مخصص للطلاب. بصفتك مدرساً، يمكنك استعراض الطلبات المنشورة وتقديم عروضك عبر لوحة المدرس"* مع زر نقل فوري إلى `/teacher/requests`.

### الثغرة الثالثة: أزرار رأس صفحة الطلبات العامة `/requests` كانت تروج لطلب الشرح للمعلم
- **الموقع:** [Requests.tsx:63](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/web/src/pages/public/Requests.tsx#L63).
- **السبب الجذري (Root Cause):**
  كانت الصفحة تعرض زري "طلب شرح خاص" و "طلب خدمة أو شرح غير متوفر" بشكل ثابت لجميع الزوار والمستخدمين بمن فيهم المعلمون، مما يشجع على تداخل الأدوار.
- **الحل المنفذ (Fix):**
  أصبحت الأزرار واعية بالدور (Role-Aware):
  - للمعلم: يظهر زر *"استعراض الطلبات المتاحة لتقديم عروض"* يوجهه إلى `/teacher/requests`.
  - للمدير: يظهر زر *"إدارة طلبات الشروحات"* يوجهه إلى `/admin/requests`.
  - للطالب والزائر: تظهر أزرار طلب الشروحات والخدمات.

### الثغرة الرابعة: حماية مسارات اللوحات على مستوى الموجه الرئيسي `App.tsx`
- **الموقع:** [App.tsx:180-230](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/web/src/App.tsx#L180-L230).
- **السبب الجذري (Root Cause):**
  المسار `/dashboard` كان يعتمد على `<ProtectedRoute>` التي تفحص تسجيل الدخول فقط دون فحص الدور، ومسارا `/teacher` و `/admin` كانا يعتمدان على التغليف داخل `DashboardShell`.
- **الحل المنفذ (Fix):**
  تم استيراد واستخدام `<RoleRoute>` صراحة على كل مجموعة مسارات:
  - `<RoleRoute role="STUDENT"><StudentLayout /></RoleRoute>`
  - `<RoleRoute role="TEACHER"><TeacherLayout /></RoleRoute>`
  - `<RoleRoute role="ADMIN"><AdminLayout /></RoleRoute>`
  مما يمنع أي وميض أو تحميل أولي لواجهة دور آخر قبل إعادة التوجيه.

---

## 7. مصفوفة الوصول إلى مسارات الواجهة (Frontend Route Matrix)

| المسار (Path) | الحماية (Guard) | الأدوار المصرح بها | السلوك عند الدخول غير المصرح |
|---|---|---|---|
| `/` | عام (Public) | الكل | متاح للجميع |
| `/courses`, `/courses/:id` | عام (Public) | الكل | متاح؛ والتسجيل يقتصر على الطالب |
| `/services`, `/services/:slug` | عام (Public) | الكل | متاح؛ والطلب يقتصر على الطالب |
| `/teachers`, `/teachers/:username` | عام (Public) | الكل | متاح للجميع |
| `/requests` | عام (Public) | الكل | تكييف أزرار الإجراءات حسب الدور |
| `/requests/new` | واعي بالدور (Role-Aware) | الطالب فقط | توجيه المعلم إلى `/teacher/requests` |
| `/requests/custom` | واعي بالدور (Role-Aware) | الطالب فقط | توجيه المعلم إلى `/teacher/requests` |
| `/login`, `/register/*` | عام (Public) | الزوار غير المسجلين | إعادة توجيه المسجلين إلى لوحتهم |
| `/account/profile`, `/settings` | `<ProtectedRoute>` | جميع المستخدمين المسجلين | إعادة التوجيه إلى `/login` إن لم يسجل |
| `/dashboard/*` | `<RoleRoute role="STUDENT">` | الطالب (STUDENT) فقط | إعادة التوجيه للوحة المناسبة لدور المستخدم |
| `/teacher/*` | `<RoleRoute role="TEACHER">` | المعلم (TEACHER) فقط | إعادة التوجيه للوحة المناسبة لدور المستخدم |
| `/admin/*` | `<RoleRoute role="ADMIN">` | المدير (ADMIN) فقط | إعادة التوجيه للوحة المناسبة لدور المستخدم |

---

## 8. مصفوفة أذونات واجهات الخادم البرمجية (Backend API Permission Matrix)

| نقطة الوصول (Endpoint) | الطريقة (Method) | المصادقة والأدوار المفروضة | التحقق من الملكية والحالة |
|---|---|---|---|
| `/api/v1/auth/login`, `/register/*` | POST | عام مع حماية reCAPTCHA | منع إنشاء حساب ADMIN ذاتياً |
| `/api/v1/users/me` | GET | `requireAuth()` | استرجاع بيانات `req.user.id` حصراً |
| `/api/v1/users/profile` | PATCH | `requireAuth()` | Zod `.strict()` يمنع تعديل `role` و `status` |
| `/api/v1/requests` | POST | `requireAuth("STUDENT")` | ربط الطلب بـ `studentId = req.user.id` |
| `/api/v1/requests?mine=true` | GET | `optionalAuth()` | عزل تلقائي: الطالب يرى طلباته، المعلم يرى عروضه |
| `/api/v1/requests/:id` | GET | `optionalAuth()` | إخفاء تفاصيل المسودة والعروض عن غير المالك والإدارة |
| `/api/v1/requests/:id/offers` | POST | `requireApprovedTeacher()` | يشترط حالة `APPROVED` وأن يكون الطلب `OPEN` |
| `/api/v1/offers/:id/accept` | POST | `requireAuth("STUDENT")` | صاحب الطلب حصراً `offer.request.studentId === req.user.id` |
| `/api/v1/custom-requests` | POST | `requireAuth("STUDENT")` | مقتصر على الطلاب طالبي الخدمات |
| `/api/v1/custom-requests/mine` | GET | `requireAuth("STUDENT")` | مقتصر على طلبات الطالب المسجل |
| `/api/v1/custom-requests/:id` | GET | `requireAuth("STUDENT", "ADMIN")` | المالك أو الإدارة فقط |
| `/api/v1/offerings` | POST | `requireApprovedTeacher()` | معلم معتمد؛ تبدأ بحالة `DRAFT` |
| `/api/v1/offerings/:id` | PATCH, DELETE | `requireAuth("TEACHER", "ADMIN")` | مالك الدورة حصراً `teacher.userId === req.user.id` |
| `/api/v1/offerings/:id/enroll` | POST | `requireAuth("STUDENT")` | طالب مسجل حصراً |
| `/api/v1/live-sessions` | POST | `requireApprovedTeacher()` | معلم معتمد حصراً |
| `/api/v1/live-sessions/:id/book` | POST | `requireAuth("STUDENT")` | طالب مسجل حصراً |
| `/api/v1/orders` | GET | `requireAuth("STUDENT", "TEACHER", "ADMIN")` | عزل تام: الطالب (طلباته)، المعلم (المزود له) |
| `/api/v1/orders/:id/receipt` | POST | `requireAuth("STUDENT")` | صاحب الطلب حصراً `order.studentId === req.user.id` |
| `/api/v1/payments/:id/review` | POST | `requireAuth("ADMIN")` | الإدارة حصراً (اعتماد/رفض ومنح الوصول) |
| `/api/v1/teacher/earnings` | GET | `requireAuth("TEACHER")` | إيرادات المعلم المستفيد حصراً (قراءة فقط) |
| `/api/v1/admin/*` | ALL | `requireAuth("ADMIN")` | الإدارة حصراً بكود 403 لكافة الأدوار الأخرى |

---

## 9. نتائج الاختبارات الآلية والتحقق (Tests & Verification Results)

تم إنشاء وتشغيل جناح اختبارات تكاملي متخصص:
[role-separation-suite.ts](file:///c:/Users/owis/Desktop/موقع%20سراج/apps/server/tests/role-separation-suite.ts)
والذي ينفذ استدعاءات HTTP حقيقية عبر عميل فيزيائي ضد خادم Express وقاعدة بيانات PostgreSQL المباشرة:

### ملخص نتائج الفحص:
1. **جناح الفصل الصارم للصلاحيات (`role-separation-suite.ts`):**
   - إجمالي الفحوصات: **28 فحصاً**.
   - الفحوصات الناجحة: **28 (100% Passed)**.
   - الفحوصات الفاشلة: **0**.
   - شملت التحقق من:
     - منع المعلم من إنشاء طلبات الشرح (403).
     - منع المعلم من إنشاء طلبات الخدمات المخصصة (403).
     - منع المعلم من الاشتراك في الدورات أو حجز الجلسات كطالب (403).
     - منع المعلم من تعديل دورات معلمين آخرين (403).
     - منع المعلم والطالب من مراجعة المدفوعات أو الوصول لمسارات الإدارة وسجل التدقيق (403).
     - منع محاولات التلاعب بالدور وحقن `role: "ADMIN"` عبر الـ API (400).
     - حماية عزل بيانات الطلبات المخصصة ومنع الطلاب الآخرين من قراءتها (403).
2. **جناح اختبارات الأمان المتقدم (`security-suite.ts`):**
   - **49/49 Passed** (تشفير TOTP، حماية إعادة استخدام التوكنات، عزل الشبكات، تصفية الملفات الخبيثة).
3. **جناح تكامل مسارات Express (`integration-fixes.ts`):**
   - **16/16 Passed** (فرض الكابتشا، حماية معدل الطلبات، استهلاك تذاكر MFA الذري).
4. **اختبارات القواعد والحسابات في الواجهة (`vitest`):**
   - **16/16 Passed**.
5. **فحص الأنواع وتجميع الخادم والواجهة (`typecheck` & `build`):**
   - `apps/server`: خالي من أي أخطاء برمجية (`tsc --noEmit`).
   - `apps/web`: تجميع الإنتاج نجح بنجاح تام (`vite build` في 10.07 ثانية).

---

## 10. الميزات غير المنشأة (Features Not Implemented)
لتجنب أي افتراضات غير دقيقة، نؤكد أن الميزات التالية **غير منشأة برمجياً في النظام الحالي**:
1. **نظام استرداد المبالغ الآلي (Automated In-App Refunds):**
   - لا توجد مسارات API لطلب استرداد مالي أو اعتماده في قاعدة البيانات.
   - المعالجة الحالية تتم عبر صفحة الشروط العامة والتواصل مع الدعم الفني.
2. **نظام السحب المالي الآلي للمعلمين (Automated Payouts/Withdrawals):**
   - المعلم يستعرض أرباحه المستحقة المحسوبة من الطلبات المدفوعة، ولكن لا يوجد مسار لطلب تحويل بنكي آلي من المنصة لحسابه.

---

## 11. توصيات وقواعد عمل تحتاج مراجعة مالك النظام (Owner Recommendations)
1. **في حال رغبة معلم في أخذ دورة تدريبية لنفسه:**
   - التصميم الحالي يفصل الدور بشكل صارم ويمنع حساب المعلم من الشراء لمنع تضارب المصالح والحسابات المالية.
   - التوصية: إذا رغب المعلم في الدراسة كطالب، ينشئ حساب طالب منفصل ببريد مختلف، أو يتم مستقبلاً إنشاء ميزة "تبديل الصفة" (Account Switcher) وفق متطلبات عمل موثقة.
2. **وثائق اعتماد المدرسين:**
   - تبقى وثائق المدرسين محمية في الخادم ولا يمكن الوصول إليها إلا من المعلم نفسه والإدارة. يُنصح بإضافة إشعار بريدي للمدرس فور اعتماد حسابه رسمياً.

---

**الخلاصة:**
تم القضاء على جميع مظاهر التداخل واللبس بين أدوار الطلاب والمعلمين، وتم فرض قيود التخويل الصارمة على الواجهة الأمامية والواجهة الخلفية وقاعدة البيانات، مع الحفاظ الكامل على سلامة البيانات والوظائف الحالية وعمل جميع الفحوصات والاختبارات بنجاح 100%.
