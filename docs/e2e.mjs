// اختبار دمج شامل E2E — أكاديمية سراج
const BASE = 'http://localhost:4000/api/v1';
const jars = {}; // name -> cookie string
let pass = 0, fail = 0;

async function call(who, method, path, body, extra = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (jars[who]) headers['Cookie'] = jars[who];
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...extra,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) jars[who] = setCookie.split('; ')[0] + '; ' + (jars[who] || '');
  const ct = res.headers.get('content-type') || '';
  const json = ct.includes('json') ? await res.json() : null;
  return { status: res.status, json };
}

function ok(name, cond, info = '') {
  if (cond) { pass++; console.log(`PASS ${name} ${info}`); }
  else { fail++; console.log(`FAIL ${name} ${info}`); }
}

// multipart upload helper
async function uploadReceipt(who, orderId, pngPath) {
  const fs = await import('node:fs');
  const blob = new Blob([fs.readFileSync(pngPath)], { type: 'image/png' });
  const fd = new FormData();
  fd.append('receipt', blob, 'receipt.png');
  const res = await fetch(`${BASE}/orders/${orderId}/receipt`, {
    method: 'POST',
    headers: { Cookie: jars[who] },
    body: fd,
  });
  const json = await res.json();
  return { status: res.status, json };
}

(async () => {
  // 1) كتالوج
  const uni = await call('pub', 'GET', '/universities?limit=5');
  ok('universities', uni.status === 200 && uni.json.meta.total === 32, `total=${uni.json.meta.total}`);
  const uniId = uni.json.data[0].id;

  // 2) دخول الإدارة
  const admin = await call('admin', 'POST', '/auth/login', { identifier: 'admin@siraj.sa', password: 'Siraj@2026Admin' });
  ok('admin login', admin.status === 200 && admin.json.data.user.role === 'ADMIN');

  // 3) إنشاء كلية/تخصص/مقرر
  const college = await call('admin', 'POST', '/admin/colleges', { universityId: uniId, name: 'كلية اختبار الحاسبات' });
  ok('admin create college', college.status === 201 || college.status === 200, JSON.stringify(college.json.data?.id ?? '').slice(0, 12));
  const major = await call('admin', 'POST', '/admin/majors', { universityId: uniId, collegeId: college.json.data.id, name: 'علوم حاسب (اختبار)' });
  ok('admin create major', major.status === 201 || major.status === 200);
  const course = await call('admin', 'POST', '/admin/courses', { universityId: uniId, collegeId: college.json.data.id, majorId: major.json.data.id, title: 'مقرر اختبار CS101', code: 'CS101', level: 'المستوى 1' });
  ok('admin create course', course.status === 201 || course.status === 200, course.json.data?.id);

  // 4) مدرس جديد (PENDING) ثم محاولة نشر قبل الاعتماد
  const uniq = Date.now().toString().slice(-6);
  const treg = await call('teacher', 'POST', '/auth/register/teacher', { fullName: 'مختبر المدرس', username: `teacher_e2e_${uniq}`, email: `teacher_${uniq}@test.local`, whatsapp: '0512345678', password: 'Teacher2026Pass', confirmPassword: 'Teacher2026Pass', degree: 'بكالوريوس علوم حاسب — اختبار دمج شامل للمنصة', specialties: ['برمجة', 'قواعد بيانات'], bio: 'مدرس تجريبي لأ مشروع اختبار الدمج الشامل — نبذة 20 حرفًا على الأقل.' });
  const tName = `teacher_e2e_${uniq}`;
  ok('teacher registered PENDING', treg.status === 201 && treg.json.data.teacherProfile?.status === 'PENDING', treg.json.message ?? '');

  const preBlock = await call('teacher', 'POST', '/offerings', { courseId: course.json.data.id, summary: 'x', price: 100 });
  ok('pending teacher cannot publish', preBlock.status === 403 || preBlock.status === 401, `status=${preBlock.status}`);

  // الإدارة تعتمد المدرس
  const list = await call('admin', 'GET', '/admin/teachers?status=PENDING');
  const items = list.json.data?.items ?? list.json.data ?? [];
  const t = items.find((x) => x.username === tName || x.user?.username === tName);
  const approve = await call('admin', 'POST', `/admin/teachers/${t.id}/approve`);
  ok('admin approve teacher', approve.status === 200 || approve.status === 201);

  const tlogin = await call('teacher', 'POST', '/auth/login', { identifier: `teacher_${uniq}@test.local`, password: 'Teacher2026Pass', confirmPassword: 'Teacher2026Pass' });
  ok('approved teacher can login', tlogin.status === 200, `status=${tlogin.status}`);
  const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const off = await call('teacher', 'POST', '/offerings', {
    courseId: course.json.data.id, title: 'دورة اختبار كاملة للمنصة', summary: 'شرح المقرر بالتفصيل خطوة خطوة اختبار', price: 150,
    lessons: [
      { title: 'تجريبي', videoUrl: YT, access: 'TRIAL' },
      { title: 'مدفوع', videoUrl: YT, access: 'PAID' },
    ],
  });
  console.log('offerResp:', JSON.stringify(off.json).slice(0,400)); ok('teacher create offering', off.status === 200 || off.status === 201, `status=${off.status}`);
  // إضافة الدروس ثم النشر (الدرس التجريبي + المدفوع)
  const les1 = await call('teacher', 'POST', `/offerings/${off.json.data.id}/lessons`, { title: 'مقدمة تجريبية', videoUrl: YT, access: 'TRIAL' });
  const les2 = await call('teacher', 'POST', `/offerings/${off.json.data.id}/lessons`, { title: 'الفصل الأول المدفوع', videoUrl: YT, access: 'PAID' });
  ok('lessons created', les1.status >= 200 && les1.status < 300 && les2.status >= 200 && les2.status < 300, `s1=${les1.status} s2=${les2.status}`);
  const submit = await call('teacher', 'POST', `/offerings/${off.json.data.id}/submit`);
  ok('offerings submit -> PUBLISHED', submit.status === 200 && submit.json.data.status === 'PUBLISHED', JSON.stringify(submit.json.message ?? ''));

  // عام يرى الدروس التجريبية فقط
  const cour = await call('anon2', 'GET', `/courses/${course.json.data.id}`);
  const pubOff = (cour.json.data.offerings || [])[0];
  ok('course detail shows published offering', !!pubOff);
  ok('public sees TRIAL lessons only', (pubOff?.lessons || []).every((l) => l.access === 'TRIAL'), `lessons=${(pubOff?.lessons || []).length}`);

  // 5) الطالب
  const sreg = await call('student', 'POST', '/auth/register/student', { fullName: 'طالب اختبار', username: `student_e2e_${uniq}`, email: `student_${uniq}@test.local`, whatsapp: '0598765432', password: 'Passw0rd123', confirmPassword: 'Passw0rd123', universityId: uniId, majorId: major.json.data.id });
  ok('student registered', sreg.status === 201);

  const enroll = await call('student', 'POST', `/offerings/${off.json.data.id}/enroll`);
  const order = (enroll.json.data?.order ?? enroll.json.data) || {};
  ok('enroll creates order AWAITING_PAYMENT', !!order && (order.status === 'AWAITING_PAYMENT' || order.order?.status === 'AWAITING_PAYMENT'), `no=${order?.orderNo ?? order?.order?.orderNo} amount=${order?.amount ?? order?.order?.amount}`);
  const orderId = order.id ?? order.order?.id;

  // بدون دفع: الدروس المدفوعة مخفية كليًا عن الطالب
  const prePaid = await call('student', 'GET', `/courses/${course.json.data.id}`);
  const prePaidOff = (prePaid.json.data.offerings || [])[0];
  ok('pre-paid: paid lesson hidden', (prePaidOff?.lessons || []).every((l) => l.access === 'TRIAL') && prePaidOff.canSeeAllLessons === false, `preCanSee=${prePaidOff?.canSeeAllLessons}`);

  // رفع السند
  const tmp = process.env.TEMP;
  fs0: {
    const fs = await import('node:fs');
    // إن لم توجد صورة سند: أنشئ PNG 1x1
    const p = `${tmp}\\receipt_e2e.png`;
    if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  }
  const rcpt = await uploadReceipt('student', orderId, `${tmp}\\receipt_e2e.png`);
  if (rcpt.status >= 400) console.log('rcptErr:', JSON.stringify(rcpt.json).slice(0, 300));
  ok('receipt forwarded to UNDER_REVIEW', rcpt.status === 200 || rcpt.status === 201, `status=${rcpt.status} payment=${rcpt.json?.data?.status}`);

  // الإدارة تعتمد الدفع
  const pReview = await call('admin', 'GET', '/admin/payments?status=UNDER_REVIEW');
  const payId = (pReview.json.data.items || pReview.json.data || [])[0]?.id;
  const approvePay = await call('admin', 'POST', `/payments/${payId}/review`, { decision: 'APPROVED', note: 'سند صحيح (اختبار)' });
  ok('admin approve payment', approvePay.status === 200, `status=${approvePay.status}`);

  // الوصول بعد الدفع: الطالب مشترك
  const enrollments = await call('student', 'GET', '/enrollments');
  const enr = enrollments.json.data?.items ?? enrollments.json.data ?? [];
  ok('enrollment granted', enr.length >= 1, `count=${enr.length}`);
  // المحتوى المدفوع صار ظاهرًا للطالب المشترك
  const postPaid = await call('student', 'GET', `/courses/${course.json.data.id}`);
  const postPaidOff = (postPaid.json.data.offerings || [])[0];
  ok('post-paid: paid lesson accessible', postPaidOff.canSeeAllLessons === true, `postCanSee=${postPaidOff.canSeeAllLessons} lessons=${(postPaidOff.lessons||[]).length}`);

  // 6) طلب شرح + عروض
  const reqNew = await call('student', 'POST', '/requests', { universityId: uniId, courseTitle: 'مادة اختبار', details: 'شرح تفصيلي', type: 'ONLINE', urgency: 'WEEK' });
  ok('request created → PENDING_REVIEW', reqNew.status === 201 && reqNew.json.data.status === 'PENDING_REVIEW', reqNew.json.data?.status);

  // المدرس يحاول تقديم عرض قبل النشر => مرفوض
  const preOffer = await call('teacher', 'POST', `/requests/${reqNew.json.data.id}/offers`, { price: 200 });
  ok('offer on PENDING_REVIEW rejected', preOffer.status >= 400, `status=${preOffer.status}`);

  await call('admin', 'POST', `/requests/${reqNew.json.data.id}/publish`);
  const offer = await call('teacher', 'POST', `/requests/${reqNew.json.data.id}/offers`, { price: 200, message: 'عرض جيد', timelineDays: 7 });
  if (offer.status >= 400) console.log('offerErr:', JSON.stringify(offer.json).slice(0, 300));
  ok('offer submitted on OPEN', offer.status === 200 || offer.status === 201, `status=${offer.status}`);

  const accept = await call('student', 'POST', `/offers/${offer.json.data.id}/accept`);
  if (accept.status >= 400) console.log('acceptErr:', JSON.stringify(accept.json).slice(0, 300));
  const acceptedOrder = accept.json.data?.order ?? accept.json.data;
  ok('accept offer creates official order', accept.status === 200 && (acceptedOrder?.status === 'AWAITING_PAYMENT'), `no=${acceptedOrder?.orderNo}`);

  // 7) إشعارات + محادثات + ملفات
  const notifs = await call('student', 'GET', '/notifications');
  ok('student notifications', (notifs.json.data || []).length >= 1, `count=${(notifs.json.data || []).length}`);
  const rooms = await call('student', 'GET', '/chat/rooms');
  ok('chat rooms for student', (rooms.json.data || []).length >= 1, `count=${(rooms.json.data || []).length}`);

  // 8) إحصائيات الإدارة حقيقية
  const stats = await call('admin', 'GET', '/admin/stats');
  const d = stats.json.data || {};
  console.log('STATS:', JSON.stringify({ students: d.students?.total ?? d.students, teachersPending: d.teachers?.pending ?? d.teachersPending, revenueConfirmed: d.revenues?.confirmed ?? d.revenueConfirmed, requestsNew: d.requests?.new ?? d.requestsNew, topUniversities: d.topUniversities?.length, topServices: d.topServices?.length, topCourses: d.topCourses?.length }));
  ok('revenue confirmed > 0', (d.revenues?.confirmed ?? d.revenueConfirmed) > 0);

  // 9) إعلان مدرсер: دورة الحياة
  const ad = await call('teacher', 'POST', '/ads', { title: 'عرض اختبار للموسم', body: 'خصم تجريبي للأولى 5 أشخاص على دورة اختبار' });
  if (ad.status >= 400) console.log('adErr:', JSON.stringify(ad.json).slice(0, 300));
  ok('ad draft', ad.status === 201 || ad.status === 200);
  await call('teacher', 'POST', `/ads/${ad.json.data.id}/submit`);
  const pubAd = await call('a2', 'GET', '/ads');
  ok('pending ad not public', (pubAd.json.data || pubAd.json.data?.items || []).length === 0, `count=${(pubAd.json.data || pubAd.json.data?.items || []).length}`);
  await call('admin', 'POST', `/ads/${ad.json.data.id}/admin`, { decision: 'APPROVED' });
  const pubAd2 = await call('a2', 'GET', '/ads');
  ok('approved ad public', (pubAd2.json.data || pubAd2.json.data?.items || []).length === 1);
  // تعديل معتمد يعيده للمراجعة
  const adPatch = await call('teacher', 'PATCH', `/ads/${ad.json.data.id}`, { body: 'خصم معدّل للأولى 5 أشخاص — تعديل جوهري للاختبار' });
  console.log('adPatch:', adPatch.status, JSON.stringify(adPatch.json.data?.status ?? adPatch.json.message).slice(0, 200));
  const mine = await call('teacher', 'GET', '/ads?mine=true');
  console.log('mineAds:', JSON.stringify(mine.json.data).slice(0, 300));
  const mineAd = (mine.json.data?.items ?? mine.json.data ?? []).find((x) => x.id === ad.json.data.id);
  ok('material edit re-pends ad', mineAd?.status === 'PENDING_REVIEW', mineAd?.status);
  const pubAd3 = await call('a2', 'GET', '/ads');
  ok('re-pended ad hidden from public', (pubAd3.json.data || pubAd3.json.data?.items || []).length === 0);

  // 10) RBAC: الطالب لا يصل الإدارة
  const forbidden = await call('student', 'GET', '/admin/stats');
  ok('RBAC student->admin blocked', forbidden.status === 403 || forbidden.status === 401, `status=${forbidden.status}`);

  console.log(`\n==== E2E RESULT: ${pass} pass / ${fail} fail ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E crashed', e); process.exit(1); });
