import { useState, useEffect } from 'react';
import { api, type RefundRequest } from '../../../lib/api';
import { Card, Badge, Button, Skeleton, EmptyState, Form, Field, Input } from '../../../components/ui';
import { formatMoney, formatDateTime } from '../../../lib/format';
import { useToast } from '../../../lib/toast';
import { useI18n } from '../../../i18n';

const REFUND_STATUS_TONE: Record<string, 'ok' | 'warn' | 'coral' | 'teal' | 'gold'> = {
  PENDING: 'warn',
  UNDER_REVIEW: 'gold',
  NEEDS_INFORMATION: 'coral',
  APPROVED: 'teal',
  PARTIALLY_APPROVED: 'teal',
  PROCESSING: 'gold',
  REFUNDED: 'ok',
  PARTIALLY_REFUNDED: 'ok',
  REJECTED: 'coral',
  FAILED: 'coral',
  CANCELLED: 'warn',
};

const REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  UNDER_REVIEW: 'تحت المراجعة',
  NEEDS_INFORMATION: 'مطلوب معلومات إضافية',
  APPROVED: 'معتمد (بانتظار التحويل)',
  PARTIALLY_APPROVED: 'معتمد جزئياً',
  PROCESSING: 'جاري التحويل البنكي',
  REFUNDED: 'تم الاسترداد بنجاح',
  PARTIALLY_REFUNDED: 'تم الاسترداد الجزئي',
  REJECTED: 'مرفوض',
  FAILED: 'فشل التحويل',
  CANCELLED: 'ملغي',
};

export default function StudentRefunds() {
  const { t } = useI18n();
  const toast = useToast();
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [eligibleOrders, setEligibleOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  // Form fields
  const [orderId, setOrderId] = useState('');
  const [amountRequested, setAmountRequested] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [iban, setIban] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rRes, eRes] = await Promise.all([
        api.refunds.mine(),
        api.refunds.eligible(),
      ]);
      setRefunds(rRes.data || []);
      setEligibleOrders(eRes.data || []);
    } catch {
      toast.push('error', 'تعذر تحميل بيانات الاسترداد');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOrderSelect = (id: string) => {
    setOrderId(id);
    const ord = eligibleOrders.find((o) => o.id === id);
    setSelectedOrder(ord || null);
    if (ord) {
      setAmountRequested(String(ord.maxRefundable));
    }
  };

  const handleSubmit = async () => {
    if (!orderId) {
      toast.push('error', 'يرجى اختيار الطلب المراد استرداده');
      return;
    }
    const amt = parseFloat(amountRequested);
    if (isNaN(amt) || amt <= 0) {
      toast.push('error', 'يرجى إدخال مبلغ استرداد صحيح');
      return;
    }
    if (selectedOrder && amt > selectedOrder.maxRefundable) {
      toast.push('error', `المبلغ المطلوب يتجاوز الحد الأقصى (${selectedOrder.maxRefundable} ريال)`);
      return;
    }
    if (!reason.trim()) {
      toast.push('error', 'سبب الاسترداد مطلوب');
      return;
    }

    setSubmitting(true);
    try {
      await api.refunds.submit({
        orderId,
        amountRequested: amt,
        reason,
        notes,
        bankName,
        accountHolderName,
        iban,
      });
      toast.push('success', 'تم تقديم طلب الاسترداد بنجاح');
      setShowModal(false);
      // Reset form
      setOrderId('');
      setAmountRequested('');
      setReason('');
      setNotes('');
      setBankName('');
      setAccountHolderName('');
      setIban('');
      loadData();
    } catch (e: any) {
      toast.push('error', e.message || 'فشل تقديم طلب الاسترداد');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في إلغاء طلب الاسترداد؟')) return;
    try {
      await api.refunds.cancel(id);
      toast.push('success', 'تم إلغاء الطلب بنجاح');
      loadData();
    } catch (e: any) {
      toast.push('error', e.message || 'تعذر إلغاء الطلب');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">استرداد الأموال</h1>
          <p className="mt-1 text-sm text-ink-muted">
            إدارة طلبات استرداد الرسوم ومتابعة تحويلها إلى حسابك البنكي وفق سياسة المنصة
          </p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          disabled={eligibleOrders.length === 0}
        >
          تقديم طلب استرداد جديد
        </Button>
      </div>

      {/* Eligible Orders Callout */}
      {eligibleOrders.length > 0 ? (
        <Card className="border-gold-500/30 bg-gold-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-gold-500/20 text-gold-300 font-bold">
                {eligibleOrders.length}
              </span>
              <div>
                <p className="font-semibold text-gold-200">عمليات دفع مؤهلة للاسترداد</p>
                <p className="text-xs text-ink-muted">
                  لديك طلبات مدفوعة تقع ضمن فترة الأهلية وتستطيع استرداد مبالغها كلياً أو جزئياً
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowModal(true)}>
              عرض والتقديم
            </Button>
          </div>
        </Card>
      ) : (
        <div className="rounded-lg border border-line bg-surface/50 p-4 text-xs text-ink-muted">
          💡 لا توجد حالياً عمليات دفع غير مكتملة أو مؤهلة للاسترداد. إذا كنت تعتقد بوجود خطأ، يرجى التواصل مع الدعم.
        </div>
      )}

      {/* History List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-ink">سجل طلبات الاسترداد</h2>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : refunds.length === 0 ? (
          <EmptyState
            title="لا توجد طلبات استرداد سابقة"
            hint="سجل طلباتك المالية المستردة سيظهر هنا مع التحديثات البنكية"
          />
        ) : (
          <div className="space-y-3">
            {refunds.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gold-300">{r.refundNo}</span>
                      <span className="text-ink-muted">·</span>
                      <span className="text-sm font-semibold">{r.order?.title || `طلب #${r.order?.orderNo}`}</span>
                    </div>
                    <p className="text-xs text-ink-secondary">
                      <span className="font-medium text-ink">سبب الاسترداد:</span> {r.reason}
                    </p>
                    {r.notes && (
                      <p className="text-xs text-ink-muted">
                        <span className="font-medium">ملاحظات إضافية:</span> {r.notes}
                      </p>
                    )}
                    <p className="text-xs text-ink-muted">
                      تاريخ التقديم: {formatDateTime(r.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={REFUND_STATUS_TONE[r.status] || 'gold'}>
                      {REFUND_STATUS_LABELS[r.status] || r.status}
                    </Badge>
                    <div className="text-right">
                      <p className="text-xs text-ink-muted">المبلغ المطلوب</p>
                      <p className="font-mono text-sm font-bold text-ink">{formatMoney(r.amountRequested)}</p>
                    </div>
                    {r.amountApproved != null && r.amountApproved !== r.amountRequested && (
                      <div className="text-right">
                        <p className="text-xs text-teal">المبلغ المعتمد</p>
                        <p className="font-mono text-sm font-bold text-teal">{formatMoney(r.amountApproved)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Audit & Bank Details Details */}
                {(r.rejectionReason || r.transferProofUrl || r.adminNotes) && (
                  <div className="mt-4 rounded-md border border-line bg-elevated/40 p-3 text-xs space-y-1.5">
                    {r.rejectionReason && (
                      <p className="text-coral">
                        <span className="font-bold">سبب الرفض:</span> {r.rejectionReason}
                      </p>
                    )}
                    {r.adminNotes && (
                      <p className="text-ink-secondary">
                        <span className="font-bold">ملاحظات الإدارة:</span> {r.adminNotes}
                      </p>
                    )}
                    {r.transferReferenceNo && (
                      <p className="text-ok">
                        <span className="font-bold">رقم الحوالة البنكية المرجعة:</span>{' '}
                        <span className="font-mono font-bold">{r.transferReferenceNo}</span>
                      </p>
                    )}
                    {r.transferProofUrl && (
                      <a
                        href={r.transferProofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-gold-300 underline hover:text-gold-200 mt-1"
                      >
                        📄 معاينة إشعار التحويل البنكي الرسمي
                      </a>
                    )}
                  </div>
                )}

                {r.status === 'PENDING' && (
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="subtle" onClick={() => handleCancel(r.id)}>
                      إلغاء طلب الاسترداد
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Submit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold">تقديم طلب استرداد مالي</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-ink-muted hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <Form onSubmit={handleSubmit} className="space-y-4">
              <Field label="اختر الطلب المراد استرداد قيمته">
                <select
                  value={orderId}
                  onChange={(e) => handleOrderSelect(e.target.value)}
                  className="w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-ink focus:border-gold-400 focus:outline-none"
                  required
                >
                  <option value="">-- اضغط للاختيار --</option>
                  {eligibleOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} (#{o.orderNo}) — الحد الأقصى: {o.maxRefundable} ريال
                    </option>
                  ))}
                </select>
              </Field>

              {selectedOrder && (
                <div className="rounded-md border border-gold-500/20 bg-gold-500/10 p-3 text-xs text-gold-300 space-y-1">
                  <p>إجمالي قيمة الطلب: {formatMoney(selectedOrder.amount)}</p>
                  <p>الحد الأقصى المتاح للاسترداد: {formatMoney(selectedOrder.maxRefundable)}</p>
                </div>
              )}

              <Field label="المبلغ المطلوب استرداده (ريال)">
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  max={selectedOrder?.maxRefundable}
                  value={amountRequested}
                  onChange={(e) => setAmountRequested(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </Field>

              <Field label="سبب طلب الاسترداد">
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-ink focus:border-gold-400 focus:outline-none mb-2"
                  required
                >
                  <option value="">-- اختر سبب الاسترداد --</option>
                  <option value="عدم ملائمة محتوى الدورة للجدول الدراسي">عدم ملائمة محتوى الدورة للجدول الدراسي</option>
                  <option value="طلب تعديل الخدمة أو تغيير المدرس">طلب تعديل الخدمة أو تغيير المدرس</option>
                  <option value="تم الدفع المزدوج أو بالخطأ">تم الدفع المزدوج أو بالخطأ</option>
                  <option value="ظرف أكاديمي أو شخصي طارئ">ظرف أكاديمي أو شخصي طارئ</option>
                  <option value="سبب آخر">سبب آخر</option>
                </select>
              </Field>

              <Field label="تفاصيل وشرح إضافي">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-ink focus:border-gold-400 focus:outline-none"
                  placeholder="اكتب أي ملاحظات ترغب في توضيحها للمشرف المالي..."
                />
              </Field>

              {/* Bank Details for Refund Transfer */}
              <div className="border-t border-line pt-3 space-y-3">
                <p className="text-xs font-bold text-gold-200">بيانات الحساب البنكي لتحويل المبلغ المسترد:</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="اسم البنك">
                    <Input
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="مثل: مصرف الراجحي"
                    />
                  </Field>
                  <Field label="اسم صاحب الحساب">
                    <Input
                      value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                      placeholder="الاسم الرباعي كما في البنك"
                    />
                  </Field>
                </div>
                <Field label="رقم الآيبان (IBAN)">
                  <Input
                    dir="ltr"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="SA0000000000000000000000"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">
                    🔒 تشفير كامل لبيانات الآيبان بخوارزمية AES-256 ولن تظهر إلا للمسؤول المالي المخول بالتحويل.
                  </p>
                </Field>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="subtle" onClick={() => setShowModal(false)}>
                  إلغاء
                </Button>
                <Button type="submit" loading={submitting}>
                  تأكيد وإرسال الطلب
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      )}
    </div>
  );
}
