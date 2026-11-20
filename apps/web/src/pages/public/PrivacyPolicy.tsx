import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui';

type TabKey = 'privacy' | 'terms' | 'refund';

export default function PrivacyPolicy({ defaultTab = 'privacy' }: { defaultTab?: TabKey }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as TabKey;
  const initial = (['privacy', 'terms', 'refund'].includes(urlTab) ? urlTab : defaultTab) || 'privacy';
  const [activeTab, setActiveTab] = useState<TabKey>(initial);

  useEffect(() => {
    if (urlTab && ['privacy', 'terms', 'refund'].includes(urlTab)) {
      setActiveTab(urlTab);
    } else if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [urlTab, defaultTab]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="container-x max-w-4xl py-12">
      {/* رأس الصفحة */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          السياسات والشروط — <span className="gold-text">أكاديمية سراج</span>
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          شفافية كاملة والتزام بحماية حقوقك وبياناتك وفق الأنظمة المعمول بها في المملكة العربية السعودية.
        </p>
      </div>

      {/* التبويبات الثلاثة */}
      <div className="mb-8 flex flex-wrap items-center justify-center gap-2 border-b border-line pb-4">
        <button
          type="button"
          onClick={() => switchTab('privacy')}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'privacy'
              ? 'bg-gold-200 text-stone-950 shadow-sm'
              : 'border border-line bg-surface text-ink-secondary hover:text-ink-primary'
          }`}
        >
          سياسة الخصوصية
        </button>
        <button
          type="button"
          onClick={() => switchTab('terms')}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'terms'
              ? 'bg-gold-200 text-stone-950 shadow-sm'
              : 'border border-line bg-surface text-ink-secondary hover:text-ink-primary'
          }`}
        >
          شروط وأحكام الاستخدام
        </button>
        <button
          type="button"
          onClick={() => switchTab('refund')}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'refund'
              ? 'bg-gold-200 text-stone-950 shadow-sm'
              : 'border border-line bg-surface text-ink-secondary hover:text-ink-primary'
          }`}
        >
          سياسة استرداد الأموال
        </button>
      </div>

      {/* محتوى السياسات */}
      <Card className="p-6 sm:p-10">
        {activeTab === 'privacy' && <PrivacyContent />}
        {activeTab === 'terms' && <TermsContent />}
        {activeTab === 'refund' && <RefundContent />}
      </Card>
    </div>
  );
}

function PrivacyContent() {
  return (
    <article className="prose-custom space-y-6 text-sm leading-8 text-ink-secondary">
      <div className="border-b border-line pb-4">
        <h2 className="text-2xl font-bold text-ink-primary">سياسة الخصوصية – Siraj Academy</h2>
        <p className="mt-1 text-xs text-ink-muted">
          <strong>تاريخ آخر تحديث:</strong> 20 نوفمبر 2026
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">1. مقدمة</h3>
        <p>
          مرحبًا بك في Siraj Academy. نحن نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية والتعامل معها بمسؤولية وشفافية.
        </p>
        <p>
          توضح سياسة الخصوصية هذه كيفية جمع بياناتك واستخدامها وتخزينها وحمايتها ومشاركتها عند استخدامك موقع Siraj Academy وخدماته، سواء كنت طالبًا أو مدرسًا أو زائرًا.
        </p>
        <p>
          باستخدامك المنصة أو إنشاء حساب فيها، فإنك تقر باطلاعك على هذه السياسة. وإذا كان هناك استخدام للبيانات يتطلب موافقة مستقلة، فسنطلبها منك بشكل واضح.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-gold-200">2. البيانات التي نجمعها</h3>
        <p>قد نجمع بعض البيانات بحسب طبيعة استخدامك للمنصة، وتشمل:</p>

        <div className="space-y-2 rounded-lg bg-surface/50 p-4 border border-line/60">
          <h4 className="font-semibold text-ink-primary">أ. بيانات الحساب</h4>
          <ul className="list-disc space-y-1 pe-5 ps-5">
            <li>الاسم الكامل.</li>
            <li>اسم المستخدم.</li>
            <li>البريد الإلكتروني.</li>
            <li>كلمة المرور بعد تخزينها بصيغة مشفرة أو مجزأة آمنة، دون الاحتفاظ بها كنص مكشوف.</li>
            <li>نوع الحساب، مثل طالب أو مدرس.</li>
            <li>الصورة الشخصية، إذا أضفتها.</li>
          </ul>
        </div>

        <div className="space-y-2 rounded-lg bg-surface/50 p-4 border border-line/60">
          <h4 className="font-semibold text-ink-primary">ب. بيانات التواصل</h4>
          <ul className="list-disc space-y-1 pe-5 ps-5">
            <li>رقم WhatsApp أو رقم الهاتف، إذا قدمته.</li>
            <li>الرسائل والاستفسارات المرسلة إلى فريق المنصة.</li>
            <li>بيانات التواصل المتعلقة بالطلبات والخدمات.</li>
          </ul>
        </div>

        <div className="space-y-2 rounded-lg bg-surface/50 p-4 border border-line/60">
          <h4 className="font-semibold text-ink-primary">ج. بيانات الطلبات والخدمات</h4>
          <ul className="list-disc space-y-1 pe-5 ps-5">
            <li>الجامعة والتخصص والمقررات التي تختارها.</li>
            <li>تفاصيل الخدمة المطلوبة والتعليمات والمرفقات التي ترسلها.</li>
            <li>سجل الطلبات وحالتها ومراسلاتها.</li>
            <li>الملفات التي ترفعها أو تستلمها من خلال المنصة.</li>
          </ul>
        </div>

        <div className="space-y-2 rounded-lg bg-surface/50 p-4 border border-line/60">
          <h4 className="font-semibold text-ink-primary">د. بيانات الدفع</h4>
          <ul className="list-disc space-y-1 pe-5 ps-5">
            <li>المبلغ المدفوع وتاريخ العملية وحالتها.</li>
            <li>رقم مرجعي أو إثبات الدفع الذي ترسله، عند الحاجة.</li>
            <li>معلومات محدودة عن وسيلة الدفع إذا وفرها مزود الدفع للمنصة.</li>
          </ul>
          <p className="mt-2 text-xs font-semibold text-warning">
            لا نطلب منك إرسال كلمة مرور بطاقتك البنكية أو الرقم السري أو رمز التحقق البنكي، ولا ينبغي لك مشاركتها معنا.
          </p>
        </div>

        <div className="space-y-2 rounded-lg bg-surface/50 p-4 border border-line/60">
          <h4 className="font-semibold text-ink-primary">هـ. البيانات التقنية</h4>
          <p>قد نجمع تلقائيًا بعض البيانات الضرورية لتشغيل المنصة وحمايتها، مثل:</p>
          <ul className="list-disc space-y-1 pe-5 ps-5">
            <li>عنوان IP.</li>
            <li>نوع الجهاز والمتصفح ونظام التشغيل.</li>
            <li>أوقات تسجيل الدخول والخروج.</li>
            <li>سجلات الأخطاء ومحاولات الدخول والأنشطة الأمنية.</li>
            <li>ملفات تعريف الارتباط والتقنيات المشابهة وفق إعدادات المنصة.</li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">3. كيف نستخدم بياناتك؟</h3>
        <p>نستخدم البيانات للأغراض التالية:</p>
        <ol className="list-decimal space-y-1.5 pe-5 ps-5">
          <li>إنشاء الحسابات وإدارتها والتحقق من هويتك عند الحاجة.</li>
          <li>تمكينك من طلب الخدمات الأكاديمية ومتابعة تنفيذها.</li>
          <li>ربط الطلبات بالمدرسين أو مقدمي الخدمة المناسبين.</li>
          <li>التواصل معك بشأن الطلبات والمدفوعات والتحديثات.</li>
          <li>إرسال رسائل التحقق واستعادة الحساب والإشعارات الضرورية.</li>
          <li>معالجة إثباتات الدفع ومراجعة العمليات المالية.</li>
          <li>تشغيل المحادثات بين الطلاب والمدرسين وفريق الإدارة.</li>
          <li>تحسين جودة المنصة واكتشاف الأخطاء.</li>
          <li>حماية الحسابات ومنع الاحتيال والاختراق وإساءة الاستخدام.</li>
          <li>تنفيذ الالتزامات القانونية والمحاسبية والتنظيمية.</li>
        </ol>
        <p className="mt-2 text-ink-muted">
          لن نستخدم بياناتك لغرض مختلف بصورة جوهرية عن الغرض الذي جُمعت من أجله إلا وفق أساس نظامي مناسب، وسنطلب موافقتك عندما تكون مطلوبة.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">4. مشاركة البيانات مع أطراف أخرى</h3>
        <p className="font-semibold text-ink-primary">لا نبيع بياناتك الشخصية للغير.</p>
        <p>قد نشارك الحد الأدنى اللازم من البيانات مع الجهات التالية عندما تقتضي الخدمة ذلك:</p>
        <ul className="list-disc space-y-1.5 pe-5 ps-5">
          <li><strong>المدرسون ومقدمو الخدمات:</strong> لمساعدتهم على تنفيذ الطلبات، وقد نشارك معهم الاسم أو تفاصيل الطلب أو الملفات الضرورية.</li>
          <li><strong>مزودو الاستضافة والتخزين:</strong> لتشغيل الموقع وحفظ البيانات والملفات.</li>
          <li><strong>مزودو البريد الإلكتروني:</strong> لإرسال رسائل التحقق والإشعارات واستعادة الحساب.</li>
          <li><strong>مزودو تسجيل الدخول الخارجي:</strong> مثل Google أو Apple إذا اخترت تسجيل الدخول من خلالهم.</li>
          <li><strong>مزودو الدفع:</strong> لمعالجة المدفوعات أو التحقق منها عند استخدام خدماتهم.</li>
          <li><strong>خدمات خارجية مرتبطة بالطلب:</strong> مثل Telegram أو YouTube عند استخدام روابط أو خدمات مرتبطة بهما.</li>
          <li><strong>الجهات الرسمية:</strong> إذا كان الإفصاح مطلوبًا بموجب الأنظمة أو أمر صادر من جهة مختصة.</li>
        </ul>
        <p className="mt-2 text-ink-muted">
          قد تتم معالجة بعض البيانات أو تخزينها خارج المملكة العربية السعودية من خلال مزودي خدمات تقنيين. وعند حدوث ذلك، نتخذ الإجراءات والضمانات النظامية المطلوبة بشأن نقل البيانات أو معالجتها خارج المملكة.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">5. حماية البيانات</h3>
        <p>نتخذ تدابير تقنية وتنظيمية مناسبة لحماية البيانات، ومنها بحسب ما هو مطبق في المنصة:</p>
        <ul className="list-disc space-y-1.5 pe-5 ps-5">
          <li>تشفير الاتصالات باستخدام HTTPS.</li>
          <li>حماية كلمات المرور باستخدام خوارزميات تجزئة آمنة.</li>
          <li>تقييد صلاحيات الوصول إلى البيانات.</li>
          <li>استخدام وسائل الحماية من محاولات الدخول غير المصرح بها.</li>
          <li>مراقبة الأنشطة الأمنية وتسجيل الأحداث المهمة.</li>
          <li>إجراء نسخ احتياطية عند الحاجة.</li>
          <li>مراجعة الإجراءات الأمنية وتحديثها بصورة دورية.</li>
        </ul>
        <p className="mt-2 text-ink-muted">
          ومع ذلك، لا يمكن ضمان أن أي نظام إلكتروني آمن بصورة مطلقة، لكننا نعمل على تقليل المخاطر والتعامل مع الحوادث وفق المتطلبات النظامية.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">6. ملفات تعريف الارتباط</h3>
        <p>قد تستخدم المنصة ملفات تعريف الارتباط أو تقنيات مشابهة من أجل:</p>
        <ul className="list-disc space-y-1.5 pe-5 ps-5">
          <li>الحفاظ على جلسة تسجيل الدخول.</li>
          <li>تذكر تفضيلات اللغة والعرض.</li>
          <li>تحسين أداء الموقع.</li>
          <li>حماية الحسابات واكتشاف الاستخدام غير المعتاد.</li>
          <li>قياس استخدام المنصة وتحسين خدماتها، إذا كانت أدوات القياس مفعلة.</li>
        </ul>
        <p className="mt-2 text-ink-muted">
          يمكنك إدارة ملفات تعريف الارتباط من إعدادات المتصفح، لكن تعطيل بعض الملفات الضرورية قد يؤثر في عمل بعض خصائص الموقع.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">7. الاحتفاظ بالبيانات وحذفها</h3>
        <p>
          نحتفظ بالبيانات للمدة اللازمة لتحقيق الأغراض الموضحة في هذه السياسة، أو للمدة التي تتطلبها الأنظمة والالتزامات المحاسبية وتسوية النزاعات وحماية الحقوق.
        </p>
        <p>
          عند انتهاء الحاجة إلى البيانات، نتخذ الإجراءات المناسبة لحذفها أو إتلافها أو إخفاء هويتها، ما لم يوجد سبب نظامي يقتضي الاحتفاظ بها.
        </p>
        <p>
          قد تبقى بعض البيانات في النسخ الاحتياطية أو السجلات المقيدة لفترة لازمة لأغراض أمنية أو نظامية، ثم تُحذف وفق إجراءات الاحتفاظ المعتمدة.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">8. حقوقك المتعلقة ببياناتك</h3>
        <p>وفق الأنظمة المعمول بها، وبحسب الشروط والاستثناءات النظامية، يمكنك طلب:</p>
        <ul className="list-disc space-y-1.5 pe-5 ps-5">
          <li>معرفة البيانات الشخصية التي نجمعها عنك.</li>
          <li>الوصول إلى بياناتك والحصول على نسخة منها بصيغة واضحة.</li>
          <li>تصحيح البيانات غير الدقيقة أو استكمالها أو تحديثها.</li>
          <li>طلب إتلاف بياناتك عندما لا تعود هناك حاجة نظامية أو مشروعة للاحتفاظ بها.</li>
          <li>سحب الموافقة على المعالجة التي تستند إلى موافقتك، دون أن يؤثر ذلك في مشروعية المعالجة السابقة للسحب.</li>
          <li>الاعتراض أو تقديم شكوى بشأن معالجة بياناتك وفق الإجراءات المتاحة نظامًا.</li>
        </ul>
        <p className="mt-2">
          لممارسة حقوقك، تواصل معنا عبر البريد الإلكتروني الرسمي. سنراجع طلبك ونتعامل معه خلال المدد النظامية، وقد نطلب التحقق من هويتك قبل تنفيذ بعض الطلبات.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">9. بيانات القُصّر</h3>
        <p>
          خدمات المنصة موجهة للأشخاص القادرين على إبرام التعاملات وفق الأنظمة المعمول بها. إذا كان المستخدم قاصرًا أو لا يملك الأهلية اللازمة، فيجب أن يتم استخدام الخدمات وتقديم البيانات بموافقة وليه أو ممثله النظامي متى تطلب الأمر ذلك.
        </p>
        <p>
          إذا علمنا أننا جمعنا بيانات قاصر بطريقة غير مناسبة، فسنتخذ الإجراءات اللازمة لمعالجة ذلك وفق الأنظمة.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">10. مسؤولية المستخدم</h3>
        <p>يتعهد المستخدم بما يلي:</p>
        <ul className="list-disc space-y-1.5 pe-5 ps-5">
          <li>تقديم بيانات صحيحة ومحدثة.</li>
          <li>المحافظة على سرية بيانات الدخول.</li>
          <li>عدم مشاركة بيانات حسابه مع الآخرين.</li>
          <li>عدم رفع بيانات أو ملفات تخص أشخاصًا آخرين دون وجود حق أو إذن مناسب.</li>
          <li>عدم إرسال معلومات مالية أو كلمات مرور أو رموز تحقق سرية عبر المحادثات.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">11. الروابط والخدمات الخارجية</h3>
        <p>
          قد تحتوي المنصة على روابط لخدمات خارجية مثل Google وApple وYouTube وTelegram أو غيرها. تخضع تلك الخدمات لسياسات الخصوصية الخاصة بها، ولا تتحكم Siraj Academy في ممارسات معالجة البيانات لدى الجهات الخارجية.
        </p>
        <p>ننصح بمراجعة سياسة الخصوصية الخاصة بكل خدمة قبل استخدامها.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">12. التعديلات على السياسة</h3>
        <p>
          قد نقوم بتحديث سياسة الخصوصية عند إضافة خدمات جديدة أو إجراء تغييرات تشغيلية أو نظامية.
        </p>
        <p>
          سيتم نشر النسخة المحدثة في هذه الصفحة مع تعديل تاريخ آخر تحديث. وإذا كان التغيير يتطلب موافقة جديدة بموجب الأنظمة، فسنطلبها بالطريقة المناسبة.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-line bg-surface/80 p-5">
        <h3 className="text-lg font-bold text-gold-200">13. التواصل والشكاوى</h3>
        <p>للاستفسارات أو طلبات الخصوصية أو الشكاوى المتعلقة بالبيانات الشخصية:</p>
        <ul className="space-y-1 pe-5 ps-5">
          <li><strong>اسم الجهة:</strong> Siraj Academy</li>
          <li><strong>البريد الإلكتروني:</strong> support@siraj.sa</li>
          <li><strong>وسيلة التواصل:</strong> تليجرام @Siraj1Academy أو رقم الدعم 0579769007</li>
        </ul>
        <p className="mt-2 text-xs text-ink-muted">
          نحرص على مراجعة الطلبات والرد عليها وفق الإجراءات والمدد النظامية.
        </p>
      </section>
    </article>
  );
}

function TermsContent() {
  return (
    <article className="prose-custom space-y-6 text-sm leading-8 text-ink-secondary">
      <div className="border-b border-line pb-4">
        <h2 className="text-2xl font-bold text-ink-primary">شروط وأحكام الاستخدام – Siraj Academy</h2>
        <p className="mt-1 text-xs text-ink-muted">
          <strong>تاريخ آخر تحديث:</strong> 20 نوفمبر 2026
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">1. المقدمة</h3>
        <p>مرحبًا بك في Siraj Academy.</p>
        <p>
          تُعد هذه الشروط والأحكام اتفاقية تنظم استخدامك لمنصة Siraj Academy وموقعها الإلكتروني وخدماتها الرقمية.
        </p>
        <p>يرجى قراءة هذه الشروط بعناية قبل إنشاء حساب أو طلب أي خدمة أو استخدام أي من وظائف المنصة.</p>
        <p>
          يُعد إنشاء الحساب أو استخدام المنصة أو إتمام عملية شراء موافقة منك على الالتزام بهذه الشروط، وذلك دون الإخلال بأي حقوق مقررة لك بموجب الأنظمة المعمول بها.
        </p>
        <p>إذا لم توافق على هذه الشروط، يرجى عدم استخدام الخدمات التي تتطلب الموافقة عليها.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">2. التعريفات</h3>
        <p>لأغراض هذه الشروط، يقصد بالمصطلحات التالية المعاني الموضحة أمام كل منها:</p>
        <ul className="list-disc space-y-1.5 pe-5 ps-5">
          <li><strong>المنصة:</strong> موقع Siraj Academy وجميع الخدمات والأنظمة والواجهات التابعة له.</li>
          <li><strong>الإدارة:</strong> الجهة المسؤولة عن تشغيل المنصة وإدارتها والإشراف على خدماتها.</li>
          <li><strong>المستخدم:</strong> كل شخص يستخدم المنصة أو يتصفحها.</li>
          <li><strong>الطالب:</strong> المستخدم الذي ينشئ حسابًا للاستفادة من الخدمات الأكاديمية.</li>
          <li><strong>المدرس:</strong> المستخدم الذي ينشئ حسابًا لتقديم خدمات تعليمية أو أكاديمية من خلال المنصة.</li>
          <li><strong>الطلب:</strong> أي خدمة يطلبها الطالب من خلال المنصة.</li>
          <li><strong>مقدم الخدمة:</strong> المدرس أو الشخص المكلف بتنفيذ خدمة معينة.</li>
          <li><strong>المحتوى:</strong> النصوص والصور والملفات والعروض والفيديوهات والمواد التعليمية وأي بيانات يتم رفعها أو نشرها أو تبادلها عبر المنصة.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">3. طبيعة خدمات المنصة</h3>
        <p>تقدم Siraj Academy خدمات أكاديمية وتعليمية رقمية، وقد تشمل:</p>
        <ol className="list-decimal space-y-1.5 pe-5 ps-5">
          <li>الشروحات الأكاديمية للمقررات والمواد الدراسية.</li>
          <li>الشروحات المباشرة أو المسجلة.</li>
          <li>المساعدة في فهم الواجبات والتكاليف الأكاديمية.</li>
          <li>إعداد عروض PowerPoint والمشاريع والعروض التقديمية.</li>
          <li>المساعدة في المشاريع البرمجية والتقنية.</li>
          <li>ترجمة المحاضرات والمذكرات والمواد التعليمية.</li>
          <li>توفير خدمات أكاديمية إضافية وفق ما تعلنه المنصة.</li>
          <li>استقبال طلبات المقررات والخدمات غير المدرجة في القائمة المتاحة.</li>
        </ol>
        <p className="mt-2 text-ink-muted">
          تختلف تفاصيل الخدمة وسعرها ومدة تنفيذها حسب طبيعتها ومتطلبات الطلب، ويتم توضيح التفاصيل للطالب قبل تأكيد الطلب.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">4. شروط إنشاء الحساب</h3>
        <p>عند إنشاء حساب في Siraj Academy، يلتزم المستخدم بما يلي:</p>
        <ul className="list-disc space-y-1.5 pe-5 ps-5">
          <li>تقديم معلومات صحيحة ودقيقة.</li>
          <li>استخدام بريد إلكتروني يملك حق الوصول إليه.</li>
          <li>اختيار اسم مستخدم غير مستخدم من قبل.</li>
          <li>إنشاء كلمة مرور قوية والمحافظة على سريتها.</li>
          <li>عدم استخدام بيانات شخص آخر دون إذنه.</li>
          <li>عدم إنشاء حسابات متعددة بهدف التحايل على أنظمة المنصة.</li>
          <li>تحديث بيانات الحساب عند تغييرها.</li>
        </ul>
        <p className="mt-2 text-ink-muted">
          يكون المستخدم مسؤولًا عن جميع الأنشطة التي تتم من خلال حسابه، ما لم يثبت وجود اختراق أو استخدام غير مصرح به لم يكن بإمكانه منعه بصورة معقولة.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">5. حسابات الطلاب</h3>
        <p>يلتزم الطالب بما يلي:</p>
        <ol className="list-decimal space-y-1.5 pe-5 ps-5">
          <li>إدخال بيانات صحيحة عند التسجيل وتقديم الطلبات.</li>
          <li>اختيار الجامعة والتخصص والمقرر بصورة دقيقة عند توفر هذه الخيارات.</li>
          <li>كتابة تفاصيل الخدمة المطلوبة بوضوح.</li>
          <li>إرفاق الملفات الضرورية التي تساعد على تنفيذ الطلب.</li>
          <li>مراجعة السعر والمدة والمتطلبات قبل تأكيد الطلب.</li>
          <li>سداد المبلغ المتفق عليه عبر وسائل الدفع المعتمدة.</li>
          <li>متابعة حالة الطلب والرد على استفسارات فريق العمل عند الحاجة.</li>
          <li>عدم إساءة استخدام المحادثات أو التواصل مع المدرسين.</li>
          <li>عدم تقديم طلبات مخالفة للقوانين أو الأنظمة أو حقوق الآخرين.</li>
        </ol>
        <p className="mt-2 text-ink-muted">
          يتحمل الطالب مسؤولية صحة المعلومات والملفات التي يقدمها، وأي تأخير ناتج عن نقص المعلومات أو عدم الرد على الاستفسارات الضرورية.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">6. حسابات المدرسين ومقدمي الخدمات</h3>
        <p>يجب على المدرس أو مقدم الخدمة:</p>
        <ul className="list-disc space-y-1.5 pe-5 ps-5">
          <li>تقديم بيانات صحيحة عند التسجيل.</li>
          <li>امتلاك المؤهلات أو الخبرة المناسبة للخدمات التي يعرضها.</li>
          <li>الالتزام بالمواعيد المتفق عليها.</li>
          <li>تنفيذ الطلبات وفق التفاصيل والمواصفات المعتمدة.</li>
          <li>المحافظة على سرية بيانات الطلاب والملفات التي يطلعون عليها.</li>
          <li>عدم استخدام بيانات الطلاب لأغراض شخصية أو تسويقية دون موافقة مناسبة.</li>
          <li>عدم مشاركة حسابه مع أشخاص غير مصرح لهم.</li>
          <li>عدم استغلال المنصة للتواصل التجاري خارج نطاقها بقصد التحايل على سياساتها.</li>
          <li>عدم رفع محتوى ينتهك حقوق الملكية الفكرية أو حقوق الآخرين.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">7. الطلبات وتأكيد الخدمات</h3>
        <p>عند تقديم طلب جديد:</p>
        <ol className="list-decimal space-y-1.5 pe-5 ps-5">
          <li>يحدد الطالب الخدمة أو المقرر المطلوب.</li>
          <li>يقدم التفاصيل والملفات اللازمة.</li>
          <li>تتم مراجعة الطلب وتحديد السعر والمدة، إذا لم تكن محددة مسبقًا.</li>
          <li>يتم إبلاغ الطالب بالتفاصيل المطلوبة قبل تأكيد الخدمة.</li>
          <li>لا يُعد الطلب مؤكدًا للتنفيذ إلا بعد استكمال المتطلبات المطلوبة وإتمام الدفع أو اعتماد وسيلة الدفع المحددة.</li>
          <li>يتم تحديث حالة الطلب عبر المنصة كلما توفرت معلومات جديدة.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">8. الأسعار والمدفوعات</h3>
        <ul className="list-disc space-y-1.5 pe-5 ps-5">
          <li>تظهر أسعار الخدمات في المنصة أو يتم إبلاغ الطالب بها قبل تأكيد الطلب.</li>
          <li>يجب على الطالب التأكد من السعر والتفاصيل قبل إتمام الدفع.</li>
          <li>لا يُعد إرسال إثبات الدفع وحده تأكيدًا نهائيًا للعملية حتى يتم التحقق منه.</li>
          <li>يجب استخدام وسائل الدفع المعتمدة والمعلنة في المنصة.</li>
          <li>لا يجوز إرسال كلمات المرور البنكية أو الأرقام السرية أو رموز التحقق إلى الإدارة أو المدرسين.</li>
          <li>إذا حدث خطأ في عملية الدفع أو تم خصم المبلغ دون تحديث حالة الطلب، يجب التواصل مع الدعم وإرفاق الرقم المرجعي للعملية.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">9. تنفيذ وتسليم الخدمات</h3>
        <p>
          تلتزم المنصة ومقدمو الخدمات ببذل العناية اللازمة لتنفيذ الخدمات وفق التفاصيل المتفق عليها.
        </p>
        <p>ويلتزم الطالب بتوفير المتطلبات ومراجعة الملفات المستلمة وإبلاغ الدعم عن أي اختلاف جوهري.</p>
        <p className="text-ink-muted">
          ولا تشمل التعديلات المجانية طلبات جديدة أو تغييرات جوهرية في نطاق العمل لم تكن ضمن الاتفاق الأصلي.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
        <h3 className="text-lg font-bold text-gold-200">10. الاستخدام الأكاديمي المسؤول</h3>
        <p>
          تقدم Siraj Academy خدمات تعليمية ومساندة أكاديمية تهدف إلى دعم التعلم وتطوير المهارات وفهم المواد الدراسية.
        </p>
        <p className="font-semibold text-ink-primary">يتعهد المستخدم بعدم استخدام المنصة في:</p>
        <ul className="list-disc space-y-1 pe-5 ps-5">
          <li>الغش أثناء الاختبارات أو التقييمات المباشرة.</li>
          <li>انتحال شخصية طالب آخر أو تنفيذ تقييم يتطلب أداء المستخدم الشخصي بطريقة غير مشروعة.</li>
          <li>تزوير الشهادات أو النتائج أو المستندات الأكاديمية.</li>
          <li>تقديم أعمال الغير على أنها أعماله الشخصية إذا كان ذلك مخالفًا لقواعد المؤسسة التعليمية.</li>
          <li>تجاوز أنظمة الجامعات أو المؤسسات التعليمية أو التحايل عليها.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">11. المحادثات والتواصل</h3>
        <p>
          يوافق المستخدم على استخدام المحادثات لأغراض الخدمة والدعم، وعدم إرسال رسائل مسيئة أو روابط ضارة أو بيانات سرية.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">12. الملكية الفكرية</h3>
        <p>
          تعود حقوق الملكية الفكرية الخاصة بتصميم المنصة وهويتها وشعاراتها وأكوادها إلى أصحاب الحقوق المعنيين. ولا تنتقل حقوق ملكية ملفات المستخدم إلى المنصة لمجرد رفعها إلا بالقدر اللازم لتقديم الخدمة.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">13. الاستخدامات المحظورة</h3>
        <p>يُمنع اختراق المنصة، استغلال الثغرات، انتحال الشخصيات، التلاعب بالمدفوعات، أو مضايقة المستخدمين.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">14. إيقاف الحساب أو تقييد الوصول</h3>
        <p>
          يجوز للإدارة تعليق أو إيقاف الحساب عند ارتكاب مخالفات جسيمة مع مراعاة حقوق المستخدم النظامية.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">15. توفر المنصة والصيانة</h3>
        <p>نسعى لإبقاء المنصة مستقرة، وقد تتوقف مؤقتاً لأعمال الصيانة والتحديث الدوري.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">16. الخدمات والروابط الخارجية</h3>
        <p>يخضع استخدام الروابط الخارجية (مثل Google, YouTube, Telegram) لسياسات الجهات المقدمة لها.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">17. الخصوصية وحماية البيانات</h3>
        <p>تخضع البيانات الشخصية لسياسة الخصوصية المنشورة في المنصة.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">18. حدود المسؤولية</h3>
        <p>تقدم المنصة خدماتها وفق التفاصيل المتفق عليها وبما لا يتعارض مع الأنظمة المعمول بها.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">19. التعديلات على الشروط</h3>
        <p>يجوز تحديث الشروط عند الحاجة وتُنشر النسخة المحدثة في الموقع مع تعديل التاريخ.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">20. القانون الواجب التطبيق وتسوية النزاعات</h3>
        <p>
          تخضع هذه الشروط للأنظمة واللوائح المعمول بها في المملكة العربية السعودية، ويكون الفصل في أي نزاع من اختصاص الجهات القضائية المختصة بالمملكة.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-line bg-surface/80 p-5">
        <h3 className="text-lg font-bold text-gold-200">21. التواصل والدعم</h3>
        <ul className="space-y-1 pe-5 ps-5">
          <li><strong>اسم المنصة:</strong> Siraj Academy</li>
          <li><strong>البريد الإلكتروني:</strong> support@siraj.sa</li>
          <li><strong>رقم الدعم:</strong> 0579769007</li>
        </ul>
      </section>
    </article>
  );
}

function RefundContent() {
  return (
    <article className="prose-custom space-y-6 text-sm leading-8 text-ink-secondary">
      <div className="border-b border-line pb-4">
        <h2 className="text-2xl font-bold text-ink-primary">سياسة استرداد الأموال – Siraj Academy</h2>
        <p className="mt-1 text-xs text-ink-muted">
          <strong>تاريخ آخر تحديث:</strong> 20 نوفمبر 2026
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">1. مقدمة</h3>
        <p>
          تهدف سياسة استرداد الأموال في Siraj Academy إلى توضيح الحالات التي يمكن فيها استرداد المبالغ المدفوعة مقابل الخدمات الأكاديمية، والإجراءات اللازمة لتقديم طلب الاسترداد.
        </p>
        <p>
          نحرص على تقديم الخدمات وفق التفاصيل والمدة والمواصفات المتفق عليها مع العميل، ونتعامل مع طلبات الاسترداد بوضوح وعدالة.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">2. نطاق السياسة</h3>
        <p>تسري هذه السياسة على الخدمات المدفوعة من خلال Siraj Academy، وتشمل على سبيل المثال:</p>
        <ul className="list-disc space-y-1 pe-5 ps-5">
          <li>الشروحات الأكاديمية والمحاضرات (مباشرة أو مسجلة).</li>
          <li>حل الواجبات والتكاليف الأكاديمية.</li>
          <li>إعداد عروض PowerPoint والمشاريع البرمجية والتقنية.</li>
          <li>ترجمة المحاضرات والملفات والخدمات الأكاديمية الأخرى المتاحة في المنصة.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-gold-200">3. متى يحق للعميل طلب استرداد المبلغ؟</h3>
        <p>يمكن للعميل تقديم طلب استرداد في الحالات التالية:</p>

        <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
          <h4 className="font-semibold text-ink-primary">أ. إلغاء الطلب قبل بدء التنفيذ</h4>
          <p>
            إذا طلب العميل إلغاء الخدمة قبل أن يبدأ فريق العمل أو المدرس في تنفيذها، فيمكنه طلب استرداد المبلغ مع مراعاة أي تكاليف فعلية غير قابلة للاسترداد تم الإفصاح عنها والموافقة عليها وبما لا يخالف حقوق المستهلك النظامية.
          </p>
        </div>

        <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
          <h4 className="font-semibold text-ink-primary">ب. عدم توفر الخدمة</h4>
          <p>
            إذا تعذر على المنصة توفير الخدمة التي دفع العميل مقابلها، ولم يتم الاتفاق معه على بديل مناسب، فيحق له طلب استرداد المبلغ المدفوع عن الخدمة غير المقدمة.
          </p>
        </div>

        <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
          <h4 className="font-semibold text-ink-primary">ج. عدم تنفيذ الخدمة</h4>
          <p>
            إذا لم يتم تنفيذ الخدمة وفق الموعد المتفق عليه، أو تجاوز التأخير المدة التي تمنح العميل حق الفسخ بموجب الأنظمة المعمول بها، فيحق للعميل المطالبة باسترداد المبلغ وفق الأحكام النظامية.
          </p>
        </div>

        <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
          <h4 className="font-semibold text-ink-primary">د. وجود اختلاف جوهري عن الاتفاق</h4>
          <p>
            إذا تم تسليم العمل بمواصفات تختلف اختلافًا جوهريًا عن المتفق عليه، فيحق للعميل تقديم شكوى وطلب معالجة المشكلة أو إعادة التنفيذ أو الاسترداد بحسب طبيعة الحالة.
          </p>
        </div>

        <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
          <h4 className="font-semibold text-ink-primary">هـ. وجود خلل في الخدمة</h4>
          <p>
            إذا كان الملف المسلم تالفًا أو لا يمكن فتحه أو كان رابط الخدمة لا يعمل بسبب خلل من جانبنا، فيحق للعميل طلب إصلاح الخلل أو توفير بديل مناسب، وإذا تعذر ذلك فيمكنه طلب الاسترداد.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">4. الحالات التي لا يُقبل فيها الاسترداد عادةً</h3>
        <p>مع مراعاة الحقوق النظامية، لا يُقبل طلب الاسترداد عادةً في الحالات التالية:</p>
        <ol className="list-decimal space-y-1.5 pe-5 ps-5">
          <li>إذا تم تنفيذ الخدمة وتسليمها وفق المواصفات المتفق عليها، واستفاد العميل منها.</li>
          <li>إذا بدأ تنفيذ عمل مخصص للعميل، وكانت الخدمة قد نُفذت أو استُهلكت جزئيًا، وذلك بالقدر الذي تسمح به الأنظمة وبما يتناسب مع العمل المنجز فعليًا.</li>
          <li>إذا كان سبب عدم رضا العميل هو تغيير رأيه بعد بدء تنفيذ الخدمة، دون وجود إخلال من جانب المنصة.</li>
          <li>إذا قدم العميل معلومات أو ملفات غير صحيحة أو ناقصة أدت إلى تأخر التنفيذ أو تعذر إتمامه.</li>
          <li>إذا تأخر العميل في الرد أو إرسال المتطلبات الضرورية، مما أثر في موعد التنفيذ.</li>
          <li>إذا كان الخلل ناتجًا عن جهاز العميل أو اتصاله بالإنترنت أو برنامج خارجي لا تتحكم فيه المنصة.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">5. الخدمات المخصصة والأعمال التي بدأ تنفيذها</h3>
        <p>
          بعض الخدمات تُنفذ بناءً على طلب خاص ومواصفات يحددها العميل (مثل المشاريع والعروض والواجبات). نوضح للعميل طبيعة وتكلفة الخدمة مسبقاً، وإذا طلب الإلغاء بعد بدء التنفيذ تتم مراجعة مقدار العمل المنجز والتكاليف الفعلية لتحديد المبلغ المستحق للاسترداد إن وجد.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">6. الشروحات المباشرة والمسجلة</h3>
        <p>
          <strong>الشروحات المباشرة:</strong> إذا تم الحجز ولم يبدأ الموعد يمكن طلب الإلغاء والاسترداد، أما إذا بدأ الشرح أو استفاد العميل منه فتتم مراجعة الحالة بحسب الجزء المقدم.
        </p>
        <p>
          <strong>المحتوى الرقمي المسجل:</strong> إذا تم تفعيل الوصول إلى المحتوى واستخدامه فتخضع إمكانية الاسترداد للأحكام النظامية، ولا يُحرم العميل من حقه إذا كان المحتوى معيبًا أو تعذر الوصول إليه لخلل من جانبنا.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">7. مدة طلب الاسترداد</h3>
        <p>
          يُرجى تقديم طلب الاسترداد فور ظهور سبب الطلب. وبالنسبة لحق فسخ العقد خلال 7 أيام من تاريخ التعاقد، فإنه يُطبق وفق نظام التجارة الإلكترونية السعودي متى توافرت شروطه (مثل عدم الاستفادة من الخدمة).
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">8. كيفية تقديم طلب الاسترداد</h3>
        <p>يمكن تقديم الطلب عبر وسائل التواصل الرسمية مع إرفاق:</p>
        <ul className="list-disc space-y-1 pe-5 ps-5">
          <li>الاسم أو البريد الإلكتروني المرتبط بالحساب.</li>
          <li>رقم الطلب واسم الخدمة وتاريخ ومبلغ الدفع.</li>
          <li>سبب طلب الاسترداد وإثبات الدفع / الرقم المرجعي.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gold-200">9. مراجعة طلب الاسترداد وطريقة الإعادة</h3>
        <p>
          نسعى لمراجعة الطلبات والرد خلال 5 أيام عمل. وتتم إعادة المبلغ، متى أمكن، إلى نفس وسيلة الدفع الأصلية أو عبر تحويل بنكي رسمي بعد التحقق من ملكية الحساب.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-line bg-surface/80 p-5">
        <h3 className="text-lg font-bold text-gold-200">10. التواصل والنزاعات</h3>
        <p>إذا لم تكن راضيًا عن النتيجة، يمكنك التواصل مع إدارة Siraj Academy لإعادة مراجعة الحالة وديًا دون الإخلال بحقك في تقديم شكوى للجهات المختصة.</p>
        <ul className="mt-2 space-y-1 pe-5 ps-5">
          <li><strong>البريد الإلكتروني:</strong> support@siraj.sa</li>
          <li><strong>رقم الدعم:</strong> 0579769007</li>
        </ul>
      </section>
    </article>
  );
}
