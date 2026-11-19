# عقد API المشترك — أكاديمية سراج

Base URL: `/api/v1` — Auth: JWT في HttpOnly cookie (`sid`). الرسائل بالعربية الرمزية (`message`) و `error.code` إن وجد.
الردود: `{ data, meta? }` للنجاح، `{ message, details? }` للخطأ (4xx/5xx).

## الأدوار (RBAC)
`STUDENT | TEACHER | ADMIN` — middleware `requireAuth(...roles)`.
- الطالب: مشترك وطلب ودفع.
- المدرس: لا يظهر محتواه حتى `TeacherProfile.status = APPROVED` (middleware يمنع teacher غير المفعّل من أي مسار نشر).
- الإدارة: كل شيء + الموافقات + الإعدادات + الإحصائيات.

## نماذج Prisma (ملخص)
User(fullName, username, email, passwordHash, whatsapp, role, emailVerified, universityId?, majorId?, status)
TeacherProfile(userId, degree, bio, specialties, universitiesText?, status: PENDING|APPROVED|REJECTED|SUSPENDED, docsUrl?)
University(name, slug, city?, logoUrl?, isVisible, order)
College(universityId, name, students can skip)
Major(collegeId?, universityId, name) — التخصص; ملاحظة: يمكن ربط التخصص مباشرة بالجامعة أو بالكلية
Course(universityId, collegeId?, majorId?, title, code?, level?, description?, isVisible, coverUrl?)
CourseOffering(دورة) (courseId, teacherId, title?, summary, price, trialVideoUrl?, youtubeUrls Json?, accessType: TRIAL|PAID, status: DRAFT|PUBLISHED|HIDDEN|REJECTED, adminNote?)
Lesson(offeringId, title, videoUrl (youtube), access: TRIAL|PAID, order)
Enrollment(userId, offeringId) — يُفتح بعد اعتماد الدفع
Service(slug, title, category enum: PRIVATE_EXPLAIN|LIVE_EXPLAIN|SUMMARY|TRANSLATION|PPT|PROGRAMMING_PROJECT|RESEARCH_REVIEW|PROOFREADING|ACADEMIC_FORMAT|HOMEWORK_TRAINING|ACADEMIC_CONSULT|CUSTOM, description, basePrice?, durationDays?, providerId? (teacher), isActive, isFeatured)
ExplainRequest(studentId, universityId, collegeId?, majorId?, courseTitle, details, type: ONLINE|IN_PERSON|BOTH, urgency: NOW|DAY|WEEK|TERM, budget?, deadline?, attachments Json, linkUrl?, status: PENDING_REVIEW|OPEN|TEACHER_SELECTED|CLOSED|REJECTED)
Offer(requestId, teacherId, price, message?, timelineDays?, status: PENDING|ACCEPTED|REJECTED)
Order(orderNo, studentId, targetType: OFFERING|SERVICE|OFFER|CUSTOM, targetId?, amount, title, status: AWAITING_PAYMENT|AWAITING_REVIEW|REJECTED|PAID|CANCELLED, notes?)
Payment(orderId, method: TRANSFER|GATEWAY, receiptUrl?, status: UNDER_REVIEW|APPROVED|REJECTED, reviewerId?, reviewNote?, paidAt)
ChatRoom(type: DIRECT|GROUP|ORDER, ownerId?, title?), ChatParticipant(roomId,userId,lastReadAt,role), Message(roomId, senderId, body?, attachmentUrl?, createdAt)
Ad(teacherId, title, body, imageUrl?, linkUrl?, status: DRAFT|PENDING_REVIEW|APPROVED|REJECTED|HIDDEN|EXPIRED, reviewerNote?)
Notification(userId, title, body?, link?, isRead, type?)
LiveSession(offeringId?, teacherId, title, startsAt, durationMin, price?, capacity?)
LiveBooking(sessionId, userId, status, orderId?)
Setting(key, value) — telegram_link, whatsapp_numbers, payment_instructions, iban, bank_name, commission_rate
Review(offeringId, userId, rating 1..5, comment) — فقط بعد إنهاء الاشتراك
Favorite(userId, targetId, targetType: SERVICE|OFFERING|TEACHER)
Attachment/Uploads: ملفات محلية في `uploads/` وترجع URLs.

ملاحظة نزاهة: لا حالات وهمية — شرطين فقط (عام مقرر، سعر/مدة تنفيذ). المراجعات من طلاش فقط، لا مُدخّات يدوية للإدارة.

## Endpoint list (قيد التنفيذ بواسطة backend-agent)

### Auth
POST /auth/register/student {fullName, username, email, whatsapp, universityId?, majorId?, password}
POST /auth/register/teacher {fullName, username, email, whatsapp, degree, specialties, bio, docsUrl?}
POST /auth/login {identifier(email|username), password}
POST /auth/logout | GET /auth/me | POST /auth/verify-email {token} | POST /auth/resend-verification
GET /auth/upload -> المستخدم منفصل: POST /uploads (multer, images/pdf/zip<=25MB) -> {url}

### أسئلة الدفع/الطلبات العامة (Public)
POST /requests (student، أو مسار مخفي: يمكن مرافقة إنطُه بدؤها قبل إنشاء حساب، لكن أرَسِ السهل: ذًما حساب مطلوب) → status=PENDING_REVIEW
GET /requests?university=&status=OPEN|TEACHER_SELECTED|CLOSED&q=&page=  (ظاهر: OPEN فقط للعامة؛ TEACHER يرى فقط OPEN المسموحة له عبر جامعاته/تخصصه; STUDENT يرى طلباته)
GET /requests/:id → { data: { ...الطلب, offersCount, offers?, restricted } } — كائن مسطّح
     (مالك/إدارة: كامل + offers | مدرّس معتمد أو صاحب عرض: كامل بلا offers | غيرهما: OPEN ببيانات محدودة restricted=true
      بلا details/attachments/budget/student | غير المنشور: 404 لغير المالك | غير المفتوح: 403 لغير المالك وصاحب العرض)
POST /requests/:id/offers (teacher، APPROVED فقط، price=5..10000)
GET /requests/:id/offers (owner/admin)
POST /offers/:id/accept (owner) → طلب رسمي Order(status=AWAITING_PAYMENT) + notification للمدرس + إغلاق العروض الأخرى
POST /requests/:id/publish (admin: OPEN) | POST /requests/:id/reject (admin)
POST /requests/:id/close (owner/admin)

## الحساب والأمان (الجديد)
GET /users/me · PATCH /users/me (الاسم/الجوال/الجامعة/التخصص/المستوى) · PATCH /users/me/username
PATCH /users/me/email {newEmail,currentPassword} → يرسل رابط تحقق 30 دقيقة؛ لا يُعتمد البريد قبل التأكيد
POST /users/me/password {currentPassword,newPassword,confirmPassword} → يُبقي الجلسة الحالية ويُلغي غيرها
POST /users/me/avatar (multipart: avatar، صور فقط ≤3MB، تحقق بصمة المحتوى) · DELETE /users/me/avatar
GET /users/me/sessions · DELETE /users/me/sessions/:id · POST /users/me/sessions/logout-all
POST /auth/forgot-password {email} → استجابة عامة دائمًا + رمز مجزأ 30 دقيقة/مرة واحدة + طلب جديد يُلغي السابق
POST /auth/reset-password {token,password,confirmPassword} · POST /auth/email-change/confirm {token}
GET /admin/audit-logs (ADMIN فقط، قراءة فقط) — لا كلمات مرور ولا رموز في السجل
قواعد: اسم المستخدم ^[a-zA-Z0-9_]{3,30}$ وفريد دون حساسية لحالة الأحرف (قيد lower(username) في قاعدة البيانات)
كلمة المرور: 9+، A-Z، a-z، 0-9، أحرف إنجليزية وأرقام فقط

### الدرجات: تسلسل تصفح (المستوى اختياري)
GET /universities (visible) + count(decendents) + top courses? only counts
GET /universities/:slug  (الكليات لكلها + عدد المقررات + المدرسون المشتغلون بتلك الجامعة عبر Offerings + servicesForUniversity + priceSummary: عروض/أسعار)
GET /colleges?universityId= | GET /majors?universityId=&collegeId= | GET /courses?universityId=&collegeId=&majorId=&level=&q=&page=
GET /courses/:id (lessons visible TRIAL للعامة، PAID للمشترك فقط، مدرس/مالك/إدارة يرون الكل) + Offerings الظاهرة
GET /teachers?q=&university=&page= | GET /teachers/:username
GET /services?category=&q= | GET /services/:slug
POST /service-orders (student) 44→ Order(AWAITING_PAYMENT) بترجمة الخدمة والسعر (basePrice أو تفوض عبر شرط المدرس في "عرض سعر"؟)
   نستخدم: إن مررت providerId → Order بمبلغ الخدمة للـprovider؛ إن CUSTOM → Order + يفتح محدداً بنع description.

### دورات المدرس ( offerings)
POST /offerings (teacher approved; course مش معطل; status=DRAFT)
POST /offerings/:id/submit (admin publication: DRAFT→PUBLISHED) نع تدقيق محتوى نظيف
PATCH /offerings/:id (teacher صاحب; title/summary/price/trial/lessons; إخفاء: status=HIDDEN)
POST /offerings/:id/enroll (student) → Order(AWAITING_PAYMENT, tariff: OFFERing price)
GET /offerings/:id/attendees (teacher صاحب)
POST /live-sessions | GET /live-sessions?offeringId= (طلع للجميع) | POST /live-sessions/:id/book (student)→Order إن مدفوع / Booking فوري إن مجاني
GET /teacher/earnings (sum Payments APPROVED لحبيب Offerings المدرس + offers مقبولة - commission) + دفتر التفاصيل

### الدفع اليدوي
GET /orders (student = طلباته, admin=الكل?, teacher=طلات مقابلة لطلبه)
GET /orders/:id (وصول: owner/admin/target.teacher)
- في الإعداد: يعرض المبلغ + تعليمات + iban + تلغرام (Settings) + orderNo.
POST /orders/:id/receipt (owner, image) → Payment(UNDER_REVIEW) + order.status=AWAITING_REVIEW
POST /payments/:paymentId/review {decision: APPROVED|REJECTED, note?} (admin)
  - APPROVED: تمام الدفع/ grant access (Enrollment / Order=PAID / Offer flow completes / CustomService assigned) + notifications
  - REJECTED: order.status=REJECTED + notification للطالب
⚠️ لا شي AUTO عند إرسال السند.

### محادثات
GET /chat/rooms (per user; يرتبط certains الك مباشرة بطلبه/دورة)
POST /chat/rooms {peerId? | type GROUP title? } (admin/teacher)
GET /chat/rooms/:id/messages?before=&limit=  | POST /chat/rooms/:id/messages {body?, attachmentUrl?}
POST /chat/rooms/:id/read | POST /chat/rooms/:id/report | POST /chat/users/:id/block-socket: 
Socket.IO: events (messaegs): `chat:message`, `notification:new`, `room:join/leave`, `message:read`
auth jwt في handshake. deviceId أسم صف/بلا.

### إعلانات المدرسين
POST /ads (teacher) | POST /ads/:id/submit | PATCH /ads/:id (DRAFT فقط للتعديل; إذا APPROVED و تعديل → PENDING_REVIEW تلقائياً عبر الخادم)
POST /ads/:id/admin {decision: APPROVED|REJECTED|HIDDEN|EXPIRED, note?} (admin)
GET /ads?mine= (teacher) | GET /ads public (APPROVED only; هيد كرب بشرط)

### إدارة
CRUD: /admin/universities | /admin/colleges | /admin/majors | /admin/courses (إنشاء/تعديل/رؤية "isVisible" وإشخاء) 
/admin/services (إنشاء/تعديل/نشيط/مميز) | /admin/offerings (إخفاء/ستاتصاه)
/admin/teachers (list PENDING) /admin/teachers/:id/approve|reject + admin/teachers disable
/admin/requests?status=PENDING_REVIEW ( البطاقات/ البطاقة تتطابق ب🎴s) 
/admin/payments?status=UNDER_REVIEW | /admin/orders | /admin/ads?status= | /admin/chat/reports (إشكالات)
GET /admin/stats {students, teachersPending, requestsNew, requestsCompleted, revenueConfirmed, teachersDues, topUniversities, topCourses, topServices}
GET/PUT /admin/settings {telegram_link, whatsapp_numbers, payment_instructions, iban, bank_name, commission_rate}
POST /admin/notifications/broadcast {role?, title, body, link?}

### إشعارات
GET /notifications | POST /notifications/:id/read | POST /notifications/read-all
Email stub: nodemailer إن وُجد SMTP env وإلا console + صف سجل. بعد الأحداث المهمة (تسجيل، عروض، اختيار مدرس، دفع).

### معلومات/إعدادات عامة مفيد للواجهة
GET /platform/public (name, telegramLink, whatsapp numbers, paymentInstructions؟, faq ثابت؟ ملاحظة: هل اـ404 نرى فقط سكريبت)
