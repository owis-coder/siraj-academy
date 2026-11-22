# إعداد Google OAuth لتخزين Siraj Academy

> هذا الدليل لإعداد **حساب Google المخصص للتخزين** (صاحب مساحة 5TB). لا تُنفّذ الخطوات على حساب شخصي غير مخصص.
> **لا تضع Client Secret أو Refresh Token في Git أو في المحادثة.**

## 0) قبل البدء — نوع الحساب والمصادقة

| الخيار | مناسب؟ | السبب |
|---|---|---|
| **OAuth 2.0 + Refresh Token** | ✅ الموصى به | يعمل مع مساحة My Drive الشخصية/Google AI Pro، والصلاحية محدودة بـ `drive.file` |
| Service Account | ❌ افتراضيًا | لا يملك مساحة تخزين شخصية؛ يحتاج مشاركة مجلد صريحة، وقد تفشل الكتابة في مساحة المستهلك |
| OAuth من المتصفح | ❌ | يكشف الأسرار ويمنح العميل وصولًا لا يجب أن يملكه |

## 1) إنشاء مشروع وتفعيل Drive API

1. افتح [Google Cloud Console](https://console.cloud.google.com/).
2. أنشئ مشروعًا جديدًا باسم `siraj-academy-storage`.
3. من **APIs & Services → Library** ابحث عن **Google Drive API** ثم **Enable**.

## 2) شاشة الموافقة (OAuth consent screen)

1. **APIs & Services → OAuth consent screen**.
2. User type:
   - **Internal** إن كان الحساب Google Workspace.
   - **External** للحساب الشخصي.
3. App name: `Siraj Academy Storage`، وأضف بريد الدعم.
4. **Scopes**: أضف `https://www.googleapis.com/auth/drive.file` فقط.
   - هذا النطاق يمنح التطبيق الوصول إلى الملفات التي أنشأها هو فقط، وليس كل Drive.
5. **Test users**: أضف بريد حساب التخزين.
6. بعد نجاح التجربة، انشر التطبيق إلى **Production**:
   - في وضع **Testing** تنتهي صلاحية Refresh Token بعد **7 أيام**.
   - `drive.file` ليس نطاقًا مقيّدًا (restricted) لكنه قد يخضع لمراجعة حسب نوع التطبيق.

## 3) إنشاء OAuth Client

1. **Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Authorized redirect URIs: أضف URI واحدًا تستخدمه لاستخراج التوكن، مثل:
   - `http://localhost:8080/oauth2callback`
   - أو `https://developers.google.com/oauthplayground` عند استخدام OAuth Playground.
4. احتفظ بـ **Client ID** و**Client Secret** — لا تنسخهما إلى أي ملف مُتتبَّع.

## 4) الحصول على Refresh Token

### الطريقة الأسهل — OAuth 2.0 Playground

1. افتح [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. أيقونة الترس ⚙ → فعّل **Use your own OAuth credentials** وأدخل Client ID/Secret.
3. في الخطوة 1 أدخل النطاق: `https://www.googleapis.com/auth/drive.file` ثم **Authorize APIs**.
4. سجّل الدخول بحساب التخزين ووافق.
5. في الخطوة 2 اضغط **Exchange authorization code for tokens**.
6. انسخ **Refresh token** فقط (لا تشاركه، ولا تلصقه في محادثة).

> إن لم يظهر Refresh Token، أعد الخطوات بعد إزالة صلاحية التطبيق من [أذونات الحساب](https://myaccount.google.com/permissions) لضمان `access_type=offline` و`prompt=consent`.

## 5) مجلد الجذر

1. في Google Drive لحساب التخزين أنشئ مجلدًا باسم **SIRAJ_ACADEMY**.
2. افتحه وانسخ المعرّف من الرابط:
   `https://drive.google.com/drive/folders/<ROOT_FOLDER_ID>`
3. لا تشارك المجلد مع أي شخص أو رابط عام.

## 6) تشفير التوكن وإعداد البيئة

على جهاز الخادم:

```bash
# 1) مفتاح تشفير 32 بايت
openssl rand -hex 32

# 2) ضع في apps/server/.env
FILE_TOKEN_ENCRYPTION_KEY="<64-hex>"
GOOGLE_DRIVE_CLIENT_ID="<client-id>"
GOOGLE_DRIVE_CLIENT_SECRET="<client-secret>"
GOOGLE_DRIVE_ROOT_FOLDER_ID="<root-folder-id>"

# 3) شفّر Refresh Token
cd apps/server
npx tsx scripts/google-drive-setup.ts encrypt "<refresh-token>"

# 4) انسخ الناتج إلى .env
GOOGLE_DRIVE_REFRESH_TOKEN="enc:v1:..."
```

تأكد أن `.env` غير مُتتبَّع في Git (موجود في `.gitignore`).

## 7) الفحص والتحقق

```bash
cd apps/server
npx tsx scripts/google-drive-setup.ts check
npx tsx scripts/google-drive-setup.ts folders
```

- `check` يطبع: البريد، اسم الحساب، معرّف الجذر واسمه، الحصة. لا يطبع أي توكن.
- `folders` ينشئ/يتأكد من `STUDENTS` و`TEACHERS` و`ADMIN_DOCUMENTS`.
- `ok: false` مع `GOOGLE_DRIVE_ROOT_FOLDER_ID غير مضبوط` يعني أن الحساب متصل لكن الجذر ناقص.

## 8) اختبار رفع حقيقي (إلزامي قبل الإعلان عن النجاح)

1. شغّل الخادم والواجهة.
2. سجّل دخول كطالب وارفع ملفًا من `/requests/new`.
3. تحقق من:
   - ظهور الملف في `SIRAJ_ACADEMY/STUDENTS/{مجلد الطالب}/PRIVATE_EXPLANATIONS`.
   - أن الملف **غير مشارك** (Share → Restricted).
   - أن الطالب لا يرى أي رابط Drive.
   - أن الأدمن يرى الملف في `/admin/storage` ويستطيع تنزيله.
4. إن فشل أي خطوة: لا تعتبر التكامل مكتملًا.

## 9) التدوير والإلغاء

- إذا تسرّب Refresh Token: ألغِ الوصول من [أذونات الحساب](https://myaccount.google.com/permissions)، أنشئ توكنًا جديدًا، شفّره، وحدّث `GOOGLE_DRIVE_REFRESH_TOKEN`.
- إذا تسرّب Client Secret: أعد إنشاء السر من Cloud Console.
- لا يمكن إبطال توكن مشفّر من داخل المستودع؛ التدوير يتم من حساب Google.

## 10) بدائل غير مدعومة

- Service Account على مساحة شخصية: غير مدعوم افتراضيًا.
- تخزين `client_secret` في الواجهة: ممنوع.
- مشاركة المجلد الجذري مع `anyone`: ممنوع.
- استخدام Drive كقاعدة بيانات: ممنوع (البيانات الوصفية في PostgreSQL).
