# تدقيق مشكلة عدم ظهور الدورات — Siraj Academy

**تاريخ التدقيق:** 2026-11-22
**الأعراض:** المدرس ينشئ دورة ولا تظهر للطلاب، وأحيانًا لا تصل للإدارة للمراجعة أصلًا.

---

## 1) مسار إنشاء الدورة من البداية للنهاية (قبل الإصلاح)

| # | الطبقة | الملف | الملاحظة |
|---|--------|-------|-----------|
| 1 | واجهة المدرس | `apps/web/src/pages/dashboard/teacher/TeacherPages.tsx` (`OfferingEditor`) | يجمع المقرر والوصف والسعر والدروس ثم ينشئ الدورة عبر `POST /offerings` ويضيف الدروس عبر `POST /offerings/:id/lessons`. زر "تقديم للمراجعة" يظهر فقط عند `DRAFT` أو `HIDDEN`. |
| 2 | التحقق | `apps/server/src/validation/offerings.ts` | `createOfferingSchema` يشترط `courseId` أو `courseTitle`، والسعر ≥ 0، و`trialVideoUrl/youtubeUrls` أي URL. |
| 3 | الصلاحيات | `apps/server/src/middleware/auth.ts` (`requireApprovedTeacher`) | يمنع مدرسًا غير معتمد. |
| 4 | الخدمة | `apps/server/src/routes/offerings.ts` | تُنشأ الدورة بحالة `DRAFT` دائمًا، ويُنشأ `Course` جديد إن لم يوجد عنوان مطابق. |
| 5 | Prisma | `CourseOffering.status` | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `HIDDEN`, `REJECTED` — لا وجود لـ`NEEDS_REVISION`. |
| 6 | الاعتماد | `apps/server/src/routes/admin.ts` → `PATCH /admin/offerings/:id` | يقبل `PUBLISHED` إذا كانت الحالة `PENDING_REVIEW` أو `HIDDEN` أو `REJECTED`. |
| 7 | العرض العام | `catalog.ts` → `GET /courses/:id` | يرجع الدورات `PUBLISHED` فقط؛ و`GET /offerings/:id` يرمي 404 لأي حالة غير منشورة (إلا للإدارة). |
| 8 | الواجهة العامة | `CourseDetail.tsx` | تعرض العروض الراجعة من الخادم (كلها `PUBLISHED`) وتفلتر `status !== 'DRAFT'` فقط. |
| 9 | الكاش | لا يوجد طبقة كاش على API؛ الواجهة Vite ثابتة | إعادة التحميل تعيد الاستعلام من قاعدة البيانات. |

## 2) الأسباب الجذرية الفعلية (وليست تخمينًا)

### السبب 1 — طابور المراجعة لم يكن مرئيًا للإدارة (فلترة الحالة مرفوضة)
- رابط الإشعار الذي يُنشئه `POST /offerings/:id/submit` هو `/admin/offerings?status=PENDING_REVIEW`.
- مخطط التحقق `adminOfferingListSchema` في `validation/admin.ts` كان يسمح بـ`DRAFT | PENDING_REVIEW | PUBLISHED | HIDDEN | REJECTED` (لا `NEEDS_REVISION`)، لكن واجهة `AdminOfferings` لم تكن تقرأ `status` من الرابط أصلًا وتستدعي `crud.list()` بلا فلاتر.
- النتيجة: الدورة تصل `PENDING_REVIEW` في قاعدة البيانات لكن الإدارة قد ترى قائمة كل الدورات فقط، والفلترة عبر API بحالة غير مسموحة ترجع `400` بدل النتائج.
- **الإصلاح:** إضافة `NEEDS_REVISION` للمخططين، وإضافة `q`/status، وربط شاشة المراجعة بالحالة، وإنشاء مركز مراجعة موحّد `/admin/review` يعرض عدد المعلّق.

### السبب 2 — طريق مسدود بعد الرفض (لا إعادة تقديم)
- `POST /offerings/:id/submit` كان يرفض `REJECTED` برسالة «عدّلها ثم أعد تقديمها»، لكن `PATCH /offerings/:id` لا يستطيع تحويل الحالة إلى `DRAFT` (المخطط لا يقبلها إلا كـ`DRAFT`/`PUBLISHED`/`HIDDEN`)، وزر التقديم في الواجهة لا يظهر لـ`REJECTED`.
- كذلك لم تكن هناك حالة `NEEDS_REVISION`؛ فطلب الإدارة تعديلًا كان يضطر لاستخدام `REJECTED` → نفس الطريق المسدود.
- **الإصلاح:** `submit` يقبل الآن `DRAFT | HIDDEN | REJECTED | NEEDS_REVISION`، وزر التقديم يظهر لهذه الحالات، وإضافة `NEEDS_REVISION` إلى `OfferingStatus` وواجهة القرار.

### السبب 3 — لا فصل بين "اعتماد المحتوى" و"ظهور الفيديو"
- `trialVideoUrl` و`youtubeUrls` و`Lesson.videoUrl` كانت تُعرض مباشرة بمجرد اعتماد الدورة، وأي تعديل على رابط لم يكن يُعيد الدورة للمراجعة.
- **الإصلاح:** `ReviewStatus` لكل درس + `trialVideoStatus` + `approvedYoutubeUrls`. الاعتماد الإداري للنشر يعتمد الوسائط دفعة واحدة، مع مسارات اعتماد جزئي مستقلة في `admin.ts`.

### السبب 4 — تعديل دورة منشورة لم يكن يعيدها للمراجعة
- كان `PATCH` يسمح للمدرس بتغيير الوصف/السعر/الفيديو على دورة منشورة دون عودة للمراجعة.
- **الإصلاح:** أي تغيير حساس على دورة منشورة من غير الأدمن → `PENDING_REVIEW` + وسائط جديدة بحالة مراجعة.

### السبب 5 — ازدواج المقررات عند الكتابة اليدوية
- `POST /offerings` و`PATCH /offerings/:id` عند تمرير `courseTitle` ينشئان `Course` جديدًا إن لم يجد تطابقًا تامًا (case-insensitive) — اختلاف مسافة أو همزة ينشئ مقررًا مكررًا، فتتوزع الدورات على مقررات متشابهة الأسماء ولا تظهر معًا.
- **الإصلاح المقترح/المنفّذ جزئيًا:** توحيد العنوان عبر trim + توثيق الأثر في تقرير البيانات التجريبية، وأداة فحص التكرار `prisma/demo-dedupe.ts` (dry-run افتراضيًا).

## 3) دورة الحياة النهائية

```
DRAFT ──submit──▶ PENDING_REVIEW ──approve──▶ PUBLISHED
  ▲                    │
  │                    ├──request changes──▶ NEEDS_REVISION ──submit──▶ PENDING_REVIEW
  │                    └──reject───────────▶ REJECTED ──edit+submit──▶ PENDING_REVIEW
  └── edit (teacher) ◀── HIDDEN / PUBLISHED (sensitive edit) ───────────┘
ARCHIVED غير مضافة لأن النظام يستخدم HIDDEN بمعنى الإخفاء/الأرشفة المؤقتة.
```

## 4) التحقق المنفَّذ

| الفحص | النتيجة |
|-------|---------|
| `npx tsc --noEmit` (server) | ✅ نجح |
| `npm run build` (web: tsc + vite) | ✅ نجح |
| اختبارات وحدة لخدمة الفحص | ✅ 24/24 |
| توازن مفاتيح i18n | ✅ 3/3 |
| اختبارات API عبر قاعدة بيانات معزولة | ⚠️ لم تُشغَّل هنا — `DATABASE_URL` يشير إلى قاعدة Neon خارجية. الملف `tests/centralized-communication.ts` جاهز ويشترط `ALLOW_LIVE_TESTS=1` وقاعدة اختبار. |
| اختبار Cache/إعادة التحميل | لا توجد طبقة كاش في الـAPI؛ إعادة القراءة تعيد نفس النتيجة (مغطى في سيناريو الاختبار 17). |
