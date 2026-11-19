// ============================================================
// اختبارات الحساب والأمان عبر HTTP فعلي ضد خادم يعمل + تحقق من قاعدة البيانات.
// التشغيل: npm run test:account   (يتطلب الخادم على 4000 وقاعدة البيانات)
//
// ملاحظة نزاهة: البريد غير مهيأ (SMTP فارغ) لذا يعمل الخادم في وضع محاكاة
// تُسجَّل فيه الرسائل كـ SIMULATED ولا تُسلَّم فعليًا. لذلك تُختبر صلاحية
// الروابط وانتهاؤها وإعادة استخدامها عبر رموز تُزرع في قاعدة البيانات بتجزئة
// معروفة — وهذا لا يكشف الرموز الحقيقية التي يولّدها الخادم (تخزَّن كتجزئة فقط).
// ============================================================
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { collect, login, req, uploadFile, PNG_BYTES, PDF_BYTES, DEMO_PASSWORD } from "./api-helpers";

const prisma = new PrismaClient();
const { results, check, status } = collect();

const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const PASSWORD = "SirajPass2026"; // 13 خانة، كبير+صغير+رقم، بلا رموز
const NEW_PASSWORD = "SirajNew2026";

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function cookieOf(res: { headers: Headers }): string | undefined {
  const raw = res.headers.get("set-cookie") ?? "";
  const m = /sid=([^;]+)/.exec(raw);
  return m ? `sid=${m[1]}` : undefined;
}

async function main() {
  console.log("====================================================");
  console.log("اختبارات الحساب والأمان وسجل التدقيق");
  console.log("====================================================\n");

  const uname1 = `acc_${stamp}`;
  const email1 = `acc_${stamp}@test.local`;
  const uname2 = `acc2_${stamp}`;
  const email2 = `acc2_${stamp}@test.local`;

  const reg = (body: Record<string, unknown>) => req(null, "POST", "/api/v1/auth/register/student", body);
  const baseBody = (over: Record<string, unknown> = {}) => ({
    fullName: "سارة أحمد",
    username: uname1,
    email: email1,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    ...over,
  });

  /* ---------------- 1) التسجيل والتحقق من القواعد ---------------- */

  const good = await reg(baseBody());
  status("تسجيل طالب ببيانات صحيحة", good, 201);
  let cookie1 = cookieOf(good);
  const user1id: string = good.body?.data?.user?.id;

  status("رفض اسم مستخدم مكرر (حالة أحرف مختلفة)", await reg(baseBody({ username: uname1.toUpperCase(), email: `dup_${stamp}@test.local` })), 409);
  status("رفض اسم مستخدم عربي", await reg(baseBody({ username: "سارة_١٢", email: `ar_${stamp}@test.local` })), 400);
  status("رفض اسم مستخدم صيني", await reg(baseBody({ username: "学生名字", email: `zh_${stamp}@test.local` })), 400);
  status("رفض اسم مستخدم بمسافة", await reg(baseBody({ username: `acc ${stamp}`, email: `sp_${stamp}@test.local` })), 400);
  status("رفض اسم مستخدم برمز", await reg(baseBody({ username: `acc-${stamp}`, email: `sym_${stamp}@test.local` })), 400);
  status("رفض اسم مستخدم أقصر من 3", await reg(baseBody({ username: "ab", email: `short_${stamp}@test.local` })), 400);
  status("رفض كلمة مرور بلا حرف كبير", await reg(baseBody({ username: `nu_${stamp}`, email: `nu_${stamp}@test.local`, password: "sirajpass2026", confirmPassword: "sirajpass2026" })), 400);
  status("رفض كلمة مرور بلا حرف صغير", await reg(baseBody({ username: `nl_${stamp}`, email: `nl_${stamp}@test.local`, password: "SIRAJ2026AA", confirmPassword: "SIRAJ2026AA" })), 400);
  status("رفض كلمة مرور بلا رقم", await reg(baseBody({ username: `nd_${stamp}`, email: `nd_${stamp}@test.local`, password: "SirajPassword", confirmPassword: "SirajPassword" })), 400);
  status("رفض كلمة مرور تحتوي رمزًا", await reg(baseBody({ username: `sy_${stamp}`, email: `sy_${stamp}@test.local`, password: "Siraj@2026A", confirmPassword: "Siraj@2026A" })), 400);
  status("رفض كلمة مرور قصيرة (8)", await reg(baseBody({ username: `sh_${stamp}`, email: `sh_${stamp}@test.local`, password: "Sira2026", confirmPassword: "Sira2026" })), 400);
  status("رفض كلمة مرور عربية", await reg(baseBody({ username: `ar2_${stamp}`, email: `ar2_${stamp}@test.local`, password: "كلمةمرور123", confirmPassword: "كلمةمرور123" })), 400);
  status("رفض تأكيد كلمة مرور غير مطابق", await reg(baseBody({ username: `cm_${stamp}`, email: `cm_${stamp}@test.local`, confirmPassword: "SirajPass2027" })), 400);
  status("رفض اسم يحتوي أرقامًا", await reg(baseBody({ fullName: "سارة 123", username: `fn_${stamp}`, email: `fn_${stamp}@test.local` })), 400);
  status("رفض اسم صيني", await reg(baseBody({ fullName: "学生", username: `fn2_${stamp}`, email: `fn2_${stamp}@test.local` })), 400);
  check("كلمة المرور لا تُعاد في استجابة التسجيل", !JSON.stringify(good.body).includes(PASSWORD));

  // تسجيل مستخدمين صالحين (اسم مختلط) للمقارنات
  const u2 = await reg(baseBody({ fullName: "Sara Ali سارة علي", username: uname2, email: email2 }));
  status("قبول اسم عربي/إنجليزي مختلط وتسجيل مستخدم ثانٍ", u2, 201);
  const user2id: string = u2.body?.data?.user?.id;

  // تسجيلان متزامنان بنفس الاسم: واحد فقط ينجح (القيد الفريد في قاعدة البيانات)
  const raceName = `race_${stamp}`;
  const [r1, r2] = await Promise.all([
    reg(baseBody({ username: raceName, email: `race1_${stamp}@test.local` })),
    reg(baseBody({ username: raceName, email: `race2_${stamp}@test.local` })),
  ]);
  const created = [r1, r2].filter((r) => r.status === 201).length;
  check("تسجيل متزامن بنفس اسم المستخدم يُنشئ حسابًا واحدًا فقط", created === 1, `201=${created}, statuses=${r1.status}/${r2.status}`);
  check("الخادم يمنع التكرار بحالة أحرف مختلفة على مستوى قاعدة البيانات", (await prisma.user.count({ where: { username: { equals: raceName, mode: "insensitive" } } })) === 1);

  // محاولة إدخال مباشر في قاعدة البيانات بنفس الاسم بحالة أخرى (اختبار القيد)
  let dbBlocked = false;
  try {
    await prisma.user.create({
      data: {
        fullName: "مخالف",
        username: raceName.toUpperCase(),
        email: `dbdup_${stamp}@test.local`,
        passwordHash: "x",
      },
    });
  } catch (e) {
    dbBlocked = (e as { code?: string }).code === "P2002";
  }
  check("قيد فريد فعلي على lower(username) في قاعدة البيانات", dbBlocked);

  /* ---------------- 2) الدخول وسجل التدقيق ---------------- */

  status("دخول بكلمة مرور خاطئة يُرفض", await req(null, "POST", "/api/v1/auth/login", { identifier: uname1, password: "WrongPass2026" }), 401);
  const failedAudit = await prisma.auditLog.findFirst({
    where: { userId: user1id, action: "LOGIN", result: "FAILURE" },
    orderBy: { createdAt: "desc" },
  });
  check("تسجيل محاولة دخول فاشلة في سجل التدقيق", !!failedAudit && !!failedAudit.ip && !!failedAudit.createdAt);
  check("سجل الدخول الفاشل لا يحتوي كلمة المرور", !!failedAudit && !JSON.stringify(failedAudit).includes("WrongPass2026"));

  const loginRes = await req(null, "POST", "/api/v1/auth/login", { identifier: uname1.toUpperCase(), password: PASSWORD });
  status("الدخول اسم مستخدم بحالة أحرف مختلفة", loginRes, 200);
  cookie1 = cookieOf(loginRes) ?? cookie1;
  const session1 = { name: uname1, cookie: cookie1, id: user1id };
  check("تسجيل دخول ناجح في سجل التدقيق", !!(await prisma.auditLog.findFirst({ where: { userId: user1id, action: "LOGIN", result: "SUCCESS" } })));

  /* ---------------- 3) إعدادات الحساب ---------------- */

  // الاسم
  const newName = "سارة أحمد العتيبي";
  const nameRes = await req(session1, "PATCH", "/api/v1/users/me", { fullName: newName });
  status("تعديل الاسم من الإعدادات", nameRes, 200);
  const nameAudit = await prisma.auditLog.findFirst({
    where: { userId: user1id, action: "PROFILE_NAME_UPDATE" },
    orderBy: { createdAt: "desc" },
  });
  const oldV = nameAudit?.oldValues as Record<string, unknown> | null;
  const newV = nameAudit?.newValues as Record<string, unknown> | null;
  check("سجل التدقيق يحفظ الاسم القديم والجديد", oldV?.fullName === "سارة أحمد" && newV?.fullName === newName, `${oldV?.fullName} → ${newV?.fullName}`);
  status("رفض اسم غير صالح (أرقام)", await req(session1, "PATCH", "/api/v1/users/me", { fullName: "سارة 55" }), 400);

  // اسم المستخدم
  const newUname = `accnew_${stamp}`;
  status("تعديل اسم المستخدم إلى اسم متاح", await req(session1, "PATCH", "/api/v1/users/me/username", { username: newUname }), 200);
  status("رفض اسم مستخدم مستخدم بالفعل (بحالة أخرى)", await req(session1, "PATCH", "/api/v1/users/me/username", { username: uname2.toUpperCase() }), 409);
  status("رفض اسم مستخدم عربي عند التعديل", await req(session1, "PATCH", "/api/v1/users/me/username", { username: "اسم_عربي" }), 400);
  const unameAudit = await prisma.auditLog.findFirst({ where: { userId: user1id, action: "USERNAME_CHANGE", result: "SUCCESS" }, orderBy: { createdAt: "desc" } });
  check("سجل تغيير اسم المستخدم يحوي القيمة القديمة والجديدة", (unameAudit?.oldValues as Record<string, unknown>)?.username === uname1 && (unameAudit?.newValues as Record<string, unknown>)?.username === newUname);

  status("منع تعديل حساب مستخدم آخر", await req(session1, "PATCH", `/api/v1/users/${user2id}`, { fullName: "اختراق" }), 403);
  const denied = await prisma.auditLog.findFirst({ where: { userId: user1id, action: "PROFILE_UPDATE_OTHER_DENIED" }, orderBy: { createdAt: "desc" } });
  check("تسجيل محاولة تعديل حساب آخر كحدث أمني فاشل", denied?.result === "FAILURE");

  // البريد الإلكتروني
  status("رفض تغيير البريد بدون كلمة المرور الصحيحة", await req(session1, "PATCH", "/api/v1/users/me/email", { newEmail: `new_${stamp}@test.local`, currentPassword: "WrongPass2026" }), 401);
  status("رفض تغيير البريد إلى بريد مستخدم آخر", await req(session1, "PATCH", "/api/v1/users/me/email", { newEmail: email2, currentPassword: PASSWORD }), 409);
  status("رفض تغيير البريد إلى نفس البريد الحالي", await req(session1, "PATCH", "/api/v1/users/me/email", { newEmail: email1, currentPassword: PASSWORD }), 400);

  const targetEmail = `changed_${stamp}@test.local`;
  const emailRes = await req(session1, "PATCH", "/api/v1/users/me/email", { newEmail: targetEmail, currentPassword: PASSWORD });
  status("طلب تغيير البريد بكلمة المرور الحالية", emailRes, 200);
  const afterRequest = await prisma.user.findUnique({ where: { id: user1id }, select: { email: true, pendingEmail: true } });
  check("البريد الجديد لا يُعتمد قبل التحقق (pendingEmail فقط)", afterRequest?.email === email1 && afterRequest?.pendingEmail === targetEmail);
  const emailToken = await prisma.authToken.findFirst({ where: { userId: user1id, type: "EMAIL_CHANGE" }, orderBy: { createdAt: "desc" } });
  check("تخزين تجزئة رمز تغيير البريد (SHA-256) لا الرمز نفسه", !!emailToken && /^[a-f0-9]{64}$/.test(emailToken.tokenHash));
  const emailAudit = await prisma.auditLog.findFirst({ where: { userId: user1id, action: "EMAIL_CHANGE_REQUESTED" }, orderBy: { createdAt: "desc" } });
  check(
    "سجل طلب تغيير البريد يحفظ القديم والجديد وحالة التحقق",
    (emailAudit?.oldValues as Record<string, unknown>)?.email === email1 &&
      (emailAudit?.newValues as Record<string, unknown>)?.pendingEmail === targetEmail &&
      (emailAudit?.newValues as Record<string, unknown>)?.verified === false,
  );

  // تأكيد البريد برمز مزروع بتجزئة معروفة
  const rawEmailToken = crypto.randomBytes(24).toString("hex");
  await prisma.authToken.create({
    data: {
      userId: user1id,
      type: "EMAIL_CHANGE",
      tokenHash: sha256(rawEmailToken),
      newEmail: targetEmail,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  const confirmRes = await req(null, "POST", "/api/v1/auth/email-change/confirm", { token: rawEmailToken });
  status("تأكيد البريد الجديد عبر رابط التحقق", confirmRes, 200);
  const afterConfirm = await prisma.user.findUnique({ where: { id: user1id }, select: { email: true, pendingEmail: true, emailVerified: true, sessionVersion: true } });
  check("اعتماد البريد الجديد موثّقًا وإلغاء pendingEmail", afterConfirm?.email === targetEmail && afterConfirm?.pendingEmail === null && afterConfirm?.emailVerified === true);
  check("إلغاء الجلسات السابقة بعد تغيير البريد", (await req(session1, "GET", "/api/v1/auth/me")).status === 401);
  status("رفض إعادة استخدام رابط تأكيد البريد", await req(null, "POST", "/api/v1/auth/email-change/confirm", { token: rawEmailToken }), 400);

  // الدخول بالبريد الجديد
  const reLogin = await req(null, "POST", "/api/v1/auth/login", { identifier: targetEmail, password: PASSWORD });
  status("الدخول بالبريد الجديد", reLogin, 200);
  let cookie = cookieOf(reLogin)!;
  const session = { name: `acc-${stamp}`, cookie, id: user1id };

  /* ---------------- 4) كلمة المرور ---------------- */

  status("رفض تغيير كلمة المرور بكلمة حالية خاطئة", await req(session, "POST", "/api/v1/users/me/password", { currentPassword: "WrongPass2026", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }), 401);
  status("رفض كلمة مرور جديدة ضعيفة (بلا رقم)", await req(session, "POST", "/api/v1/users/me/password", { currentPassword: PASSWORD, newPassword: "SirajNewPassWord", confirmPassword: "SirajNewPassWord" }), 400);
  status("رفض تأكيد غير مطابق لكلمة المرور الجديدة", await req(session, "POST", "/api/v1/users/me/password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: "SirajNew2027" }), 400);

  // جلسة ثانية (جهاز آخر) لإثبات إلغائها
  const second = await req(null, "POST", "/api/v1/auth/login", { identifier: targetEmail, password: PASSWORD });
  const cookie2 = cookieOf(second)!;
  const session2 = { name: "device-2", cookie: cookie2, id: user1id };

  const pwRes = await req(session, "POST", "/api/v1/users/me/password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
  status("تغيير كلمة المرور بكلمة المرور الحالية", pwRes, 200);
  const newCookie = cookieOf(pwRes);
  check("إصدار جلسة جديدة للجهاز الحالي بعد التغيير", !!newCookie);
  if (newCookie) session.cookie = newCookie;
  check("الجلسة الحالية تبقى صالحة بعد التغيير", (await req(session, "GET", "/api/v1/auth/me")).status === 200);
  check("الجلسات الأخرى تُلغى بعد تغيير كلمة المرور", (await req(session2, "GET", "/api/v1/auth/me")).status === 401);
  status("الدخول بكلمة المرور القديمة مرفوض", await req(null, "POST", "/api/v1/auth/login", { identifier: targetEmail, password: PASSWORD }), 401);
  status("الدخول بكلمة المرور الجديدة", await req(null, "POST", "/api/v1/auth/login", { identifier: targetEmail, password: NEW_PASSWORD }), 200);

  const pwAudit = await prisma.auditLog.findFirst({ where: { userId: user1id, action: "PASSWORD_CHANGE", result: "SUCCESS" }, orderBy: { createdAt: "desc" } });
  check("تسجيل تغيير كلمة المرور دون أي كلمة مرور", !!pwAudit && (pwAudit.newValues as Record<string, unknown>)?.method === "إعدادات الحساب");

  /* ---------------- 5) الصورة الشخصية ---------------- */

  const avatar = await uploadFile(session, PNG_BYTES, "image/png", "me.png", "/api/v1/users/me/avatar", "avatar");
  status("رفع صورة شخصية صحيحة (PNG)", avatar, 201);
  const avatarUrl: string = avatar.body?.data?.avatarUrl;
  check("اسم الصورة يُولَّد على الخادم", typeof avatarUrl === "string" && avatarUrl.startsWith(`/uploads/${user1id}-`));
  const fetched = await req(session, "GET", avatarUrl);
  status("عرض الصورة الشخصية لصاحبها", fetched, 200);
  check("نوع محتوى الصورة صحيح", fetched.headers.get("content-type")?.includes("image/png") ?? false);

  const fake = await uploadFile(session, PDF_BYTES, "image/png", "fake.png", "/api/v1/users/me/avatar", "avatar");
  status("رفض ملف مزيف (PDF مُعلن كصورة)", fake, 400);
  const textFile = await uploadFile(session, Buffer.from("hello world, not an image"), "image/png", "x.png", "/api/v1/users/me/avatar", "avatar");
  status("رفض محتوى غير صورة", textFile, 400);
  const pdfAsAvatar = await uploadFile(session, PDF_BYTES, "application/pdf", "doc.pdf", "/api/v1/users/me/avatar", "avatar");
  status("رفض نوع ملف غير مسموح للصورة", pdfAsAvatar, 400);

  status("إزالة الصورة الشخصية", await req(session, "DELETE", "/api/v1/users/me/avatar"), 200);
  check("إعادة الصورة الافتراضية بعد الإزالة", (await prisma.user.findUnique({ where: { id: user1id }, select: { avatarUrl: true } }))?.avatarUrl === null);
  check("سجل رفع الصورة وإزالتها موجود", (await prisma.auditLog.count({ where: { userId: user1id, action: { in: ["AVATAR_UPLOAD", "AVATAR_REMOVE"] } } })) >= 2);

  /* ---------------- 6) استعادة كلمة المرور ---------------- */

  const unknown = await req(null, "POST", "/api/v1/auth/forgot-password", { email: `nobody_${stamp}@test.local` });
  status("طلب استعادة لبريد غير مسجل يستجيب بنجاح عام", unknown, 200);
  const known = await req(null, "POST", "/api/v1/auth/forgot-password", { email: targetEmail });
  status("طلب استعادة لكلمة المرور", known, 200);
  check("رسالة الاستجابة لا تكشف وجود البريد", unknown.body?.data?.message === known.body?.data?.message);

  const resetTokenRow = await prisma.authToken.findFirst({ where: { userId: user1id, type: "PASSWORD_RESET" }, orderBy: { createdAt: "desc" } });
  const ttlMinutes = resetTokenRow ? Math.round((resetTokenRow.expiresAt.getTime() - Date.now()) / 60000) : -1;
  check("صلاحية رابط الاستعادة 30 دقيقة", ttlMinutes >= 28 && ttlMinutes <= 30, `${ttlMinutes} دقيقة`);
  check("تخزين تجزئة رمز الاستعادة فقط", !!resetTokenRow && /^[a-f0-9]{64}$/.test(resetTokenRow.tokenHash));

  // رمز منتهي الصلاحية
  const expiredRaw = crypto.randomBytes(24).toString("hex");
  await prisma.authToken.create({
    data: { userId: user1id, type: "PASSWORD_RESET", tokenHash: sha256(expiredRaw), expiresAt: new Date(Date.now() - 60 * 1000) },
  });
  status("رفض الرمز بعد انتهاء صلاحيته", await req(null, "POST", "/api/v1/auth/reset-password", { token: expiredRaw, password: "ResetPass2026", confirmPassword: "ResetPass2026" }), 400);

  // رمز صالح مزروع — مع رفض كلمة مرور ضعيفة أولًا
  const rawReset = crypto.randomBytes(24).toString("hex");
  await prisma.authToken.create({
    data: { userId: user1id, type: "PASSWORD_RESET", tokenHash: sha256(rawReset), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  status("رفض كلمة مرور جديدة لا تحقق الشروط عبر رابط الاستعادة", await req(null, "POST", "/api/v1/auth/reset-password", { token: rawReset, password: "weakpass", confirmPassword: "weakpass" }), 400);
  status("تعيين كلمة مرور جديدة عبر الرابط", await req(null, "POST", "/api/v1/auth/reset-password", { token: rawReset, password: "ResetPass2026", confirmPassword: "ResetPass2026" }), 200);
  status("رفض إعادة استخدام الرابط بعد نجاحه", await req(null, "POST", "/api/v1/auth/reset-password", { token: rawReset, password: "ResetPass2027", confirmPassword: "ResetPass2027" }), 400);
  check("إلغاء الجلسات القائمة بعد استعادة كلمة المرور", (await req(session, "GET", "/api/v1/auth/me")).status === 401);
  status("الدخول بكلمة المرور الجديدة بعد الاستعادة", await req(null, "POST", "/api/v1/auth/login", { identifier: targetEmail, password: "ResetPass2026" }), 200);

  // طلب رابط جديد يُلغي السابق
  const staleRaw = crypto.randomBytes(24).toString("hex");
  await prisma.authToken.create({
    data: { userId: user1id, type: "PASSWORD_RESET", tokenHash: sha256(staleRaw), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  await req(null, "POST", "/api/v1/auth/forgot-password", { email: targetEmail });
  status("إلغاء الرابط السابق عند طلب رابط جديد", await req(null, "POST", "/api/v1/auth/reset-password", { token: staleRaw, password: "ResetPass2028", confirmPassword: "ResetPass2028" }), 400);

  const login3 = await req(null, "POST", "/api/v1/auth/login", { identifier: targetEmail, password: "ResetPass2026" });
  const cookie3 = cookieOf(login3)!;
  const session3 = { name: "final", cookie: cookie3, id: user1id };

  /* ---------------- 7) الجلسات والأجهزة ---------------- */

  const sessionsRes = await req(session3, "GET", "/api/v1/users/me/sessions");
  status("قراءة سجل الجلسات", sessionsRes, 200);
  const list = (sessionsRes.body?.data ?? []) as Array<{ id: string; endedAt: string | null; createdAt: string }>;
  check("سجل الجلسات يحوي جلسات منتهية ونشطة", list.some((s) => !!s.endedAt) && list.some((s) => !s.endedAt));
  check("معرّف الجلسة الحالية مُعاد في meta", typeof (sessionsRes.body?.meta?.currentSessionId ?? null) === "string");
  check("سجل الجلسات لا يحوي رمز الجلسة", !JSON.stringify(sessionsRes.body).includes(cookie3.split("=")[1]));

  // إنهاء جلسة محددة (غير الحالية)
  const otherLogin = await req(null, "POST", "/api/v1/auth/login", { identifier: targetEmail, password: "ResetPass2026" });
  const otherCookie = cookieOf(otherLogin)!;
  const sessions2 = await req(session3, "GET", "/api/v1/users/me/sessions");
  const currentSid = (sessions2.body?.meta?.currentSessionId ?? "") as string;
  const otherSess = ((sessions2.body?.data ?? []) as Array<{ id: string; endedAt: string | null }>).find((s) => s.id !== currentSid && !s.endedAt);
  check("وجود جلسة أخرى نشطة لإلغائها", !!otherSess);
  if (otherSess) {
    status("إنهاء جلسة محددة من سجل الأجهزة", await req(session3, "DELETE", `/api/v1/users/me/sessions/${otherSess.id}`), 200);
    check("الجلسة الملغاة لم تعد صالحة", (await req({ name: "other", cookie: otherCookie }, "GET", "/api/v1/auth/me")).status === 401);
  }

  status("تسجيل الخروج من جميع الأجهزة", await req(session3, "POST", "/api/v1/users/me/sessions/logout-all"), 200);
  check("الجلسة الحالية تنتهي بعد الخروج من الكل", (await req(session3, "GET", "/api/v1/auth/me")).status === 401);
  check("لا توجد جلسات نشطة بعد الخروج من الكل", (await prisma.userSession.count({ where: { userId: user1id, endedAt: null } })) === 0);

  /* ---------------- 8) سجل التدقيق: الوصول والحجب ---------------- */

  // جلسة طالب حديثة (الجلسات السابقة أُنهيت في اختبار الخروج من الكل)
  const studentFreshLogin = await req(null, "POST", "/api/v1/auth/login", { identifier: targetEmail, password: "ResetPass2026" });
  const studentFresh = { name: "student-fresh", cookie: cookieOf(studentFreshLogin), id: user1id };
  status("دخول طالب جديد لاختبار صلاحيات سجل التدقيق", studentFreshLogin, 200);
  const studentAuditAccess = await req(studentFresh, "GET", "/api/v1/admin/audit-logs");
  check("منع المستخدم العادي من قراءة سجل التدقيق", studentAuditAccess.status === 403, `HTTP ${studentAuditAccess.status}`);

  const admin = await login("demo_manager@demo.siraj.local", DEMO_PASSWORD);
  const adminAudit = await req(admin, "GET", "/api/v1/admin/audit-logs?limit=5");
  status("الإدارة المخولة تقرأ سجل التدقيق", adminAudit, 200);
  check("سجل التدقيق يحتوي الحقول المطلوبة", !!adminAudit.body?.data?.[0]?.id && !!adminAudit.body?.data?.[0]?.action && !!adminAudit.body?.data?.[0]?.createdAt);
  const adminByAction = await req(admin, "GET", "/api/v1/admin/audit-logs?action=LOGIN&result=FAILURE&limit=3");
  status("تصفية سجل التدقيق بالحدث والنتيجة", adminByAction, 200);

  // لا أسرار في سجل التدقيق
  const leaks = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM "AuditLog"
    WHERE COALESCE("oldValues"::text, '') LIKE ${"%" + PASSWORD + "%"}
       OR COALESCE("newValues"::text, '') LIKE ${"%" + PASSWORD + "%"}
       OR COALESCE("oldValues"::text, '') LIKE ${"%" + NEW_PASSWORD + "%"}
       OR COALESCE("newValues"::text, '') LIKE ${"%" + NEW_PASSWORD + "%"}
       OR COALESCE("oldValues"::text, '') LIKE ${"%" + "ResetPass2026" + "%"}
       OR COALESCE("newValues"::text, '') LIKE ${"%" + "ResetPass2026" + "%"}
       OR COALESCE("oldValues"::text, '') LIKE ${"%" + rawReset + "%"}
       OR COALESCE("newValues"::text, '') LIKE ${"%" + rawReset + "%"}
  `;
  check("سجل التدقيق خالٍ من كلمات المرور والرموز", (leaks[0]?.n ?? 0) === 0, `matches=${leaks[0]?.n}`);

  const mailLeak = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM "EmailLog"
    WHERE COALESCE("metadata"::text, '') LIKE ${'%' + PASSWORD + '%'}
       OR COALESCE("metadata"::text, '') LIKE ${'%' + NEW_PASSWORD + '%'}
       OR COALESCE("metadata"::text, '') LIKE ${'%' + 'ResetPass2026' + '%'}
  `;
  check("سجل البريد لا يحتوي كلمات المرور", (mailLeak[0]?.n ?? 0) === 0);
  check("لا تُخزَّن كلمة المرور كنص صريح في جدول المستخدم", !(await prisma.user.findUnique({ where: { id: user1id }, select: { passwordHash: true } }))!.passwordHash.includes("ResetPass2026"));

  /* ---------------- الملخص ---------------- */
  const failed = results.filter((r) => !r.ok);
  console.log(`\nالنتيجة: ${results.length - failed.length}/${results.length} ناجح`);
  if (failed.length) {
    console.log("\nفشل:");
    failed.forEach((f) => console.log(` - ${f.name} ${f.detail ? `(${f.detail})` : ""}`));
  }
  await prisma.$disconnect();
  process.exitCode = failed.length ? 1 : 0;
}

void main().catch(async (e) => {
  console.error("\n[FATAL]", e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
