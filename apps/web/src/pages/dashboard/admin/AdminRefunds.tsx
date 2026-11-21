import { useState, useEffect } from 'react';
import { api, type RefundRequest } from '../../../lib/api';
import { Card, Badge, Button, Skeleton, EmptyState, Form, Field, Input } from '../../../components/ui';
import { formatMoney, formatDateTime } from '../../../lib/format';
import { useToast } from '../../../lib/toast';

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'coral' | 'teal' | 'gold'> = {
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

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  UNDER_REVIEW: 'تحت المراجعة',
  NEEDS_INFORMATION: 'مطلوب معلومات',
  APPROVED: 'معتمد (بانتظار الصرف)',
  PARTIALLY_APPROVED: 'معتمد جزئياً',
  PROCESSING: 'جاري التحويل',
  REFUNDED: 'تم الاسترداد',
  PARTIALLY_REFUNDED: 'مسترد جزئياً',
  REJECTED: 'مرفوض',
  FAILED: 'فشل التحويل',
  CANCELLED: 'ملغي',
};

export default function AdminRefunds() {
  const toast = useToast();
  const [items, setItems] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modals
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);

  // Review Form
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | 'NEEDS_INFORMATION'>('APPROVED');
  const [amountApproved, setAmountApproved] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // Execute Form
  const [transferProofUrl, setTransferProofUrl] = useState('');
  const [transferReferenceNo, setTransferReferenceNo] = useState('');
  const [executing, setExecuting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.refunds.adminList(statusFilter ? { status: statusFilter } : undefined);
      setItems(res.data || []);
    } catch {
      toast.push('error', 'تعذر تحميل طلبات الاسترداد');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const openReview = (r: RefundRequest) => {
    setSelectedRefund(r);
    setReviewDecision('APPROVED');
    setAmountApproved(String(r.amountRequested));
    setAdminNotes(r.adminNotes || '');
    setRejectionReason('');
    setShowReviewModal(true);
  };

  const openExecute = (r: RefundRequest) => {
    setSelectedRefund(r);
    setTransferProofUrl('');
    setTransferReferenceNo('');
    setShowExecuteModal(true);
  };

  const handleReviewSubmit = async () => {
    if (!selectedRefund) return;
    if (reviewDecision === 'REJECTED' && (!rejectionReason.trim() || rejectionReason.trim().length < 3)) {
      toast.push('error', 'سبب الرفض إلزامي ويجب ألا يقل عن 3 أحرف');
      return;
    }
    const amt = reviewDecision === 'PARTIALLY_APPROVED' ? parseFloat(amountApproved) : undefined;
    if (reviewDecision === 'PARTIALLY_APPROVED' && (isNaN(amt!) || amt! <= 0 || amt! > selectedRefund.amountRequested)) {
      toast.push('error', 'المبلغ المعتمد جزئياً غير صالح');
      return;
    }

    setReviewing(true);
    try {
      await api.refunds.adminReview(selectedRefund.id, {
        decision: reviewDecision,
        amountApproved: amt,
        adminNotes,
        rejectionReason: reviewDecision === 'REJECTED' ? rejectionReason : undefined,
      });
      toast.push('success', 'تمت مراجعة طلب الاسترداد بنجاح');
      setShowReviewModal(false);
      loadData();
    } catch (e: any) {
      toast.push('error', e.message || 'فشل مراجعة الطلب');
    } finally {
      setReviewing(false);
    }
  };

  const handleExecuteSubmit = async () => {
    if (!selectedRefund) return;
    if (!transferProofUrl.trim() || !transferReferenceNo.trim()) {
      toast.push('error', 'رابط إشعار التحويل البنكي والرقم المرجعي مطلوبان');
      return;
    }

    setExecuting(true);
    try {
      await api.refunds.adminExecute(selectedRefund.id, {
        transferProofUrl,
        transferReferenceNo,
      });
      toast.push('success', 'تم توثيق تنفيذ الحوالة البنكية وإتمام الاسترداد بنجاح');
      setShowExecuteModal(false);
      loadData();
    } catch (e: any) {
      toast.push('error', e.message || 'فشل توثيق التحويل البنكي');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إدارة طلبات استرداد أموال الطلاب</h1>
          <p className="mt-1 text-sm text-ink-muted">
            مراجعة طلبات الاسترداد، اعتماد المبالغ، وتوثيق الحوالات البنكية المرجعة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-line bg-elevated px-3 py-1.5 text-xs text-ink focus:border-gold-400 focus:outline-none"
          >
            <option value="">جميع الحالات</option>
            <option value="PENDING">قيد الانتظار</option>
            <option value="APPROVED">معتمد (بانتظار الصرف)</option>
            <option value="PARTIALLY_APPROVED">معتمد جزئياً</option>
            <option value="REFUNDED">تم الاسترداد</option>
            <option value="REJECTED">مرفوض</option>
          </select>
          <Button size="sm" variant="outline" onClick={loadData}>
            تحديث
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : items.length === 0 ? (
          <EmptyState compact title="لا توجد طلبات استرداد" hint="لا توجد طلبات تطابق الفلتر المحدد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-line bg-surface/50 text-xs text-ink-muted">
                <tr>
                  <th className="px-4 py-3 text-start">رقم الطلب</th>
                  <th className="px-4 py-3 text-start">الطالب</th>
                  <th className="px-4 py-3 text-start">تفاصيل الطلب</th>
                  <th className="px-4 py-3 text-start">المبلغ المطلوب / المعتمد</th>
                  <th className="px-4 py-3 text-start">الحالة</th>
                  <th className="px-4 py-3 text-start">التاريخ</th>
                  <th className="px-4 py-3 text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-elevated/30">
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-gold-300">
                      {r.refundNo}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold">{r.student?.fullName || 'طالب'}</p>
                      <p className="font-mono text-xs text-ink-muted">{r.student?.email}</p>
                      {r.student?.whatsapp && <p className="font-mono text-[11px] text-teal" dir="ltr">{r.student.whatsapp}</p>}
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <p className="truncate font-medium">{r.order?.title || `طلب #${r.order?.orderNo}`}</p>
                      <p className="text-xs text-ink-muted truncate" title={r.reason}>
                        السبب: {r.reason}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-mono font-bold text-ink">{formatMoney(r.amountRequested)}</p>
                      {r.amountApproved != null && (
                        <p className="font-mono text-xs text-teal font-semibold">
                          معتمد: {formatMoney(r.amountApproved)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={STATUS_TONES[r.status] || 'gold'}>
                        {STATUS_LABELS[r.status] || r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-ink-muted">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-3.5 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === 'PENDING' && (
                          <Button size="sm" onClick={() => openReview(r)}>
                            مراجعة والبت
                          </Button>
                        )}
                        {(r.status === 'APPROVED' || r.status === 'PARTIALLY_APPROVED') && (
                          <Button size="sm" variant="primary" onClick={() => openExecute(r)}>
                            توثيق الحوالة
                          </Button>
                        )}
                        {r.transferProofUrl && (
                          <a
                            href={r.transferProofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-elevated text-xs text-gold-300 hover:text-gold-200"
                            title="عرض سند التحويل البنكي"
                          >
                            📄
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review Modal */}
      {showReviewModal && selectedRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold">مراجعة طلب الاسترداد {selectedRefund.refundNo}</h3>
              <button onClick={() => setShowReviewModal(false)} className="text-ink-muted hover:text-ink text-sm font-bold">✕</button>
            </div>

            <div className="mb-4 rounded-md border border-line bg-elevated/40 p-3 text-xs space-y-1">
              <p><span className="text-ink-muted">الطالب:</span> {selectedRefund.student?.fullName} ({selectedRefund.student?.email})</p>
              <p><span className="text-ink-muted">الطلب الأصلي:</span> {selectedRefund.order?.title} ({formatMoney(selectedRefund.order?.amount || 0)})</p>
              <p><span className="text-ink-muted">المبلغ المطلوب:</span> <b className="font-mono text-gold-200">{formatMoney(selectedRefund.amountRequested)}</b></p>
              <p><span className="text-ink-muted">سبب الاسترداد:</span> {selectedRefund.reason}</p>
              {selectedRefund.notes && <p><span className="text-ink-muted">ملاحظات الطالب:</span> {selectedRefund.notes}</p>}
            </div>

            <Form onSubmit={handleReviewSubmit} className="space-y-4">
              <Field label="قرار المراجعة">
                <select
                  value={reviewDecision}
                  onChange={(e) => setReviewDecision(e.target.value as any)}
                  className="w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-ink focus:border-gold-400 focus:outline-none"
                >
                  <option value="APPROVED">اعتماد كامل المبلغ ({formatMoney(selectedRefund.amountRequested)})</option>
                  <option value="PARTIALLY_APPROVED">اعتماد جزئي (تحديد مبلغ أقل)</option>
                  <option value="NEEDS_INFORMATION">طلب معلومات إضافية من الطالب</option>
                  <option value="REJECTED">رفض طلب الاسترداد</option>
                </select>
              </Field>

              {reviewDecision === 'PARTIALLY_APPROVED' && (
                <Field label="المبلغ المعتمد جزئياً (ريال)">
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    max={selectedRefund.amountRequested}
                    value={amountApproved}
                    onChange={(e) => setAmountApproved(e.target.value)}
                    required
                  />
                </Field>
              )}

              {reviewDecision === 'REJECTED' && (
                <Field label="سبب الرفض (إلزامي)">
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-coral/50 bg-elevated px-3 py-2 text-sm text-ink focus:outline-none"
                    placeholder="وضح للطالب سبب رفض الاسترداد وفق سياسة المنصة..."
                    required
                  />
                </Field>
              )}

              <Field label="ملاحظات إدارية داخلية (اختياري)">
                <Input
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="ملاحظات لا تظهر إلا للإدارة المالية..."
                />
              </Field>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="subtle" onClick={() => setShowReviewModal(false)}>
                  إلغاء
                </Button>
                <Button type="submit" loading={reviewing}>
                  تأكيد القرار
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      )}

      {/* Execute Modal */}
      {showExecuteModal && selectedRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold">توثيق تنفيذ الحوالة البنكية المستردة</h3>
              <button onClick={() => setShowExecuteModal(false)} className="text-ink-muted hover:text-ink text-sm font-bold">✕</button>
            </div>

            <div className="mb-4 rounded-md border border-teal-500/20 bg-teal-500/10 p-3 text-xs space-y-1 text-teal">
              <p>المبلغ المعتمد للتحويل: <b className="font-mono font-bold text-sm">{formatMoney(selectedRefund.amountApproved || selectedRefund.amountRequested)}</b></p>
              <p>⚠️ بعد تأكيد هذا النموذج ورفع سند التحويل، سيتم تحويل حالة الطلب إلى مسترد وإلغاء تسجيل الطالب في المقرر/الخدمة تلقائياً.</p>
            </div>

            <Form onSubmit={handleExecuteSubmit} className="space-y-4">
              <Field label="الرقم المرجعي للحوالة البنكية (Reference No)">
                <Input
                  value={transferReferenceNo}
                  onChange={(e) => setTransferReferenceNo(e.target.value)}
                  placeholder="رقم العملية الصادر من تطبيق البنك"
                  required
                />
              </Field>

              <Field label="رابط أو مسار صورة إشعار التحويل البنكي">
                <Input
                  value={transferProofUrl}
                  onChange={(e) => setTransferProofUrl(e.target.value)}
                  placeholder="https://... أو /uploads/..."
                  required
                />
              </Field>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button type="button" variant="subtle" onClick={() => setShowExecuteModal(false)}>
                  إلغاء
                </Button>
                <Button type="submit" loading={executing}>
                  تأكيد التنفيذ وسحب الصلاحية
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      )}
    </div>
  );
}
