import { useEffect } from 'react';
import { Card } from '../../components/ui';
import { Seo } from '../../lib/seo';

export default function RefundPolicy() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="container-x max-w-4xl py-12">
      <Seo
        title="سياسة استرداد الأموال | Refund Policy"
        description="شروط استرداد المبالغ في أكاديمية سراج وطرق تقديم الطلب. Siraj Academy refund terms and request process."
      />
      <Card className="p-6 sm:p-10">
        <article className="prose-custom space-y-6 text-sm leading-8 text-ink-secondary">
          <div className="border-b border-line pb-4">
            <h1 className="text-3xl font-bold text-ink-primary">سياسة استرداد الأموال – Siraj Academy</h1>
            <p className="mt-1 text-xs text-ink-muted">
              <strong>تاريخ آخر تحديث:</strong> 20 نوفمبر 2026
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gold-200">1. مقدمة</h2>
            <p>
              تهدف سياسة استرداد الأموال في Siraj Academy إلى توضيح الحالات التي يمكن فيها استرداد المبالغ المدفوعة مقابل الخدمات الأكاديمية، والإجراءات اللازمة لتقديم طلب الاسترداد.
            </p>
            <p>
              نحرص على تقديم الخدمات وفق التفاصيل والمدة والمواصفات المتفق عليها مع العميل، ونتعامل مع طلبات الاسترداد بوضوح وعدالة.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gold-200">2. نطاق السياسة</h2>
            <p>تسري هذه السياسة على الخدمات المدفوعة من خلال Siraj Academy، وتشمل على سبيل المثال:</p>
            <ul className="list-disc space-y-1 pe-5 ps-5">
              <li>الشروحات الأكاديمية والمحاضرات (مباشرة أو مسجلة).</li>
              <li>حل الواجبات والتكاليف الأكاديمية.</li>
              <li>إعداد عروض PowerPoint والمشاريع البرمجية والتقنية.</li>
              <li>ترجمة المحاضرات والملفات والخدمات الأكاديمية الأخرى المتاحة في المنصة.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-gold-200">3. متى يحق للعميل طلب استرداد المبلغ؟</h2>
            <p>يمكن للعميل تقديم طلب استرداد في الحالات التالية:</p>

            <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
              <h3 className="font-semibold text-ink-primary">أ. إلغاء الطلب قبل بدء التنفيذ</h3>
              <p>
                إذا طلب العميل إلغاء الخدمة قبل أن يبدأ فريق العمل أو المدرس في تنفيذها، فيمكنه طلب استرداد المبلغ مع مراعاة أي تكاليف فعلية غير قابلة للاسترداد تم الإفصاح عنها والموافقة عليها وبما لا يخالف حقوق المستهلك النظامية.
              </p>
            </div>

            <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
              <h3 className="font-semibold text-ink-primary">ب. عدم توفر الخدمة</h3>
              <p>
                إذا تعذر على المنصة توفير الخدمة التي دفع العميل مقابلها، ولم يتم الاتفاق معه على بديل مناسب، فيحق له طلب استرداد المبلغ المدفوع عن الخدمة غير المقدمة.
              </p>
            </div>

            <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
              <h3 className="font-semibold text-ink-primary">ج. عدم تنفيذ الخدمة</h3>
              <p>
                إذا لم يتم تنفيذ الخدمة وفق الموعد المتفق عليه، أو تجاوز التأخير المدة التي تمنح العميل حق الفسخ بموجب الأنظمة المعمول بها، فيحق للعميل المطالبة باسترداد المبلغ وفق الأحكام النظامية.
              </p>
            </div>

            <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
              <h3 className="font-semibold text-ink-primary">د. وجود اختلاف جوهري عن الاتفاق</h3>
              <p>
                إذا تم تسليم العمل بمواصفات تختلف اختلافًا جوهريًا عن المتفق عليه، فيحق للعميل تقديم شكوى وطلب معالجة المشكلة أو إعادة التنفيذ أو الاسترداد بحسب طبيعة الحالة.
              </p>
            </div>

            <div className="space-y-1.5 rounded-lg bg-surface/50 p-3.5 border border-line/60">
              <h3 className="font-semibold text-ink-primary">هـ. وجود خلل في الخدمة</h3>
              <p>
                إذا كان الملف المسلم تالفًا أو لا يمكن فتحه أو كان رابط الخدمة لا يعمل بسبب خلل من جانبنا، فيحق للعميل طلب إصلاح الخلل أو توفير بديل مناسب، وإذا تعذر ذلك فيمكنه طلب الاسترداد.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gold-200">4. الحالات التي لا يُقبل فيها الاسترداد عادةً</h2>
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
            <h2 className="text-lg font-bold text-gold-200">5. الخدمات المخصصة والأعمال التي بدأ تنفيذها</h2>
            <p>
              بعض الخدمات تُنفذ بناءً على طلب خاص ومواصفات يحددها العميل (مثل المشاريع والعروض والواجبات). نوضح للعميل طبيعة وتكلفة الخدمة مسبقاً، وإذا طلب الإلغاء بعد بدء التنفيذ تتم مراجعة مقدار العمل المنجز والتكاليف الفعلية لتحديد المبلغ المستحق للاسترداد إن وجد.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gold-200">6. الشروحات المباشرة والمسجلة</h2>
            <p>
              <strong>الشروحات المباشرة:</strong> إذا تم الحجز ولم يبدأ الموعد يمكن طلب الإلغاء والاسترداد، أما إذا بدأ الشرح أو استفاد العميل منه فتتم مراجعة الحالة بحسب الجزء المقدم.
            </p>
            <p>
              <strong>المحتوى الرقمي المسجل:</strong> إذا تم تفعيل الوصول إلى المحتوى واستخدامه فتخضع إمكانية الاسترداد للأحكام النظامية، ولا يُحرم العميل من حقه إذا كان المحتوى معيبًا أو تعذر الوصول إليه لخلل من جانبنا.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gold-200">7. مدة طلب الاسترداد</h2>
            <p>
              يُرجى تقديم طلب الاسترداد فور ظهور سبب الطلب. وبالنسبة لحق فسخ العقد خلال 7 أيام من تاريخ التعاقد، فإنه يُطبق وفق نظام التجارة الإلكترونية السعودي متى توافرت شروطه (مثل عدم الاستفادة من الخدمة).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gold-200">8. كيفية تقديم طلب الاسترداد</h2>
            <p>يمكن تقديم الطلب عبر وسائل التواصل الرسمية مع إرفاق:</p>
            <ul className="list-disc space-y-1 pe-5 ps-5">
              <li>الاسم أو البريد الإلكتروني المرتبط بالحساب.</li>
              <li>رقم الطلب واسم الخدمة وتاريخ ومبلغ الدفع.</li>
              <li>سبب طلب الاسترداد وإثبات الدفع / الرقم المرجعي.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gold-200">9. مراجعة طلب الاسترداد وطريقة الإعادة</h2>
            <p>
              نسعى لمراجعة الطلبات والرد خلال 5 أيام عمل. وتتم إعادة المبلغ، متى أمكن، إلى نفس وسيلة الدفع الأصلية أو عبر تحويل بنكي رسمي بعد التحقق من ملكية الحساب.
            </p>
          </section>

          <section className="space-y-3 rounded-lg border border-line bg-surface/80 p-5">
            <h2 className="text-lg font-bold text-gold-200">10. التواصل والنزاعات</h2>
            <p>إذا لم تكن راضيًا عن النتيجة، يمكنك التواصل مع إدارة Siraj Academy لإعادة مراجعة الحالة وديًا دون الإخلال بحقك في تقديم شكوى للجهات المختصة.</p>
            <ul className="mt-2 space-y-1 pe-5 ps-5">
              <li><strong>البريد الإلكتروني:</strong> support@siraj.sa</li>
              <li><strong>رقم الدعم:</strong> 0579769007</li>
            </ul>
          </section>
        </article>
      </Card>
    </div>
  );
}
