# تكامل Google Drive — Siraj Academy

## نظرة عامة

كل ملفات الطلاب والمدرسين تُخزَّن في Google Drive عبر خدمة خادم مركزية واحدة. المتصفح لا يتصل بـ Google ولا يرى أي توكن أو معرّف مجلد؛ يرفع الملف إلى `/api/v1/files` فقط، والخادم يتولى Drive.

## المصادقة

- **OAuth 2.0 Refresh Token** لحساب Google المخصص للتخزين (وليس Service Account).
  - Service Account لا يملك مساحة My Drive الشخصية، ولا يستطيع الكتابة في مساحة Google AI Pro الشخصية إلا بمشاركة مجلد صريحة، ولذلك لا يُستخدم افتراضيًا.
- الصلاحية المطلوبة: `https://www.googleapis.com/auth/drive.file`
  - وصول إلى الملفات/المجلدات التي أنشأها التطبيق فقط.
- Refresh Token مشفّر بـ AES-256-GCM في `GOOGLE_DRIVE_REFRESH_TOKEN` بصيغة `enc:v1:iv:tag:ciphertext`.
- مفتاح التشفير `FILE_TOKEN_ENCRYPTION_KEY` (64 حرف Hex) لا يُحفظ في Git.
- Access Token يُجدَّد تلقائيًا ويُحفظ في الذاكرة فقط (لا يُسجَّل ولا يُعاد للمتصفح).
- عند `invalid_grant` تُعاد رسالة واضحة: «انتهت صلاحية Refresh Token — أعد ربط الحساب».

### المتغيرات

| المتغير | إلزامي | الوصف |
|---|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | نعم | OAuth Client ID (Web) |
| `GOOGLE_DRIVE_CLIENT_SECRET` | نعم | OAuth Client Secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | نعم | Refresh Token (مشفّر) |
| `FILE_TOKEN_ENCRYPTION_KEY` | نعم عند التشفير | 64 Hex |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | مُستحسن | مجلد `SIRAJ_ACADEMY` |
| `GOOGLE_DRIVE_SHARED_DRIVE_ID` | لا | إن كان التخزين Shared Drive |
| `GOOGLE_DRIVE_UPLOAD_CHUNK_MB` | لا | حجم الجزء (افتراضي 8) |
| `MAX_FILE_SIZE_MB` | لا | 100 افتراضيًا |
| `MAX_FILE_SIZE_HARD_CAP_MB` | لا | 500 سقف أمان |
| `UPLOAD_STAGING_DIR` | لا | مجلد الانتظار المؤقت |

## الخدمة

`apps/server/src/lib/googleDriveStorage.ts` — `GoogleDriveStorageService`:

| الوظيفة | السلوك |
|---|---|
| `ensureFolder(name, parent)` | بحث ثم إنشاء، مع إعادة بحث عند التسابق |
| `createResumableSession` | جلسة `uploadType=resumable` |
| `uploadFromPath` | رفع على أجزاء 8MB مع استكمال من الجلسة |
| `querySessionOffset` | استعلام `Content-Range: bytes */total` لاستئناف الرفع |
| `getFile` | تأكيد وجود الملف بعد الرفع |
| `download` | Stream داخلي للأدمن فقط |
| `deleteFile` | حذف نهائي وفق سياسة الاحتفاظ |
| `moveFile` | نقل بين المجلدات |
| `quota` | `about.storageQuota` |
| `healthCheck` | فحص الحساب والمساحة والوصول للجذر بلا أسرار |

### الموثوقية

- إعادة محاولة أسّية عند `429` و`5xx` وانقطاع الشبكة (حتى 5 محاولات).
- تجديد تلقائي للتوكن عند `401`.
- **لا يُعلن الملف مكتملًا** إلا بعد `getFile` من Drive ثم تحديث قاعدة البيانات.
- عند فشل قاعدة البيانات بعد نجاح Drive: حذف تعويضي لملف Drive.
- عند فشل Drive: يبقى السجل `FAILED` ونسخة مصدرية في `UPLOAD_STAGING_DIR` لإعادة المحاولة.

## المسارات

### المستخدم (`/api/v1/files`)

| المسار | الوصف |
|---|---|
| `POST /` | رفع متعدد (`files` حتى 10) مع `category` و`relatedEntityType/Id` و`Idempotency-Key` |
| `GET /mine` | بيانات وصفية لملفات صاحب الطلب فقط |
| `DELETE /:id` | إلغاء ملف قبل الإرسال/قبل الاعتماد |

الاستجابة للمستخدم **لا تحتوي** `driveFileId` ولا `driveFolderId` ولا أي URL لـ Drive.

### الإدارة (`/api/v1/admin/storage`) — ADMIN فقط

| المسار | الوصف |
|---|---|
| `GET /health` | حالة الإعداد والاتصال والحصة |
| `GET /overview` | إحصاءات بالدور/التصنيف/الحالة |
| `GET /users` | الطلاب والمدرسون وحالة مجلداتهم |
| `GET /users/:id/folders` | شجرة مجلدات المستخدم |
| `GET /files` | بحث/تصفية (اسم، مستخدم، دور، تصنيف، حالة، تاريخ، طلب) |
| `GET /files/:id` | التفاصيل + سجل الوصول |
| `GET /files/:id/download` | Stream محمي (لا رابط عام) |
| `POST /files/:id/review` | APPROVED / REJECTED / NEEDS_REVISION |
| `POST /files/:id/retry` | إعادة رفع فاشل إن وُجدت النسخة المصدرية |
| `DELETE /files/:id` | حذف موثق بسبب إلزامي |
| `POST /reconcile` | مقارنة Drive بقاعدة البيانات بلا حذف |

## حدود Google Drive

- الحصة اليومية/المعدلات: تُعالج بـ 429 + backoff.
- الحد الأدنى لجزء الرفع 256KB، والأجزاء المستخدمة 8MB.
- Drive يقبل `appProperties` لتثبيت `sirajFileId` و`sirajUserId` و`sirajCategory` — تُستخدم للمصالحة.
- عند تغيّر الحصة أو امتلائها يفشل الرفع بـ `FAILED` مع سبب واضح، لا برسالة نجاح كاذبة.

## التشغيل والفحص

```bash
cd apps/server
npx tsx scripts/google-drive-setup.ts check     # اتصال + حساب + حصة + جذر
npx tsx scripts/google-drive-setup.ts folders   # إنشاء STUDENTS/TEACHERS/ADMIN_DOCUMENTS
```

> **حالة التحقق:** لم يُنفَّذ أي اتصال حقيقي بـ Google Drive في هذه البيئة لعدم توفر بيانات اعتماد. لا تدّعِ أن Drive متصل حتى ينجح `check` ثم رفع ملف تجريبي والتحقق من ظهوره في المجلد الصحيح.

## ما لا يفعله التكامل

- لا يشارك أي مجلد مع الجمهور.
- لا يجعل أي ملف Public.
- لا يعرض Drive URL أو Folder ID للمستخدم.
- لا يسمح للطالب أو المدرس بتحديد Parent Folder.
- لا يخزّن محتوى الملفات في PostgreSQL.
