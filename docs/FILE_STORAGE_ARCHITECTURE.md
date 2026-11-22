# معمارية تخزين الملفات — Siraj Academy

## المبدأ

الطالب والمدرس يرفعان الملفات من داخل المنصة كأنها جزء طبيعي منها. النظام يختار المجلد تلقائيًا في Google Drive حسب هوية المستخدم ونوع العملية. **لا أحد غير الأدمن يطّلع على محتوى الملفات.**

## هيكل المجلدات

```
SIRAJ_ACADEMY/                         ← GOOGLE_DRIVE_ROOT_FOLDER_ID
├── STUDENTS/
│   └── {FullName}_{username}_STU{id8}/     ← مجلد ثابت لكل طالب
│       ├── PAYMENTS/                       ← إثباتات الدفع (متعددة)
│       ├── MAIN_FILES/
│       ├── CUSTOM_REQUESTS/
│       ├── PRIVATE_EXPLANATIONS/           ← ملفات طلب الشرح
│       ├── COURSE_ATTACHMENTS/
│       └── OTHER_ATTACHMENTS/
├── TEACHERS/
│   └── {FullName}_{username}_TCH{id8}/
│       ├── COURSE_MATERIALS/
│       ├── LESSON_FILES/
│       ├── VIDEO_REFERENCES/
│       ├── SERVICE_ATTACHMENTS/
│       ├── ASSIGNMENT_MATERIALS/
│       └── OTHER_ATTACHMENTS/
└── ADMIN_DOCUMENTS/
    └── {FullName}_{username}_ADM{id8}/
```

- اسم المجلد يحمل **آخر 8 أحرف من معرّف قاعدة البيانات** لتفادي تعارض الأسماء المتشابهة.
- مجلد المستخدم يُنشأ مرة واحدة. لا يُنشأ مجلد لكل ملف.
- معرّف كل مجلد يُخزَّن في `UserDriveFolder` مع قيد `@@unique([userId, folderType])`.
- الخادم هو من يحدد المجلد؛ لا يُقبل `parentFolderId` من العميل.

## الجداول

### `UserDriveFolder`
`id, userId, userRole, folderType, driveFolderId (unique), parentFolderId, createdAt, updatedAt`

### `StoredFile`
`id, ownerUserId, ownerRole, originalFileName, storedFileName, mimeType, fileSize, checksumSha256, driveFileId (unique), driveFolderId, driveFolderType, category, relatedEntityType, relatedEntityId, uploadStatus, reviewStatus, reviewNote, reviewedById, reviewedAt, idempotencyKey (unique), uploadSessionUrl, failureReason, uploadedAt, createdAt, updatedAt, deletedAt`

- لا يُخزَّن محتوى الملف في PostgreSQL.
- `driveFileId` هو وسيلة الوصول الوحيدة من الخادم؛ لا `webViewLink` مخزَّن ولا مستخدم.
- `uploadSessionUrl` مؤقت ويُمسح بعد النجاح.

### `FileAccessLog`
`id, fileId, actorUserId, actorRole, action (UPLOAD|VIEW|DOWNLOAD|DELETE|REVIEW|RETRY), ip, userAgent, detail, createdAt`

## دورة حياة الرفع

```
PENDING ──► UPLOADING ──► UPLOADED ──► (reviewStatus: PENDING_REVIEW → APPROVED / NEEDS_REVISION / REJECTED)
   │            │
   └────────────┴────────► FAILED ──(retry)──► UPLOADING
UPLOADED/FAILED ──(delete)──► DELETE_PENDING ──► DELETED (يبقى السجل)
```

قواعد:
1. السجل يُنشأ `PENDING` قبل أي اتصال بـ Drive.
2. `UPLOADED` لا يُكتب إلا بعد `getFile` من Drive.
3. الملف لا يُعتبر مكتملًا إذا فشل الرفع فعليًا.
4. الحذف لا يمسّ سجل قاعدة البيانات؛ يبقى للأثر والتدقيق.
5. لا حذف تلقائي عند وجود تعارض — المصالحة تُبلّغ فقط.

## تسمية الملفات

`OriginalFileName_YYYY-MM-DD_HH-mm-ss_UUID.ext`

مثال: `Lecture_Notes_2026-11-22_14-35-20_a82f1c2e-....pdf`

- الاسم الأصلي يُحفظ منفصلًا في `originalFileName`.
- المسارات والأحرف الخطرة تُنظَّف (`sanitizeOriginalFileName`).
- UUID يمنع التصادم والاستبدال الصامت.
- التوقيت UTC لتوحيده.

## أنواع الملفات

مسموح: PDF، DOC، DOCX، PPT، PPTX، XLS، XLSX، JPG، JPEG، PNG، WEBP، ZIP، RAR، TXT.

ممنوع: EXE، BAT، CMD، SH، JS، HTML، SVG، PHP، JAR، DLL، وأي تنفيذي/سكربت.

الحد الافتراضي: **100MB لكل ملف** (قابل للتعديل من إعدادات الإدارة `max_file_size_mb`، بسقف أمان 500MB)، وحتى **10 ملفات** لكل عملية.

## واجهة المستخدم

`apps/web/src/components/MultiFileUploader.tsx` — مكوّن موحّد:
- سحب وإفلات + اختيار متعدد.
- اسم/امتداد/حجم/نسبة تقدم/حالة لكل ملف.
- إعادة محاولة الفاشل بمفتاح Idempotency نفسه.
- منع تكرار نفس الملف بالخطأ.
- إزالة قبل الإرسال.
- عربي RTL / إنجليزي LTR عبر نظام الترجمة.

يُستخدم في:
- `/requests/new` — `PRIVATE_EXPLANATIONS`.
- بطاقة الدفع — `PAYMENTS` مرتبطة بالطلب.
- `/teacher/files` — تصنيفات المدرس.

## الدفعات

1. الطالب يرفع إثباتات متعددة (`PAYMENTS` + `relatedEntityType=ORDER`).
2. يملأ المبلغ المعلن والتاريخ والملاحظة (حالة محلية).
3. `POST /orders/:id/payment-submission` يتحقق من الملكية والحالة والملفات ثم:
   - يُنشئ `Payment` بحالة `UNDER_REVIEW`.
   - يربط الملفات بـ `PAYMENT`.
   - يحوّل الطلب إلى `AWAITING_REVIEW`.
   - يسجّل `PAYMENT_PROOF_SUBMITTED` في سجل التدقيق.
4. لا يُعدّ الدفع ناجحًا إلا باعتماد الإدارة (`POST /payments/:id/review`).
5. لا يُستبدل إثبات قديم؛ كل تقديم سجل جديد (إصدار جديد)، والإثباتات السابقة تبقى في Drive مع سجلاتها.
   - لتصحيح دفعة مرفوضة أو ناقصة: يعيد الطالب التقديم بملفات جديدة، ولا يعدّل السجل القديم.
   - لا يمكن تعديل دفعة `UNDER_REVIEW` أو `APPROVED` من جهة الطالب.

## الاستكمال وإعادة المحاولة

- الرفع على أجزاء 8MB بجلسة Resumable.
- `uploadSessionUrl` يُخزَّن لكل ملف، ويُستخدم للاستكمال بعد انقطاع أو إعادة تشغيل.
- إن انتهت الجلسة، تُنشأ جلسة جديدة تلقائيًا.
- `Idempotency-Key` يمنع السجلات المكررة عند إعادة إرسال نفس الطلب.

## المصالحة

`POST /admin/storage/reconcile` يفحص:
- ملفات في Drive بلا سجل.
- سجلات `UPLOADED` بلا ملف في Drive.
- عمليات رفع معلقة.
- عمليات حذف معلقة.
- سجلات مكتملة بلا `driveFileId`.

**لا يحذف شيئًا**؛ النتيجة تقرير للمراجعة الإدارية.
