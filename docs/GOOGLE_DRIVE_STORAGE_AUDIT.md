# تدقيق نظام تخزين الملفات الحالي — Siraj Academy

> تاريخ التدقيق: 2026-11-22
> النطاق: `apps/server` (Express + Prisma) و`apps/web` (React + Vite)
> الغرض: توثيق الوضع الفعلي قبل نقل التخزين إلى Google Drive. لم يُعدَّل أي سلوك إنتاجي في هذه المرحلة.

## 1. نظام التخزين الحالي

| العنصر | القيمة |
|---|---|
| آلية الرفع | `multer` بوضع `diskStorage` |
| مجلد التخزين | `UPLOAD_DIR` أو `apps/server/uploads` افتراضيًا (`middleware/upload.ts`) |
| اسم الملف المخزَّن | `${userId}-${Date.now()}-${randomHex}${ext}` — الامتداد مشتق من MIME المعروف فقط |
| حدود الرفع | 25MB للملف، ملف واحد لكل طلب |
| الأنواع المسموحة | صور (JPEG/PNG/WebP/GIF)، PDF، ZIP |
| التحقق | بصمة بايتات أولى (magic bytes) بعد الحفظ + منع الامتدادات الخطرة |
| تقديم الملفات | `GET /uploads/:filename` عبر `routes/files.ts` بعد تفويض |
| تخزين البيانات الوصفية | أعمدة نصية/JSON داخل PostgreSQL — لا جدول ملفات موحّد |

### مشكلة جوهرية
التخزين على قرص الخادم غير دائم في بيئات Serverless (Vercel)، ولا يوجد نسخ احتياطي مركزي، ولا سعة 100MB، ولا رفع متعدد أو استكمالي. أي إعادة نشر قد تفقد الملفات.

## 2. جميع نقاط رفع الملفات

| المسار | الملف | من يرفع | الحقل | النوع/الحد |
|---|---|---|---|---|
| `POST /api/v1/uploads` | `routes/uploads.ts` | أي مستخدم مسجل | `file` | صورة/PDF/ZIP · 25MB |
| `POST /api/v1/orders/:id/receipt` | `routes/orders.ts` | الطالب صاحب الطلب | `receipt` | صورة فقط · 25MB |
| `POST /api/v1/users/me/avatar` | `routes/users.ts` | المستخدم نفسه | صورة | 3MB |
| `POST /api/v1/admin/...` (شعارات/أغلفة) | `routes/admin.ts` | الأدمن | رابط نصي `logoUrl`/`coverUrl` | ليس رفعًا فعليًا |
| محادثات (`ChatThread` + Socket.IO) | `routes/chat.ts` | مشارك | `attachmentUrl` بعد رفع سابق | إعادة استخدام `/uploads` |
| طلب خدمة مخصصة | `pages/public/CustomRequestNew.tsx` → `api.uploads.create` | الطالب | متعدد عبر رفع متسلسل | صورة/PDF/ZIP |
| مستندات التحقق للمدرس | `TeacherPages.tsx` + `PATCH /teacher/verification-docs` | المدرس | `docsUrl` | رابط داخلي `/uploads/...` |
| الدروس والفيديوهات | `POST /offerings/:id/lessons` | المدرس | `videoUrl` نصي (YouTube/خارجي) | لا رفع ملفات |

## 3. أنواع الملفات والمرفقات في قاعدة البيانات

- `ExplainRequest.attachments` (Json) + `ExplainRequest.linkUrl` — رابط خارجي فقط حاليًا.
- `Payment.receiptUrl` — سند حوالة واحد.
- `Message.attachmentUrl` — مرفق محادثة.
- `TeacherProfile.docsUrl` — مستندات تحقق.
- `CustomServiceRequest.attachments` (Json).
- `RefundRequest.attachments` (Json) و`TeacherWithdrawal.attachments`.
- `Ad.imageUrl`، `Course.coverUrl`، `University.logoUrl` — صور محتوى عام.
- `CourseOffering` و`Lesson.videoUrl`/`youtubeUrls` — روابط فيديو لا ملفات.

**لا يوجد** جدول `StoredFile` أو `UserDriveFolder` قبل هذا العمل.

## 4. صفحة `/requests/new` — الوضع الفعلي

المكوّن: `apps/web/src/pages/public/RequestNew.tsx`.

الملاحظات الفعلية:
1. لا يوجد أي `<input type="file">` في الصفحة.
2. الخطوة 3 تعرض حقلًا نصيًا واحدًا `linkUrl` (رابط خارجي).
3. عند الإرسال يُرسل `attachments: []` دائمًا، و`linkUrl` النصي فقط.
4. لا توجد معاينة أو تقدم رفع أو تحقق من نوع الملف.
5. المرفقات المرفوعة عبر مسارات أخرى لا تُربط بالطلب بأي معرّف موثوق (تُطابق بمطابقة نصية في `files.ts`).

**الخلاصة:** صفحة الطلب لا تدعم رفع ملفات إطلاقًا، وتعتمد على روابط تخزين خارجية — وهو ما تعالجه المراحل 5 و9.

## 5. جميع مسارات API المرتبطة بالملفات

- `POST /api/v1/uploads`
- `GET /uploads/:filename` (خارج بادئة `/api/v1`)
- `POST /api/v1/orders/:id/receipt`
- `POST /api/v1/users/me/avatar`
- `PATCH /api/v1/teacher/verification-docs`
- `POST /api/v1/chat/rooms/:id/messages` (attachmentUrl)
- Socket.IO `chat:message` (attachmentUrl)
- `POST /api/v1/requests` (attachments اختيارية)
- `POST /api/v1/custom-requests` (attachments)
- `POST /api/v1/refunds` / `withdrawals` (attachments)

## 6. المشكلات المكتشفة (قبل التعديل)

| # | المشكلة | الخطورة |
|---|---|---|
| 1 | الملفات على قرص محلي غير دائم — تختفي مع إعادة النشر | عالية |
| 2 | المدرس المستفيد كان يستطيع فتح سند حوالة الطالب (`files.ts`) | عالية — خلاف قاعدة «الأدمن فقط» |
| 3 | مرفقات طلب الشرح كانت متاحة لأي مستخدم مسجل بمجرد نشر الطلب | عالية — تسريب ملفات طالب لمدرسين |
| 4 | حد 25MB وملف واحد لكل طلب | متوسطة |
| 5 | لا رفع استكمالي ولا إعادة محاولة ولا تتبع تقدم | متوسطة |
| 6 | لا بيانات وصفية موحّدة (مالك/تصنيف/حالة/معرّف Drive) | متوسطة |
| 7 | `/requests/new` يعتمد روابط خارجية بدل رفع مباشر | متوسطة |
| 8 | لا سجل وصول/تنزيل للأدمن | متوسطة |
| 9 | لا مصالحة بين التخزين وقاعدة البيانات | متوسطة |
| 10 | `attachments` تُطابق نصيًا (`LIKE`) لتحديد الصلاحية | متوسطة |

تم إصلاح 2 و3 ضمن هذا العمل (انظر `FILE_ACCESS_SECURITY.md`).

## 7. خطة الانتقال الآمن إلى Google Drive

1. **إبقاء النظام القديم يعمل** دون حذف أي ملف أو سجل (تم).
2. إضافة `StoredFile` و`UserDriveFolder` و`FileAccessLog` **بشكل إضافي** + migration create-only (تم، لم تُطبَّق).
3. بناء `GoogleDriveStorageService` بمصادقة OAuth 2.0 من الخادم فقط (تم).
4. تفعيل الرفع الجديد عبر `MultiFileUploader` في صفحات الطالب والمدرس والدفع (تم).
5. جعل الوصول والتنزيل عبر Backend للأدمن فقط، بلا روابط Drive (تم).
6. تحويل الصفحات تدريجيًا من `/uploads` القديم إلى `/files` الجديد.
7. تشغيل الاختبارات على قاعدة اختبار معزولة وحساب Google تجريبي.
8. أرشفة الملفات القديمة (نسخ إلى Drive) دون حذفها، ثم إيقاف الكتابة إلى القرص المحلي.
9. بعد التحقق: تطبيق Migration على الإنتاج بموافقة صريحة ونسخة احتياطية.

## 8. ما لم يُنفَّذ في هذه المرحلة

- لم تُطبَّق أي Migration على قاعدة بيانات (بما فيها Neon الحالية).
- لم يُنشأ أي مجلد أو ملف فعلي في Google Drive (لا بيانات اعتماد).
- لم تُنقل الملفات القديمة تلقائيًا.
- لم يُغيَّر أي مسار إنتاجي أو نشر.
