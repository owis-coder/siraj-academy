# خادم أكاديمية سراج التعليمية (Siraj Educational Academy — API)

 خادم الـAPI للسوق التعليمي الجامعي: Node.js + Express + TypeScript + PostgreSQL + Prisma + Socket.IO + Zod + JWT (كوكي HttpOnly) + تحكم أدوار (طالب/مدرس/إدارة).

## التشغيل المحلي (Windows PowerShell)

لا يتوفر Docker في بيئة البناء الحالية، لذلك جرى التحقق من التالي:
- ✅ `npx prisma generate` يعمل.
- ✅ `npm run typecheck` يمر (tsc --noEmit).
- ✅ `npm run dev` يقلع الخادم ويعرض `/healthz` على 4000 حتى بلا قاعدة بيانات (اتصال Prisma كسول)، وطلبات قواعد البيانات ستفشل فقط عند الاستدعاء.
- ⚠️ `npm run seed` يفشل بأمان برسالة عربية واضحة ورمز خروج 1 حين يتعذر الوصول لقاعدة البيانات.

```powershell
# 1) قاعدة البيانات (عند توفر Docker على جذر المشروع)
docker compose up -d

# 2) التبعيات
npm install

# 3) مخطط قاعدة البيانات + عميل Prisma
npx prisma migrate dev --name init
npx prisma generate

# 4) التهيئة (إعدادات + إدارة + جامعات السعودية حقيقية — بلا بيانات وهمية)
npm run seed

# 5) التطوير
npm run dev
```

## متغيرات البيئة (`.env`)
انظر `.env.example`. أهمها: `DATABASE_URL`, `PORT=4000`, `CLIENT_URL`, `APP_BASE_URL`, `JWT_SECRET`, `UPLOAD_DIR`. البريد اختياري — بدون `SMTP_HOST` يعمل وضع المحاكاة: تُطبع الرسالة في الكونسول وتُسجّل `SIMULATED` في `EmailLog` دون ادعاء تسليم.

## البريد الإلكتروني (SMTP حقيقي)

1. ضع بيانات المزود في `apps/server/.env` — أي مزود SMTP يعمل (Gmail App Password، Brevo، Resend، Mailgun، استضافة بريد دومينك): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. أمثلة جاهزة في `.env.example`. لا تُودع `.env` في أي مستودع.
2. `SMTP_SECURE` يُستنتج من المنفذ (465 → تشفير مباشر، 587 → STARTTLS) ويمكن تجاوزه صراحةً.
3. تحقق من الاتصال والاعتماد ثم أرسل رسالة اختبار لصندوقك:
   ```bash
   npm run mail:test -- you@example.com
   ```
   يطبع المضيف/المنفذ/المرسل (دون أي كلمة مرور)، ثم معرّف الرسالة لدى المزود وردّه (`250 …`).
4. اختبار وصول بريد **استعادة كلمة المرور** إلى صندوق وارد فعلي (ينشئ صندوق Ethereal مستضافًا، يمرّر الطلب عبر نفس مسار الـAPI، يقرأ الرسالة من الصندوق، ثم يستخدم الرابط لتعيين كلمة مرور جديدة والدخول بها):
   ```bash
   npm run mail:inbox
   ```
5. اختبار انحدار بلا شبكة (مستقبل SMTP محلي): `npm run test:mail`.

مهلات الاتصال/الترحيب/المقبس مضبوطة (10/10/20 ثانية) مع 3 محاولات إرسال، ويرفض الخادم الرسالة إذا رفض المزود كل المستقبلين. الإرسال يُسجّل في `EmailLog` بحالة `SENT`/`FAILED`/`SIMULATED` مع معرّف الرسالة فقط — دون رموز استعادة أو كلمات مرور. الإعدادات تُقرأ وقت التشغيل، فأعد تشغيل الخادم بعد تعديل `.env`.

## حساب الإدارة الافتراضي (من التهيئة)
| الحقل | القيمة |
|---|---|
| البريد | `admin@siraj.sa` |
| كلمة المرور | `Siraj@2026Admin` |
| اسم المستخدم | `siraj_admin` |

> غيّر هذه كلمة المرور فور أول دخول في الإنتاج. ولا يُنشئ التهيئة أي طلاب/مدرسين/دورات/طلبات — المنصة تعرض بياناتها الحقيقية فقط (قاعدة نزاهة).

## مبادئ نزاهة مفروضة على الخادم
1. **حساب المدرس يبدأ PENDING** — لا يمكن لأي مدرس غير معتمد إنشاء عرض/دورة/إعلان/جلسة (`requireApprovedTeacher`).
2. **دورة حياة الإعلانات**: DRAFT → PENDING_REVIEW → APPROVED/REJECTED. أي تعديل على إعلان معتمد يعيده فورًا `PENDING_REVIEW` من الخادم، والمرفوض مخفى عن العموم.
3. **طلبات الشرح** تبدأ `PENDING_REVIEW` (الإدارة تنشرها → `OPEN`). العروض على الطلبات المفتوحة فقط (سعر 5..10000). قبول عرض يغلق بقية العروض → `TEACHER_SELECTED` → يُنشئ Order (AWAITING_PAYMENT) بسعر العرض + غرفة محادثة ORDER.
4. **الدفع يدوي بالحوالة**: رفع السند لا يعتمد شيئًا أبدًا (الطلب → AWAITING_REVIEW). الاعتماد من `/payments/:id/review` — الاعتماد يمنح الوصول (Enrollment/اكتمال تدفق العرض) وإشعارات للطالب والمدرس، ورفض يعيد الطلب `REJECTED` مع إشعار.
5. **أرقام الطلبات**: `SRJ-2026-000123` (سينة + عدد) وتعليمات الدفع/الآيبان/التلغرام/بنك كلها من الإعدادات.
6. **الوصول للمحتوى**: دروس PAID لمشتركي الدورة/المدرس المالك/الإدارة فقط؛ دروس TRIAL للجميع.
7. **الإحصائيات** مبنية على aggregate/count/groupBy حقيقية فقط — لا أرقام مؤلفة.

## جدول المسارات (`/api/v1`)

### عامة
| المسار | الوصف |
|---|---|
| `GET /platform/info` (`/platform/public` مرادف) | اسم المنصة، تلغرام، واتساب، فئات الخدمات، FAQ من الإعدادات |
| `GET /universities` · `GET /universities/:slug` | التصفح التسلسلي + عدّادات + مدرسون + ملخص الأسعار |
| `GET /colleges?universityId=` · `GET /majors?universityId=&collegeId=` · `GET /courses?…&q=&page=` | تصفح الكليات/التخصصات/المقررات |
| `GET /courses/:id` | تفاصيل المقرر + الدورات الظاهرة + الدروس وفق صلاحيات |
| `GET /teachers?q=&university=` · `GET /teachers/:username` | المدرسون المعتمدون فقط |
| `GET /services?category=&q=` · `GET /services/:slug` | الخدمات النشطة |
| `POST /service-orders` (طالب) | يحوّل الخدمة إلى Order (AWAITING_PAYMENT) |
| `GET /catalog/search?q=` | بحث في الجامعات+المقررات+المدرسين+الخدمات (5 لكل نوع) |
| `GET /ads` | الإعلانات المعتمدة فقط (و`?mine=1` للمدرس) |
| `GET /live-sessions?offeringId=` | الجلسات المباشرة |

### المصادقة `/auth`
`POST /register/student` · `POST /register/teacher` · `POST /login` · `POST /logout` · `GET /me` · `POST /verify-email` · `POST /resend-verification`

### طلبات الشرح والعروض
`POST /requests` (طالب) · `GET /requests?university=&status=&q=&page=` · `GET /requests/:id` · `POST /requests/:id/offers` (مدرس معتمد) · `GET /requests/:id/offers` (مالك/إدارة) · `POST /offers/:id/accept` (مالك الطلب) · `POST /offers/:id/withdraw` · `POST /requests/:id/publish` (إدارة) · `POST /requests/:id/reject` (إدارة) · `POST /requests/:id/close` (مالك/إدارة)

### الدورات (دروس المدرسين)
`POST /offerings` · `GET /offerings/mine` · `POST /offerings/:id/submit` · `PATCH /offerings/:id` · `DELETE /offerings/:id` · `POST /offerings/:id/lessons` · `PATCH /offerings/lessons/:lessonId` · `DELETE /offerings/lessons/:lessonId` · `GET /offerings/:id` · `GET /offerings/:id/attendees` · `POST /offerings/:id/enroll` (طالب→Order) · `POST /offerings/live-sessions` · `GET /offerings/live-sessions` · `POST /offerings/live-sessions/:id/book` · `GET /offerings/live-sessions/mine`

### الطلبات والدفع
`GET /orders` (حسب الدور) · `GET /orders/:id` (+ تعليمات الدفع من الإعدادات) · `POST /orders/:id/receipt` (صورة السند) · `POST /orders/:id/cancel` · `GET /payments?status=` (إدارة) · `POST /payments/:id/review` (إدارة: APPROVED يمنح الوصول / REJECTED يرفض الطلب)

### المحادثات
`GET /chat/rooms` · `POST /chat/rooms` · `GET /chat/rooms/:id/messages?before=&limit=` · `POST /chat/rooms/:id/messages` · `POST /chat/rooms/:id/read` · `POST /chat/rooms/:id/report` · `POST /chat/users/:id/block` · `POST /chat/users/:id/unblock`

### الإعلانات/الإشعارات/المفضلة/الرفع
`POST /ads` · `POST /ads/:id/submit` · `PATCH /ads/:id` · `POST /ads/:id/admin` (إدارة) · `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `GET /favorites` · `POST /favorites/:targetId/toggle` · `POST /uploads` (صور/PDF/ZIP ≤ 25MB)

### المدرس
`GET /teacher/earnings` (مبني على سندات معتمدة فقط − العمولة) · `GET /teacher/dashboard`

### الإدارة `/admin`
- CRUD: `universities` · `colleges` · `majors` · `courses` (+`visibility`) · `services` · `offerings` (إخفاء/نشر/رفض مع `adminNote`)
- المدرسون: `GET /teachers?status=` · `POST /teachers/:id/approve|reject|disable|enable`
- المستخدمون: `GET /users` · `PATCH /users/:id` (تعليق/تفعيل)
- المراجعات: `GET /requests?status=PENDING_REVIEW` · `GET /payments?status=UNDER_REVIEW` · `GET /orders` · `GET /ads?status=` · `GET /chat/reports` + `PATCH /chat/reports/:id`
- `GET /stats` — إحصائيات حقيقية {students, teachersPending, requestsNew, requestsCompleted, revenueConfirmed, teachersDues, topUniversities, topCourses, topServices}
- `GET/PUT /settings` — {telegram_link, whatsapp_numbers, payment_instructions, iban, bank_name, commission_rate, …}
- `POST /notifications/broadcast` {role?, title, body, link?}

### Socket.IO (المصادقة عبر كوكي JWT في الـhandshake)
- أحداث الخادم → العميل: `chat:message` · `chat:read` (message:read) · `notification:new` · `chat:error`
- أحداث العميل → الخادم: `chat:join` · `chat:leave` · `chat:message` · `chat:read`
- غرف: `user:{id}` (إشعارات) و `room:{id}` (محادثات).

## الملاحظات
- **multer 2.x** مستخدم بدل 1.x المعرّض لثغرات.
- البريد عبر `src/lib/mail.ts`: بدون SMTP يعمل وضع المحاكاة ويُسجّل `SIMULATED` بلا ادعاء تسليم؛ روابط الاستعادة تُبنى من `APP_BASE_URL`.
- كل رسائل الأخطاء الشائعة عربية، والشكل الموحد: نجاح `{ data, meta? }` وفشل `{ message, details? }`.
- `prisma.config.ts`: تحذير إزالة `package.json#prisma` غير مؤثر على الإصدار 6 المستخدم.
